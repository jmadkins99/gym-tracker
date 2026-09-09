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

        // Drops a day from the log. The escape hatch for a reading that should
        // never have been recorded at all — a second person on the scale, a
        // number typed into the wrong day — as opposed to one that is merely
        // wrong, which is what editEntry is for.
        function removeEntry(log, dayKey) {
            return sortedLog((log || []).filter((e) => e.date !== dayKey));
        }

        // The raw readings inside one week of the ledger, newest first, keyed
        // by the same Monday `weeklyAverages` buckets on so a row and its
        // entries cannot disagree about which week a day belongs to.
        //
        // This is the one function that hands back historical raw weights, and
        // it exists for corrections. The history screen keeps that narrow: the
        // days are collapsed until a specific week is opened, so the page still
        // opens on aggregates and there is still no view that scrolls back
        // through dailies.
        function entriesForWeek(log, weekStart) {
            return sortedLog(log)
                .filter((e) => localDayKey(getMondayOfWeek(parseDayKey(e.date))) === weekStart)
                .reverse();
        }

        // Consecutive most-recent check-ins that each came in at or below the
        // one before. This is the daily badge, and it is a Cut-goal rule:
        // equal holds the streak, higher ends it.
        //
        // The very first check-in ever has nothing to compare against, so it
        // counts — there is no reading it could have failed to beat.
        function checkInStreak(log) {
            const series = sortedLog(log);
            let streak = 0;
            for (let i = series.length - 1; i >= 0; i--) {
                if (i === 0) { streak++; break; }
                if (series[i].weight <= series[i - 1].weight) streak++;
                else break;
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
