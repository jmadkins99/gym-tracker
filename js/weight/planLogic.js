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
        // Weeks are numbered from 1, which is a deliberate departure from the
        // sheet. The sheet opened with a row 0 whose target was just the
        // starting weight, because a spreadsheet needs somewhere to put the
        // baseline; the effect was that a 12-week plan had thirteen rows and
        // the week you actually began dieting asked nothing of you. Here the
        // start weight is the anchor rather than a week, week 1 is the first
        // week you are chasing something, and a 12-week plan has twelve rows.
        //
        // What a week's target MEANS follows from that: `planWeightForWeek(n)`
        // is where the line has arrived by the END of week n — the number to be
        // at or under when that week closes, not where you should already be on
        // its Monday. Both are Monday boundaries either way; this is the one
        // that reads as a goal to beat rather than as a verdict on a week that
        // has barely started.
        //
        // Note what this module does NOT do. It reports the gap to the plan and
        // stops there: no re-baselining prompt, no verdict. Two of the three
        // sheets it replaces are titled "FAILED", and an app that says so out
        // loud would only be automating that.

        // Hardcoded from the workbook's active sheet. Editable in Settings; a
        // saved plan overrides this.
        const DEFAULT_CUT_PLAN = {
            name: '2026 September – November Cut',
            startDate: '2026-08-24',  // Monday week 1 starts on
            startWeight: 170,         // the weight it starts from, per the sheet
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

        // The target line at week `i`: where the plan has arrived by the end of
        // that week, and so the number to beat during it. Week 1 already asks
        // for a week's worth of loss, which is the point — the first week of a
        // cut is a week of dieting like any other. `i` of 0 is the start weight
        // and is the plan's anchor rather than a week of its own.
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

        // Which plan week a day falls in, counting from 1 on the plan's own
        // starting Monday. Can exceed `plan.weeks` — a plan you have run past
        // is not an error state, and the UI says so rather than pretending it
        // ended. Can also come out below 1, for a plan whose start date is
        // still in the future.
        function planWeekNumber(plan, dayKey) {
            const from = parseDayKey(plan.startDate);
            const to = getMondayOfWeek(parseDayKey(dayKey));
            return Math.round((to - from) / MS_PER_WEEK) + 1;
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

            for (let i = 1; i <= plan.weeks; i++) {
                const start = parseDayKey(plan.startDate);
                start.setDate(start.getDate() + (i - 1) * 7);
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
                    planWeight: planWeightForWeek(plan, i),
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
            const weekNumber = planWeekNumber(plan, todayKey);
            const withData = rows.filter((r) => r.actual !== null);
            const latest = withData.length ? withData[withData.length - 1] : null;

            const actual = latest ? latest.actual : plan.startWeight;
            const lost = plan.startWeight - actual;
            const goalPounds = planGoalPounds(plan);
            const toGo = goalPounds - lost;
            const goalWeight = plan.goalWeight;

            // This week's target, even if this week has no readings yet — the
            // number you are chasing does not stop being the number you are
            // chasing because the scale went unused. Clamped to the plan's own
            // span so a plan not yet started shows week 1's target and one run
            // past its end keeps showing its last.
            const planWeight = planWeightForWeek(plan, Math.max(1, Math.min(plan.weeks, weekNumber)));
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
                plan, rows, weekNumber, actual, lost, toGo, goalWeight, goalPounds,
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
