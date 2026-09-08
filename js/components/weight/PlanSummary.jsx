        // The cut-plan dashboard, sitting at the top of History — the
        // spreadsheet's header block, which is the part that was actually worth
        // opening the workbook for.
        //
        // Three numbers and a bar. The bar is progress toward the goal; the
        // three stats are lost / to go / gap to the plan line. Everything is in
        // pounds of CHANGE rather than absolute weight, which is both what the
        // sheet's summary row did and the framing that keeps this screen about
        // the plan rather than about a number on a scale.
        function PlanSummary({ progress, onEdit }) {
            if (!progress) {
                return (
                    <div className="plan-card plan-card-empty">
                        <div className="plan-empty-text">No cut plan set</div>
                        <button className="modal-btn" onClick={onEdit}>Set a plan</button>
                    </div>
                );
            }

            const { plan, weekIndex, lost, toGo, gap, pct, avgRate, goalWeight,
                    goalPounds, planWeight, actual, projectedFinish, targetDate } = progress;

            // Past the last planned week the counter would read "week 14 of
            // 12", so it stops counting up and says so instead.
            const weekLabel = weekIndex > plan.weeks
                ? 'Past week ' + plan.weeks
                : 'Week ' + Math.max(0, weekIndex) + ' of ' + plan.weeks;

            // Ahead of the line is green, behind it is amber — never red. Being
            // behind on a cut is ordinary, and the palette should not treat it
            // as an error.
            const gapClass = gap < -0.05 ? 'good' : gap > 0.05 ? 'behind' : '';
            const gapLabel = Math.abs(gap) < 0.05 ? 'on plan'
                : (gap < 0 ? 'ahead' : 'behind');

            return (
                <div className="plan-card">
                    <div className="plan-head">
                        <div className="plan-name">{plan.name}</div>
                        <button className="plan-edit" onClick={onEdit}>Edit</button>
                    </div>
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
                            <span>Plan says</span>
                            <span>{formatWeight(planWeight)} lb this week</span>
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
