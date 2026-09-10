        // The cut-plan dashboard, sitting at the top of History — the
        // spreadsheet's header block, which is the part that was actually worth
        // opening the workbook for.
        //
        // Three numbers and a bar. The bar is progress toward the goal; the
        // three stats are lost / to go / gap to the plan line. Everything is in
        // pounds of CHANGE rather than absolute weight, which is both what the
        // sheet's summary row did and the framing that keeps this screen about
        // the plan rather than about a number on a scale.
        //
        // Read-only, deliberately. It used to carry an Edit button of its own,
        // which put the plan editor behind two different affordances on two
        // screens; the gear is where every setting on this page is changed, and
        // the plan is a setting. The one button left is on the empty card,
        // because "no cut plan set" has to offer a way to set one.
        function PlanSummary({ progress, onEdit }) {
            if (!progress) {
                return (
                    <div className="plan-card plan-card-empty">
                        <div className="plan-empty-text">No cut plan set</div>
                        <button className="modal-btn" onClick={onEdit}>Set a plan</button>
                    </div>
                );
            }

            const { plan, weekNumber, lost, toGo, gap, pct, avgRate, goalWeight,
                    goalPounds, planWeight, actual, projectedFinish, targetDate } = progress;

            // Past the last planned week the counter would read "week 14 of
            // 12", so it stops counting up and says so instead. Floored at 1
            // for a plan whose start Monday has not arrived yet.
            const weekLabel = weekNumber > plan.weeks
                ? 'Past week ' + plan.weeks
                : 'Week ' + Math.max(1, weekNumber) + ' of ' + plan.weeks;

            // Under the line is green, over it is amber — never red. Being over
            // on a cut is ordinary, and the palette should not treat it as an
            // error. It is especially ordinary now that the week's target is
            // the one to beat by Sunday: most of a week is spent above it, and
            // that is the plan working rather than failing, so the word for it
            // is what is left to beat rather than "behind".
            const gapClass = gap < -0.05 ? 'good' : gap > 0.05 ? 'behind' : '';
            const gapLabel = Math.abs(gap) < 0.05 ? 'on target'
                : (gap < 0 ? 'under' : 'to beat');

            return (
                <div className="plan-card">
                    <div className="plan-name">{plan.name}</div>
                    <div className="plan-week">{weekLabel}</div>

                    <div className="finish-stats plan-stats">
                        <div>
                            <div className="finish-stat-value">{formatWeight(Math.max(0, lost))}</div>
                            <div className="finish-stat-label">lb lost</div>
                        </div>
                        <div>
                            <div className="finish-stat-value">{formatWeight(Math.max(0, toGo))}</div>
                            <div className="finish-stat-label">to go</div>
                        </div>
                        <div>
                            <div className={'finish-stat-value plan-gap ' + gapClass}>
                                {formatWeight(Math.abs(gap))}
                            </div>
                            <div className="finish-stat-label">{gapLabel}</div>
                        </div>
                    </div>

                    <div className="plan-bar">
                        <div className="plan-bar-fill" style={{ width: (pct * 100).toFixed(1) + '%' }} />
                    </div>
                    <div className="plan-bar-ends">
                        <span>{formatWeight(plan.startWeight)}</span>
                        <span>{(pct * 100).toFixed(0)}% of {formatWeight(goalPounds)} lb</span>
                        <span>{formatWeight(goalWeight)}</span>
                    </div>

                    <div className="plan-lines">
                        <div className="plan-line-row">
                            <span>Beat this week</span>
                            <span>{formatWeight(planWeight)} lb</span>
                        </div>
                        <div className="plan-line-row">
                            <span>Your average</span>
                            <span>{formatWeight(actual)} lb</span>
                        </div>
                        <div className="plan-line-row">
                            <span>Pace</span>
                            <span>
                                {avgRate === null
                                    ? '—'
                                    : (avgRate < 0 ? '↓ ' : avgRate > 0 ? '↑ ' : '→ ') +
                                      formatWeight(Math.abs(avgRate)) + ' lb/wk vs ' +
                                      formatWeight(plan.ratePerWeek) + ' planned'}
                            </span>
                        </div>
                        <div className="plan-line-row">
                            <span>Goal {formatWeight(goalWeight)} lb</span>
                            <span>
                                {projectedFinish
                                    ? 'projected ' + formatMonthDay(projectedFinish.date)
                                    : 'planned ' + formatMonthDay(targetDate)}
                            </span>
                        </div>
                    </div>
                </div>
            );
        }
