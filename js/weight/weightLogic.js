        // All the arithmetic behind the weight page. Kept apart from the
        // components on purpose: every number the UI shows is derived here, so
        // the rules about what is and isn't displayable live in one readable
        // place rather than scattered through JSX.
        //
        // The governing constraint is that this page is built to be safe to use
        // daily without turning into a scale-watching loop. That is not a
        // styling choice, it is a data choice: nothing in here can hand back a
        // historical raw weight. `withTrend` is the only function that touches
        // the raw series, and everything downstream consumes the smoothed
        // value. Today's own reading is exposed by `entryFor` alone, because a
        // number you cannot see is a number you cannot correct.

        // How far each new reading pulls the trend toward itself. 0.25 is
        // roughly a one-week time constant: a single salty-dinner spike moves
        // the line about a quarter pound per pound of noise and is gone within
        // days, while a genuine week-long drift comes through nearly in full.
        // Lower is smoother but laggier; below ~0.1 the line stops responding
        // to real change fast enough to be worth checking daily.
        const TREND_ALPHA = 0.25;

        // Days of trend the rate calculation looks back over.
        const RATE_WINDOW_DAYS = 14;

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

        // The raw series with an exponential trend attached to each point.
        // Seeded at the first reading rather than at zero, so the line is
        // meaningful from day one instead of spending a fortnight climbing up
        // out of nothing.
        //
        // Missed days need no special handling and deliberately get none: the
        // trend is a running value, not a windowed one, so a gap simply means
        // no update happened. This is the whole reason for choosing an EMA over
        // a 7-day mean — a mean has to decide what an absent day is worth, and
        // every available answer to that is wrong.
        function withTrend(log) {
            let trend = null;
            return sortedLog(log).map((e) => {
                trend = trend === null ? e.weight : trend + TREND_ALPHA * (e.weight - trend);
                return { date: e.date, weight: e.weight, trend };
            });
        }

        function currentTrend(log) {
            const series = withTrend(log);
            return series.length ? series[series.length - 1].trend : null;
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

        // Pounds per week, read off the TREND rather than off the raw readings,
        // over the last fortnight. Returns null rather than a shaky number when
        // the data cannot support one — a rate computed from three days of
        // water weight is noise wearing a decimal point, and showing it would
        // invite exactly the daily over-reading this page exists to avoid.
        function weeklyRate(log) {
            const series = withTrend(log);
            if (series.length < 4) return null;

            const last = series[series.length - 1];
            const lastDate = parseDayKey(last.date);
            const cutoff = new Date(lastDate);
            cutoff.setDate(cutoff.getDate() - RATE_WINDOW_DAYS);

            const inWindow = series.filter((e) => parseDayKey(e.date) >= cutoff);
            if (inWindow.length < 4) return null;

            const first = inWindow[0];
            const days = (lastDate - parseDayKey(first.date)) / 86400000;
            if (days < 5) return null;

            return ((last.trend - first.trend) / days) * 7;
        }

        // Trend points for the sparkline. `days` trims to a recent window;
        // omitting it returns the whole history.
        function trendSeries(log, days) {
            const series = withTrend(log);
            if (series.length === 0 || !days) return series;
            const lastDate = parseDayKey(series[series.length - 1].date);
            const cutoff = new Date(lastDate);
            cutoff.setDate(cutoff.getDate() - days);
            return series.filter((e) => parseDayKey(e.date) >= cutoff);
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
