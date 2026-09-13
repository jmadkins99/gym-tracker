        // All the arithmetic behind the weight page. Kept apart from the
        // components on purpose: every number the UI shows is derived here, so
        // the rules about what is and isn't displayable live in one readable
        // place rather than scattered through JSX.
        //
        // This page used to be built around a rule that no historical raw
        // reading could be handed back: everything downstream of the log read
        // an exponential moving average instead, and the chart drew that
        // smoothed line. The rule is gone, deliberately. The chart plots the
        // readings themselves and the scrubber reads them off, because a
        // smoothed line answers "roughly which way am I going" and the question
        // being asked of this page is "what did the scale actually say".
        //
        // What replaced the EMA as the page's steady number is the WEEKLY
        // AVERAGE: `weeklyAverages` and the two functions built on it are what
        // the check-in card and the ledger both show, so the smoothing that
        // remains is an honest mean over a week rather than a decay constant.
        // Nothing here computes an average twice — `currentWeekAverage` and
        // `weeklyAverageRate` read out of the same buckets the ledger renders,
        // which is what stops the card and the History screen disagreeing.

        // A day key is the LOCAL calendar date, not a UTC slice of an ISO
        // string. Those differ for anyone west of Greenwich for part of every
        // day, and a weigh-in is an event on your calendar rather than on
        // UTC's — a 9pm Pacific check-in sliced out of toISOString() lands on
        // tomorrow and silently breaks the streak.
        function localDayKey(date) {
            const d = date instanceof Date ? date : new Date(date);
            const pad = (n) => String(n).padStart(2, '0');
            return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        }

        // Inverse of the above: back to local midnight, again avoiding the UTC
        // trap that `new Date('2026-09-07')` falls into.
        function parseDayKey(key) {
            const parts = String(key).split('-').map(Number);
            return new Date(parts[0], parts[1] - 1, parts[2]);
        }

        function sortedLog(log) {
            return (log || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        }

        function entryFor(log, dayKey) {
            return (log || []).find((e) => e.date === dayKey) || null;
        }

        // Writes one check-in, replacing any existing entry for that day. A
        // second weigh-in on the same date is a correction, not a data point:
        // two readings hours apart differ mostly by breakfast, and letting both
        // into the series would weight that day double.
        function upsertEntry(log, dayKey, weight) {
            const rest = (log || []).filter((e) => e.date !== dayKey);
            rest.push({ date: dayKey, weight, loggedAt: new Date().toISOString() });
            return sortedLog(rest);
        }

        // Corrects a day that is already in the log. Deliberately not the same
        // call as upsertEntry, for one reason: `loggedAt` is left alone and an
        // `editedAt` stamp is added beside it. The original records when the
        // scale was actually stood on, which is a fact a later correction does
        // not get to overwrite.
        //
        // A day with no entry is left untouched rather than created. Typing a
        // weight for a morning that has already passed is a different act from
        // fixing a mistyped one, and the history screen only offers the second.
        function editEntry(log, dayKey, weight) {
            return sortedLog((log || []).map((e) => (
                e.date === dayKey
                    ? Object.assign({}, e, { weight, editedAt: new Date().toISOString() })
                    : e
            )));
        }

        // Fills in a morning that was never recorded. The third mutator, and
        // deliberately not a fourth spelling of the other two.
        //
        // upsertEntry stamps `loggedAt` with the current time because it runs
        // the moment the scale is stood on. This one cannot: the morning it
        // records has already passed, so there is no honest value for when the
        // reading was taken, and writing `now` would put a lie in the one field
        // the rest of this file refuses to overwrite. It stamps `addedAt`
        // instead and leaves `loggedAt` absent — the same distinction the log
        // already draws with `imported` on the workbook days, a weight that is
        // true without being a morning anybody witnessed.
        //
        // A day that already has an entry is left untouched. Overwriting from
        // here would make the NA affordance a second edit path with no
        // confirmation and no Delete beside it, which is editEntry's job.
        function addEntry(log, dayKey, weight) {
            if (entryFor(log, dayKey)) return sortedLog(log || []);
            return sortedLog((log || []).concat([
                { date: dayKey, weight, addedAt: new Date().toISOString() },
            ]));
        }

        // Drops a day from the log. The escape hatch for a reading that should
        // never have been recorded at all — a second person on the scale, a
        // number typed into the wrong day — as opposed to one that is merely
        // wrong, which is what editEntry is for.
        function removeEntry(log, dayKey) {
            return sortedLog((log || []).filter((e) => e.date !== dayKey));
        }

        // One week of the ledger as seven SLOTS: every day the week covers,
        // newest first, each carrying its entry or null. A slot with an entry
        // is a reading to correct; a slot without one renders as NA and is
        // somewhere to fill in a morning that was never recorded.
        //
        // This is the one function that hands back historical raw weights, and
        // it exists for corrections. The history screen keeps that narrow: the
        // days are collapsed until a specific week is opened, so the page still
        // opens on aggregates and there is still no view that scrolls back
        // through dailies. It replaced `entriesForWeek`, which returned only
        // the readings — one function rather than two so a row and its days
        // cannot disagree about which week a date falls in, the same reason
        // flatWeekStarts defers to weeklyAverages.
        //
        // Two kinds of day are withheld, for the same reason — a slot is an
        // invitation to fill it in, and neither of these is a morning the scale
        // could have been stood on:
        //   - anything after `todayKey`, which has not happened yet. Without
        //     this the week in progress offers blanks for the rest of the week.
        //   - anything before the log's first reading, which predates the
        //     record entirely. This one only bites on the opening week of an
        //     imported log, but there it matters: with nothing to anchor it the
        //     first week would invite backfill into the days before tracking
        //     began.
        //
        // A week with no readings at all never reaches here, because the ledger
        // is built from weeklyAverages and those weeks are absent from it. So
        // one forgotten morning can be filled in and an entirely missed week
        // cannot — a deliberate limit, not an oversight.
        function weekDaySlots(log, weekStart, todayKey) {
            const series = sortedLog(log);
            const first = series.length ? series[0].date : null;
            const byDate = new Map(series.map((e) => [e.date, e]));
            const today = todayKey || localDayKey(new Date());
            const slots = [];
            for (let i = 0; i < 7; i++) {
                const d = parseDayKey(weekStart);
                d.setDate(d.getDate() + i);
                const key = localDayKey(d);
                // Day keys are ISO, so lexicographic order is date order.
                if (key > today) continue;
                if (first && key < first) continue;
                slots.push({ date: key, entry: byDate.get(key) || null });
            }
            return slots.reverse();
        }

        // The weeks that were typed in rather than weighed. Both badges treat
        // one of these as a wall: a run of readings that never varied is not a
        // run that was earned, and neither streak may be built on top of it or
        // carried through it.
        //
        // Derived from `weeklyAverages` rather than re-bucketed here, so there
        // is exactly one answer in the codebase to what week a day falls in.
        function flatWeekStarts(log) {
            return new Set(weeklyAverages(log).filter((w) => w.flat).map((w) => w.weekStart));
        }

        // Consecutive days you stood on the scale, ending today. This is the
        // daily badge and it is about ADHERENCE, not about the number.
        //
        // It used to reward a reading that held or fell against the one before,
        // which is a coin flip on water, salt and glycogen: it paid out for
        // being dehydrated on a Tuesday and broke on a legitimate refeed. Run
        // over Josh's real history that rule broke 285 times in 729 days, and
        // every softer version of it — a trailing average, a tolerance band —
        // either broke MORE often or could be held indefinitely while gaining a
        // pound a week. Weight moves in cycles, so any daily rule about the
        // number spends long stretches at zero, and it goes darkest during a
        // regain, which is exactly when there is most reason to keep logging.
        //
        // So the badge rewards the part that is a choice. Whether the scale is
        // kind on a given morning is not one; standing on it is. The weekly
        // badge still carries "is this working", at the only timescale where
        // that question has an honest answer.
        //
        // A missed day ends the run — consecutive means consecutive — and so
        // does letting it go stale: if the last reading is older than
        // yesterday, the streak has already been broken and the badge says
        // nothing. Yesterday still counts as live so the card can show what
        // today's check-in is about to extend.
        //
        // Days inside a flat week are typed-in history rather than mornings
        // anyone showed up for, and cannot be credited as adherence.
        function checkInStreak(log, todayKey) {
            const series = sortedLog(log);
            if (series.length === 0) return 0;

            const flat = flatWeekStarts(series);
            const today = todayKey || localDayKey(new Date());
            const dayBefore = (key) => {
                const d = parseDayKey(key);
                d.setDate(d.getDate() - 1);
                return localDayKey(d);
            };

            const last = series[series.length - 1];
            if (last.date !== today && last.date !== dayBefore(today)) return 0;

            let streak = 0;
            let expected = last.date;
            for (let i = series.length - 1; i >= 0; i--) {
                if (series[i].date !== expected) break;
                if (flat.has(localDayKey(getMondayOfWeek(parseDayKey(series[i].date))))) break;
                streak++;
                expected = dayBefore(expected);
            }
            return streak;
        }

        // One row per calendar week that has at least one check-in, oldest
        // first. `avg` is the plain mean of that week's readings — the weekly
        // ledger is the one place a mean beats the EMA, because a week is a
        // fixed bucket you already think in, and averaging seven days does the
        // same noise-cancelling job there that alpha does on the running line.
        //
        // Weeks with no check-ins are absent rather than zero-filled, so the
        // streak below compares against the previous *recorded* week: a week
        // away from the scale pauses the streak rather than ending it.
        function weeklyAverages(log) {
            const buckets = new Map();
            sortedLog(log).forEach((e) => {
                const key = localDayKey(getMondayOfWeek(parseDayKey(e.date)));
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push(e.weight);
            });
            return Array.from(buckets.entries())
                .sort((a, b) => (a[0] < b[0] ? -1 : 1))
                .map((pair) => ({
                    weekStart: pair[0],
                    count: pair[1].length,
                    avg: pair[1].reduce((s, w) => s + w, 0) / pair[1].length,
                    // A full seven days on which the scale never moved by so
                    // much as a tenth. Real mornings do not do this; typed-in
                    // history does, which is the whole reason the flag exists.
                    // Six matching days and a seventh that differs is a real
                    // week, and so is a partial week of matching readings —
                    // the test is deliberately the narrowest one that still
                    // catches a bootstrapped week.
                    flat: pair[1].length === 7 && pair[1].every((w) => w === pair[1][0]),
                }));
        }

        // The average for the week in progress — the same number the top row of
        // the History ledger shows, because it comes from the same buckets. The
        // check-in card and the ledger must never disagree about this week; the
        // way to guarantee that is to read it off `weeklyAverages` rather than
        // computing a second version of the arithmetic here.
        //
        // Partial by construction: on a Tuesday it is the mean of Monday and
        // Tuesday. That is the honest number for a week that has not finished.
        function currentWeekAverage(log) {
            const weeks = weeklyAverages(log);
            return weeks.length ? weeks[weeks.length - 1].avg : null;
        }

        // Pounds per week, as the difference between this week's average and the
        // one before it. Already a per-week figure by construction, so nothing
        // is scaled: it is the same subtraction the History week rows print as
        // their delta, and the card must not disagree with the ledger about it.
        //
        // Normalised by the gap between the two buckets so a skipped week does
        // not get reported as one week's loss. With no gap — the ordinary case —
        // the divisor is 1 and this is exactly the ledger's delta.
        //
        // Null until a second week exists. A first week has nothing to be a
        // change from, and inventing one would put a number on screen that is
        // really just "you weigh what you weigh".
        function weeklyAverageRate(log) {
            const weeks = weeklyAverages(log);
            if (weeks.length < 2) return null;
            const current = weeks[weeks.length - 1];
            const prior = weeks[weeks.length - 2];
            const spanWeeks = Math.round(
                (parseDayKey(current.weekStart) - parseDayKey(prior.weekStart)) / (7 * 86400000)
            );
            if (spanWeeks < 1) return null;
            return (current.avg - prior.avg) / spanWeeks;
        }

        // Consecutive most-recent weeks whose average came in below the week
        // before. Unlike the daily streak the first week cannot count: a week
        // with no predecessor has not gone down, it has merely happened.
        //
        // The current week is included while it is still in progress, so the
        // badge is live rather than a Monday-morning verdict. That does mean it
        // can appear midweek and withdraw again — the honest reflection of a
        // partial week, and the reason it is worded as a streak of weeks rather
        // than as a record that has been banked.
        function weekStreak(weeks) {
            let streak = 0;
            for (let i = (weeks || []).length - 1; i >= 1; i--) {
                // A flat week neither scores nor can be scored against: the
                // week after one starts from nothing, exactly as the first week
                // of all does.
                if (weeks[i].flat || weeks[i - 1].flat) break;
                if (weeks[i].avg < weeks[i - 1].avg) streak++;
                else break;
            }
            return streak;
        }

        // The readings for the chart. `days` trims to a recent window; omitting
        // it returns the whole history.
        //
        // The window is inclusive of both ends, so it reaches back days-1 from
        // the last reading: a 7-day window is the last reading plus the six
        // before it, not seven days before it as well. Subtracting the full
        // `days` returns eight, which nobody would call a week — and the range
        // average prints that count, so the off-by-one was on screen.
        function readingSeries(log, days) {
            const series = sortedLog(log);
            if (series.length === 0 || !days) return series;
            const lastDate = parseDayKey(series[series.length - 1].date);
            const cutoff = new Date(lastDate);
            cutoff.setDate(cutoff.getDate() - (days - 1));
            return series.filter((e) => parseDayKey(e.date) >= cutoff);
        }

        // Mean of the RAW readings inside a range window, plus how many there
        // were. An aggregate over a window, which is the same kind of number
        // the weekly rows already show — the rule this page keeps is that no
        // individual morning's reading is recallable, not that averages are
        // off-limits. `count` rides along because "169.4 lb over 3 days" and
        // "169.4 lb over 180 days" are not the same claim.
        function rangeAverage(log, days) {
            const pts = readingSeries(log, days);
            if (pts.length === 0) return null;
            return {
                avg: pts.reduce((s, p) => s + p.weight, 0) / pts.length,
                count: pts.length,
            };
        }

        function formatWeight(n) {
            return (Math.round(n * 10) / 10).toFixed(1);
        }

        function formatDayLabel(dayKey) {
            return parseDayKey(dayKey).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
            });
        }

        function formatShortDay(dayKey) {
            return parseDayKey(dayKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
