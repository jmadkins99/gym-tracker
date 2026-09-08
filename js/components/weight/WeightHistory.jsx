        // History. The counterpart to gym-tracker's weekly list, and subject to
        // the same rule as the check-in card: no daily raw reading appears
        // here, ever. What survives into history is the smoothed trend (as a
        // shape) and the weekly average (as a number). A single day's weight is
        // mostly water and is not information about a cut, so this screen is
        // built so that there is no version of it you can scroll back through.
        //
        // The chart carries no y-axis labels for the same reason. The useful
        // question is "which way and how fast", which the shape and the
        // lb/week figure underneath both answer; a labelled axis only adds the
        // ability to read a value off a specific morning.
        //
        // The cut-plan dashboard leads the screen, because "am I on track" is
        // the question this page gets opened for once a plan exists.

        const RANGE_OPTIONS = [
            { key: 30, label: '30d' },
            { key: 90, label: '90d' },
            { key: 365, label: '1y' },
            { key: 0, label: 'All' },
        ];

        // Fixed geometry in the SVG's own coordinate space; the element scales
        // to whatever width the card gives it.
        const CHART_W = 320;
        const CHART_H = 120;
        const CHART_PAD = 10;

        function TrendChart({ points, plan }) {
            if (points.length === 0) return null;

            const xs = points.map((p) => parseDayKey(p.date).getTime());
            const xMin = Math.min.apply(null, xs);
            const xMax = Math.max.apply(null, xs);

            // The plan line is sampled over the SAME x-range as the trend —
            // clipped to what has actually happened rather than running on into
            // future weeks. Where the plan is heading is a sentence ("goal 145
            // by Nov 16"), not a line inviting you to measure yourself against
            // a date that has not arrived.
            // Bounded by the plan's OWN window as well as the chart's. Without
            // the lower bound the clamp in planWeightAtDate draws a flat line
            // back across every year on screen, which on the All range reads as
            // a plan that has existed since 2024.
            let planPts = [];
            if (plan) {
                const planStart = parseDayKey(plan.startDate).getTime();
                const planEnd = parseDayKey(plan.startDate).getTime() + plan.weeks * MS_PER_WEEK;
                const from = Math.max(xMin, planStart);
                const to = Math.min(xMax, planEnd);
                if (to > from) {
                    const marks = [from];
                    for (let i = 0; i <= plan.weeks; i++) {
                        const t = planStart + i * MS_PER_WEEK;
                        if (t > from && t < to) marks.push(t);
                    }
                    marks.push(to);
                    planPts = marks.map((t) => ({ t, v: planWeightAtDate(plan, new Date(t)) }));
                }
            }

            // Both series share one scale, so "above the dashed line" means
            // what it looks like it means.
            const ys = points.map((p) => p.trend).concat(planPts.map((p) => p.v));
            const yMin = Math.min.apply(null, ys);
            const yMax = Math.max.apply(null, ys);

            // A flat stretch would otherwise divide by zero and, worse, get
            // stretched to fill the box — turning half a pound of drift into a
            // dramatic slope. Pad the range to at least 2 lbs so a quiet week
            // looks like a quiet week.
            const span = Math.max(yMax - yMin, 2);
            const mid = (yMin + yMax) / 2;
            const lo = mid - span / 2;

            const x = (t) => (xMax === xMin
                ? CHART_W / 2
                : CHART_PAD + ((t - xMin) / (xMax - xMin)) * (CHART_W - CHART_PAD * 2));
            const y = (v) => CHART_PAD + (1 - (v - lo) / span) * (CHART_H - CHART_PAD * 2);

            const coords = points.map((p, i) => [x(xs[i]), y(p.trend)]);
            const line = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
            const area = line + ' L' + coords[coords.length - 1][0].toFixed(1) + ' ' + (CHART_H - CHART_PAD) +
                         ' L' + coords[0][0].toFixed(1) + ' ' + (CHART_H - CHART_PAD) + ' Z';
            const last = coords[coords.length - 1];
            const planPath = planPts.length > 1
                ? planPts.map((p, i) => (i === 0 ? 'M' : 'L') + x(p.t).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ')
                : null;

            return (
                <svg className="weigh-chart" viewBox={'0 0 ' + CHART_W + ' ' + CHART_H} preserveAspectRatio="none" role="img"
                     aria-label="Weight trend line against the cut plan, direction only — no values shown">
                    <defs>
                        <linearGradient id="weighFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent-muted)" stopOpacity="0.30" />
                            <stop offset="100%" stopColor="var(--accent-muted)" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    {coords.length > 1 && <path d={area} fill="url(#weighFill)" />}
                    {planPath && (
                        <path d={planPath} fill="none" stroke="#4e4e63" strokeWidth="1.5"
                              strokeDasharray="5 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    )}
                    {coords.length > 1 && (
                        <path d={line} fill="none" stroke="var(--accent-muted)" strokeWidth="2.5"
                              strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    )}
                    <circle cx={last[0]} cy={last[1]} r="4" fill="#f0f0fa" />
                </svg>
            );
        }

        function WeightHistory({ log, range, setRange, progress, onEditPlan }) {
            const points = trendSeries(log, range || 0);
            const weeks = weeklyAverages(log).slice().reverse();
            const rate = weeklyRate(log);

            // Plan week rows keyed by their Monday, so the ledger below can
            // show "vs plan" on the weeks the plan actually covers.
            const planByWeek = React.useMemo(() => {
                const m = new Map();
                if (progress) progress.rows.forEach((r) => m.set(r.weekStart, r));
                return m;
            }, [progress]);

            if ((log || []).length === 0) {
                return (
                    <>
                        <PlanSummary progress={progress} onEdit={onEditPlan} />
                        <div className="empty-state">
                            <div className="empty-state-icon">📉</div>
                            <div>No check-ins yet</div>
                        </div>
                    </>
                );
            }

            return (
                <>
                    <PlanSummary progress={progress} onEdit={onEditPlan} />

                    <div className="day-toggle weigh-range">
                        {RANGE_OPTIONS.map((opt) => (
                            <button
                                key={opt.key}
                                className={'day-pill' + (range === opt.key ? ' active' : '')}
                                onClick={() => setRange(opt.key)}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    <div className="weigh-chart-card">
                        <TrendChart points={points} plan={progress ? progress.plan : null} />
                        <div className="weigh-chart-axis">
                            <span>{points.length ? formatShortDay(points[0].date) : ''}</span>
                            {progress && <span className="weigh-chart-key">╌╌ plan</span>}
                            <span>{points.length ? formatShortDay(points[points.length - 1].date) : ''}</span>
                        </div>
                        <div className={'weigh-chart-rate' + (rate !== null && rate < -0.05 ? ' good' : '')}>
                            {rate === null
                                ? 'Not enough data for a weekly rate yet'
                                : (rate < 0 ? '↓ ' : rate > 0 ? '↑ ' : '→ ') + formatWeight(Math.abs(rate)) + ' lb / week'}
                        </div>
                    </div>

                    <div className="section-title">By week</div>

                    {weeks.map((wk, i) => {
                        // `weeks` is newest-first, so the previous week in time
                        // is the NEXT element.
                        const prior = weeks[i + 1];
                        const delta = prior ? wk.avg - prior.avg : null;
                        const planRow = planByWeek.get(wk.weekStart);
                        const vsPlan = planRow && planRow.week > 0 ? wk.avg - planRow.planWeight : null;
                        return (
                            <div className="history-item weigh-week" key={wk.weekStart}>
                                <div className="history-date">
                                    Week of {formatShortDay(wk.weekStart)}
                                    {planRow && <span className="weigh-week-plan-tag">plan wk {planRow.week}</span>}
                                </div>
                                <div className="weigh-week-row">
                                    <div className="weigh-week-avg">
                                        {formatWeight(wk.avg)}<span className="weigh-week-unit">lbs avg</span>
                                    </div>
                                    {delta !== null && (
                                        <div className={'weigh-week-delta' + (delta < 0 ? ' good' : delta > 0 ? ' up' : '')}>
                                            {delta < 0 ? '↓' : delta > 0 ? '↑' : '→'} {formatWeight(Math.abs(delta))}
                                        </div>
                                    )}
                                    <div className="weigh-week-count">{wk.count}/7 logged</div>
                                </div>
                                {vsPlan !== null && (
                                    <div className={'weigh-week-vs' + (vsPlan <= 0 ? ' good' : ' behind')}>
                                        plan {formatWeight(planRow.planWeight)} ·{' '}
                                        {Math.abs(vsPlan) < 0.05
                                            ? 'on plan'
                                            : formatWeight(Math.abs(vsPlan)) + ' lb ' + (vsPlan < 0 ? 'ahead' : 'behind')}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </>
            );
        }
