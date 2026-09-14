        // The cut plan — a direct port of the "2026 September – November Cut
        // Plan" sheet's columns, which all three plan sheets in the workbook
        // share: a straight target line dropping `ratePerWeek` from a starting
        // weight, the actual weekly average beside it, and the running total of
        // what has come off against what was promised.
        //
        // Everything here runs on WEEKLY AVERAGES. That is what the
        // spreadsheet did: the plan is a week-by-week ledger, its rows have to
        // be comparable with the rows in the sheet they replace, and the mean
        // of a week's readings is the figure Josh has been reading for two
        // years. The check-in card now shows that same weekly figure, so the
        // plan and the card no longer answer in different currencies — an
        // earlier version of this file had to explain why they differed.
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
        //
        // Its four numbers agree, which the sheet's did not: 25 lb at 2 lb/wk is
        // twelve and a half weeks, and the sheet rounded that DOWN to 12, so its
        // last row asked for 146 while its header promised 145. Thirteen weeks
        // is the same plan with the fractional week it always needed — the same
        // rounding the editor now does when it solves for a length.
        const DEFAULT_CUT_PLAN = {
            name: '2026 September – November Cut',
            startDate: '2026-08-24',  // Monday week 1 starts on
            startWeight: 170,         // the weight it starts from, per the sheet
            goalWeight: 145,          // the sheet's 25 lb goal, as a weight
            ratePerWeek: 2,           // the plan line's slope
            weeks: 13,                // 25 lb at 2 lb/wk, rounded up to whole Mondays
            solveFor: 'weeks',        // and so the field the editor opens on
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

        // The plan's four numbers are over-determined: start, goal, rate and
        // length state the same line twice, and any three of them fix the
        // fourth. Typing all four is how a plan ends up asking for 40 lb while
        // reporting against 30 — the line runs off `ratePerWeek * weeks` and
        // the progress bar off `goalWeight`, so a disagreement between them is
        // silent and permanent.
        //
        // So the editor solves for one of the three (start weight is a fact
        // rather than a choice, and is always an input) and this is where that
        // arithmetic lives. `values` carries the other three as numbers, with
        // the solved-for one null; null comes back when they cannot answer.
        //
        // Weeks is the one that rounds, because it is a count of Mondays and
        // 30 lb at 2.8 lb/wk is not ten and a bit weeks of dieting. It rounds
        // UP so the plan reaches the goal rather than stopping just short,
        // which leaves the last week's target a little under the goal weight —
        // the residue of a rate that does not divide, and the direction to err
        // in.
        function derivePlanField(solveFor, values) {
            const start = values.startWeight;
            const goal = values.goalWeight;
            const rate = values.ratePerWeek;
            const weeks = values.weeks;
            const known = (n) => typeof n === 'number' && isFinite(n);

            if (solveFor === 'goalWeight') {
                if (!known(start) || !known(rate) || !known(weeks)) return null;
                return start - rate * weeks;
            }
            if (solveFor === 'ratePerWeek') {
                if (!known(start) || !known(goal) || !known(weeks) || weeks <= 0) return null;
                return (start - goal) / weeks;
            }
            if (solveFor === 'weeks') {
                if (!known(start) || !known(goal) || !known(rate) || rate <= 0) return null;
                return Math.ceil((start - goal) / rate);
            }
            return null;
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
        //
        // Week 1 is measured against the last logged week BEFORE the plan
        // began, when the log has one. That week is what week 1's loss actually
        // came off, and it is already what the History row for week 1 prints as
        // its delta — so the two agree, and the first week of a cut stops being
        // silently absent from every average built on these rows. Which
        // mattered: the first week is usually the biggest, and leaving it out
        // made Pace read as whatever the most recent ordinary week did.
        //
        // The plan's own `startWeight` is deliberately NOT that anchor. It is a
        // number typed into the editor rather than a week that was weighed, so
        // a plan set up a fortnight after the weight it names would book that
        // whole fortnight as week 1's loss. A plan whose log begins with it has
        // no anchor at all, and week 1 carries no rate rather than a made-up
        // one — see projectionRate for the one place that still needs a number
        // there.
        //
        // `rate` is that delta PER WEEK, which is not the same figure whenever
        // a week was skipped: a delta spanning two weeks is two weeks of loss,
        // and averaging it in as one week's would flatter the pace. Ordinarily
        // the span is 1 and the two are the same number. `cumulative` keeps
        // summing the raw deltas, because a running total is a total.
        function planRows(plan, log) {
            const weeks = weeklyAverages(log);
            const byWeek = new Map(weeks.map((w) => [w.weekStart, w]));
            const rows = [];
            // Day keys are ISO, so lexicographic order is date order.
            const earlier = weeks.filter((w) => w.weekStart < plan.startDate);
            let prev = earlier.length ? earlier[earlier.length - 1] : null;
            let cumulative = 0;

            for (let i = 1; i <= plan.weeks; i++) {
                const start = parseDayKey(plan.startDate);
                start.setDate(start.getDate() + (i - 1) * 7);
                const weekStart = localDayKey(start);
                const wk = byWeek.get(weekStart);
                const actual = wk ? wk.avg : null;

                let delta = null;
                let rate = null;
                if (actual !== null && prev !== null) {
                    delta = actual - prev.avg;
                    cumulative += delta;
                    const spanWeeks = Math.round(
                        (parseDayKey(weekStart) - parseDayKey(prev.weekStart)) / MS_PER_WEEK
                    );
                    if (spanWeeks >= 1) rate = delta / spanWeeks;
                }
                if (actual !== null) prev = { weekStart, avg: actual };

                rows.push({
                    week: i,
                    weekStart,
                    planWeight: planWeightForWeek(plan, i),
                    actual,
                    count: wk ? wk.count : 0,
                    delta,
                    rate,
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

            // Pace: the mean of every plan week's own weekly rate, which is the
            // sheet's AVERAGE(E3:E14). Negative means coming down.
            //
            // Every week the plan has a rate for counts equally — a week that
            // shed four pounds and a week that shed none average to two,
            // whatever order they came in. This is not the latest week's
            // number, and it is not meant to be: one week of a cut is mostly
            // water, sodium and glycogen, and steering off the most recent one
            // means being told the cut has stalled every time a single week
            // holds. The card's own line says "lb/wk vs planned", and it is the
            // average that belongs beside a planned rate.
            const rates = rows.map((r) => r.rate).filter((r) => r !== null);
            const avgRate = rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null;

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

        // The rest of the plan, drawn at the rate actually being achieved
        // rather than the one it asks for. History puts these behind a button:
        // they are a projection, not a record, and they are not in the ledger
        // until a scale says so.
        //
        // The rate comes from `projectionRate` below — normally `avgRate`, the
        // mean of every plan week's rate so far, which is the sheet's
        // AVERAGE(E3:E14), the number the card prints as Pace, and the same
        // number `projectedFinish` extrapolates from. One rate feeds all three
        // wherever all three exist, on purpose: a Pace, a week-by-week
        // projection and a finish date that disagreed about the future would be
        // worse than any of them alone. So the projection is drawn off every
        // week the plan has run rather than off the latest one — a good week
        // does not redraw the rest of the cut, and neither does a bad one.
        //
        // The rows start after the LAST week that has readings, so a projected
        // week never lands on a week the log can already answer for, and they
        // stop at whichever comes first: the plan's last week, or the week the
        // line arrives at the goal. Running past the goal would draw weeks of
        // a cut that would already be over.
        //
        // Empty is the answer wherever the projection would be arithmetic
        // dressed as a forecast — no plan, no readings yet, a rate that is flat
        // or rising, a plan already at its end. The button is hidden in exactly
        // those cases rather than opening onto nothing.
        function projectionRate(progress) {
            if (!progress) return null;
            const withData = progress.rows.filter((r) => r.actual !== null);
            let rate = progress.avgRate;

            // A plan whose log begins with it has nothing for week 1 to be
            // measured against — no earlier week was weighed — so `avgRate` is
            // null for the whole of that week and the projection would be
            // missing exactly when a new plan is most worth extrapolating. The
            // fallback measures the same thing against the only anchor left:
            // what has come off since the plan started, over the weeks it has
            // run.
            //
            // It is a fallback and not the primary because it is the worse
            // forecast once there is a choice. Week 1 of a cut sheds water, so
            // a rate anchored on a typed-in start weight runs hot for a month,
            // and that weight is not a week anybody stood on a scale for. Where
            // the log does reach back before the plan, `avgRate` already counts
            // week 1 off a week that was — see planRows — and this never fires.
            if (rate === null && withData.length === 1 && withData[0].week > 0) {
                rate = (withData[0].actual - progress.plan.startWeight) / withData[0].week;
            }
            // Same threshold `projectedFinish` uses, and for the same reason: a
            // twentieth of a pound a week is noise, and extrapolating it names
            // a date in the next decade.
            return rate !== null && rate < -0.05 ? rate : null;
        }

        function projectedWeeks(progress) {
            if (!progress) return [];
            const plan = progress.plan;
            const avgRate = projectionRate(progress);
            if (avgRate === null) return [];

            const withData = progress.rows.filter((r) => r.actual !== null);
            if (!withData.length) return [];
            const last = withData[withData.length - 1];

            const out = [];
            let prev = last.actual;
            for (let i = last.week + 1; i <= plan.weeks; i++) {
                const raw = last.actual + avgRate * (i - last.week);
                // Clamped at the goal, which is also where the loop stops. The
                // last row is the week the goal lands, and it lands ON the goal
                // rather than wherever the line happened to be pointing.
                const atGoal = raw <= plan.goalWeight;
                const weight = atGoal ? plan.goalWeight : raw;
                const start = parseDayKey(plan.startDate);
                start.setDate(start.getDate() + (i - 1) * 7);
                const planWeight = planWeightForWeek(plan, i);
                out.push({
                    week: i,
                    weekStart: localDayKey(start),
                    planWeight,
                    projected: weight,
                    // Measured off the row before it, so the goal week reports
                    // the part-week it actually takes rather than a full one.
                    delta: weight - prev,
                    vsPlan: weight - planWeight,
                    atGoal,
                });
                prev = weight;
                if (atGoal) break;
            }
            return out;
        }

        function formatMonthDay(dayKey) {
            return parseDayKey(dayKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
