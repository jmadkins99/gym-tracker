        // The cut plan — a direct port of the "2026 September – November Cut
        // Plan" sheet's columns, which all three plan sheets in the workbook
        // share: a straight target line dropping `ratePerWeek` from a starting
        // weight, the actual weekly average beside it, and the running total of
        // what has come off against what was promised.
        //
        // Everything here runs on WEEKLY AVERAGES, not on the EMA trend the
        // check-in card shows. That is deliberate and it is what the
        // spreadsheet did: the plan is a week-by-week ledger, its rows have to
        // be comparable with the rows in the sheet they replace, and the mean
        // of a week's readings is the figure Josh has been reading for two
        // years. The EMA stays what it was — the live daily signal — and the
        // two answer different questions rather than competing.
        //
        // Note what this module does NOT do. It reports the gap to the plan and
        // stops there: no re-baselining prompt, no verdict. Two of the three
        // sheets it replaces are titled "FAILED", and an app that says so out
        // loud would only be automating that.

        // Hardcoded from the workbook's active sheet. Editable in Settings; a
        // saved plan overrides this.
        const DEFAULT_CUT_PLAN = {
            name: '2026 September – November Cut',
            startDate: '2026-08-24',  // Monday of week 0
            startWeight: 170,         // week 0 actual, per the sheet
            goalWeight: 145,          // the sheet's 25 lb goal, as a weight
            ratePerWeek: 2,           // the plan line's slope
            weeks: 12,
        };

        const MS_PER_WEEK = 7 * 86400000;

        // The goal is stored as a WEIGHT, and the pounds-to-lose figure is
        // derived from it. That is the way round the spreadsheet's own TDEE
        // block had it ("Goal Weight: 140.0") even though its cut-plan tab
        // tracked the difference, and it is the number that does not go stale:
        // a goal weight stays true across a re-baseline, whereas "25 lb to
        // lose" silently means something different once the starting weight
        // moves.
        //
        // Plans saved before the switch carry `goalPounds` instead. Normalizing
        // on read rather than migrating in place keeps the conversion in one
        // expression and means an older export still imports cleanly.
        function normalizePlan(plan) {
            if (!plan) return null;
            if (typeof plan.goalWeight === 'number') return plan;
            if (typeof plan.goalPounds === 'number') {
                return Object.assign({}, plan, { goalWeight: plan.startWeight - plan.goalPounds });
            }
            return plan;
        }

        function planGoalPounds(plan) {
            return plan.startWeight - plan.goalWeight;
        }

        // The target line at week `i`. Week 0 is the starting weight itself,
        // matching the sheet, where the Estimated column is blank on row 0 and
        // starts from the week-0 actual.
        function planWeightForWeek(plan, i) {
            return plan.startWeight - plan.ratePerWeek * i;
        }

        // Continuous version, for drawing the line between week boundaries.
        // Clamped at both ends so the plan is flat before it starts and after
        // it is due to finish rather than shooting off in either direction.
        function planWeightAtDate(plan, date) {
            const weeksIn = (parseDayKey(localDayKey(date)) - parseDayKey(plan.startDate)) / MS_PER_WEEK;
            return planWeightForWeek(plan, Math.max(0, Math.min(plan.weeks, weeksIn)));
        }

        // Whole weeks elapsed since the plan's start, by Monday. Can exceed
        // `plan.weeks` — a plan you have run past is not an error state, and
        // the UI says "week 14 of 12" rather than pretending it ended.
        function planWeekIndex(plan, dayKey) {
            const from = parseDayKey(plan.startDate);
            const to = getMondayOfWeek(parseDayKey(dayKey));
            return Math.round((to - from) / MS_PER_WEEK);
        }

        // The ledger: one row per plan week, joined to whatever weekly average
        // the log has for it. `actual` is null for a week with no check-ins —
        // an absent week, not a zero — and `delta` is measured against the
        // previous week that HAS data, so a week away from the scale does not
        // manufacture a huge swing on the week after it.
        function planRows(plan, log) {
            const byWeek = new Map(weeklyAverages(log).map((w) => [w.weekStart, w]));
            const rows = [];
            let prevActual = null;
            let cumulative = 0;

            for (let i = 0; i <= plan.weeks; i++) {
                const start = parseDayKey(plan.startDate);
                start.setDate(start.getDate() + i * 7);
                const weekStart = localDayKey(start);
                const wk = byWeek.get(weekStart);
                const actual = wk ? wk.avg : null;

                let delta = null;
                if (actual !== null && prevActual !== null) {
                    delta = actual - prevActual;
                    cumulative += delta;
                }
                if (actual !== null) prevActual = actual;

                rows.push({
                    week: i,
                    weekStart,
                    planWeight: i === 0 ? plan.startWeight : planWeightForWeek(plan, i),
                    actual,
                    count: wk ? wk.count : 0,
                    delta,
                    cumulative: actual !== null ? cumulative : null,
                });
            }
            return rows;
        }

        // Everything the dashboard shows, in one pass.
        //
        // `actual` is the latest week that HAS data rather than strictly the
        // current week, so the card still reads sensibly on a Monday morning
        // before that week's first check-in has landed.
        function planProgress(rawPlan, log, todayKey) {
            const plan = normalizePlan(rawPlan);
            if (!plan) return null;

            const rows = planRows(plan, log);
            const weekIndex = planWeekIndex(plan, todayKey);
            const withData = rows.filter((r) => r.actual !== null);
            const latest = withData.length ? withData[withData.length - 1] : null;

            const actual = latest ? latest.actual : plan.startWeight;
            const lost = plan.startWeight - actual;
            const goalPounds = planGoalPounds(plan);
            const toGo = goalPounds - lost;
            const goalWeight = plan.goalWeight;

            // The plan line at the CURRENT week, even if this week has no
            // readings yet — the gap is "where should I be today", and today
            // does not stop happening because the scale went unused.
            const planWeight = planWeightForWeek(plan, Math.max(0, Math.min(plan.weeks, weekIndex)));
            const gap = actual - planWeight;

            // Mean weekly change over the weeks that have one, which is the
            // sheet's AVERAGE(E3:E14). Negative means coming down.
            const deltas = rows.map((r) => r.delta).filter((d) => d !== null);
            const avgRate = deltas.length ? deltas.reduce((s, d) => s + d, 0) / deltas.length : null;

            // Projected finish at the rate actually being achieved, not the
            // planned one. Null when the rate is flat or rising — an
            // extrapolation to "never" is not a date, and printing one would be
            // a lie dressed as arithmetic.
            let projectedFinish = null;
            if (avgRate !== null && avgRate < -0.05 && toGo > 0) {
                const weeksLeft = toGo / -avgRate;
                const finish = parseDayKey(todayKey);
                finish.setDate(finish.getDate() + Math.round(weeksLeft * 7));
                projectedFinish = { date: localDayKey(finish), weeksLeft };
            }

            return {
                plan, rows, weekIndex, actual, lost, toGo, goalWeight, goalPounds,
                planWeight, gap, avgRate, projectedFinish,
                latestWeekStart: latest ? latest.weekStart : null,
                // Guarded: a goal weight at or above the start weight makes
                // goalPounds zero or negative, and the bar has no meaning to
                // draw. Settings rejects that, but a hand-edited import can
                // still arrive with it.
                pct: goalPounds > 0 ? Math.max(0, Math.min(1, lost / goalPounds)) : 0,
                // Target date the plan itself implies, as opposed to the
                // projection above.
                targetDate: (() => {
                    const end = parseDayKey(plan.startDate);
                    end.setDate(end.getDate() + plan.weeks * 7);
                    return localDayKey(end);
                })(),
            };
        }

        function formatMonthDay(dayKey) {
            return parseDayKey(dayKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
