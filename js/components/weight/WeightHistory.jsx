        // History. The counterpart to gym-tracker's weekly list. What it shows
        // on arrival is the smoothed trend and the weekly average — a single
        // morning's weight is mostly water and is not information about a cut,
        // so there is still no view that SCROLLS back through dailies.
        //
        // A week row now opens, though, and inside it are that week's readings
        // with an edit and a delete on each. That is a deliberate narrowing of
        // the original rule rather than an abandonment of it, and the reason is
        // that the rule had a hole: a fat-fingered 187 for 178 was correctable
        // only until midnight, after which it sat in the trend, the weekly
        // average and the plan gap forever, wrong and unreachable. A number the
        // app derives everything from has to be fixable. What keeps the spirit
        // is that the dailies stay CLOSED: opening History still shows nothing
        // raw, and reading one takes a deliberate tap on the week it is in.
        //
        // The chart does carry a labelled y-axis. That is a change of mind, and
        // a narrow one: the axis is scaled to the TREND, so what a value can be
        // read off it is a smoothed figure, never the number that was on the
        // scale on a given morning. The rule that survives is about raw
        // readings, not about arithmetic in general — and without a scale the
        // same picture is drawn by half a pound of drift and by ten, which made
        // the chart's shape genuinely hard to read against the plan line.
        //
        // The cut-plan dashboard leads the screen, because "am I on track" is
        // the question this page gets opened for once a plan exists.

        const RANGE_OPTIONS = [
            { key: 7, label: '7d' },
            { key: 30, label: '30d' },
            { key: 183, label: '6mo' },
            { key: 0, label: 'All' },
        ];

        // Fixed geometry in the SVG's own coordinate space; the element scales
        // to whatever width the card gives it.
        const CHART_W = 320;
        const CHART_H = 120;
        const CHART_PAD = 10;

        // A round gridline interval near span/targetTicks — 1, 2, 5 or 10 lb
        // and their decades. Ticks at 3.7 lb intervals would be arithmetically
        // fine and unreadable.
        function niceStep(span, targetTicks) {
            const raw = span / Math.max(1, targetTicks);
            const mag = Math.pow(10, Math.floor(Math.log10(raw)));
            const norm = raw / mag;
            return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
        }

        // How long a finger must hold still before the chart takes the gesture,
        // and how far it may wander in that time. 180ms is short enough not to
        // feel like a wait, long enough that a flick down the page never trips
        // it.
        const HOLD_MS = 180;
        const HOLD_SLOP = 10;

        function formatWeekdayDay(dayKey) {
            return parseDayKey(dayKey).toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
            });
        }

        function TrendChart({ points, plan }) {
            // Index into `points` currently under the finger, or null. The
            // hooks sit above the early return so their order is fixed across
            // every render, which is what the rules of hooks are about.
            const [scrub, setScrub] = React.useState(null);
            const [held, setHeld] = React.useState(false);
            const plotRef = React.useRef(null);
            // Lets the touch effect below — mounted once — call into the
            // current render's pickIndex without re-binding listeners on every
            // frame of a drag.
            const pickRef = React.useRef(null);

            // A range change swaps the series out from under a held finger, and
            // a stale index can point past the end of the new one.
            React.useEffect(() => { setScrub(null); }, [points.length]);

            // ---- Touch ----
            //
            // Touch cannot reuse the mouse path, and the reason is specific:
            // React attaches its handlers at the root, which makes the
            // touchmove listener PASSIVE on iOS, so preventDefault() from an
            // onPointerMove prop is silently ignored. The scrub then spends
            // every gesture fighting the page scroll and losing — the browser
            // wins, starts scrolling, and fires pointercancel, which yanks the
            // readout away mid-drag. Hence a real addEventListener with
            // { passive: false }.
            //
            // The gesture is long-press to engage, which is what
            // react-beautiful-dnd's touch sensor and amCharts' tapToActivate
            // both settled on for the same reason: a chart that claims every
            // touch is a chart you cannot scroll past on a phone. Move before
            // the hold expires and it is a scroll, so we bow out; hold still
            // and the gesture becomes ours, and from then on preventDefault
            // keeps the page still under the finger.
            React.useEffect(() => {
                const el = plotRef.current;
                if (!el) return undefined;

                let holdTimer = null;
                let engaged = false;
                let startX = 0;
                let startY = 0;

                const clearHold = () => { clearTimeout(holdTimer); holdTimer = null; };

                const onTouchStart = (e) => {
                    if (e.touches.length !== 1) return;
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                    engaged = false;
                    clearHold();
                    holdTimer = setTimeout(() => {
                        engaged = true;
                        setHeld(true);
                        setScrub(pickRef.current(startX));
                        // Same confirmation react-beautiful-dnd offers on drag
                        // start. Absent on iOS Safari, which exposes no
                        // vibrate() — the visual change carries it there.
                        if (navigator.vibrate) navigator.vibrate(8);
                    }, HOLD_MS);
                };

                const onTouchMove = (e) => {
                    const t = e.touches[0];
                    if (!t) return;
                    if (!engaged) {
                        // Still deciding. Movement past the slop means the
                        // finger is scrolling, so stand down and let it.
                        if (Math.abs(t.clientX - startX) > HOLD_SLOP ||
                            Math.abs(t.clientY - startY) > HOLD_SLOP) {
                            clearHold();
                        }
                        return;
                    }
                    // Engaged: this gesture is ours, and this is the call that
                    // needs the non-passive listener to have any effect.
                    e.preventDefault();
                    setScrub(pickRef.current(t.clientX));
                };

                const onTouchEnd = () => {
                    clearHold();
                    if (engaged) {
                        engaged = false;
                        setHeld(false);
                        setScrub(null);
                    }
                };

                el.addEventListener('touchstart', onTouchStart, { passive: true });
                el.addEventListener('touchmove', onTouchMove, { passive: false });
                el.addEventListener('touchend', onTouchEnd);
                el.addEventListener('touchcancel', onTouchEnd);
                return () => {
                    clearHold();
                    el.removeEventListener('touchstart', onTouchStart);
                    el.removeEventListener('touchmove', onTouchMove);
                    el.removeEventListener('touchend', onTouchEnd);
                    el.removeEventListener('touchcancel', onTouchEnd);
                };
            }, []);

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

            // The domain is snapped OUT to whole gridline intervals, so every
            // label is a round number and the top and bottom lines sit exactly
            // on the edges of the plot.
            //
            // The floor of 2 lb is what stops a flat stretch dividing by zero
            // and, worse, being stretched to fill the box — half a pound of
            // drift rendered as a dramatic slope. With a labelled axis that
            // floor now also shows its work: a quiet week reads as a quiet week
            // because the scale beside it says so.
            const step = niceStep(Math.max(yMax - yMin, 2), 4);
            let lo = Math.floor(yMin / step) * step;
            let hi = Math.ceil(yMax / step) * step;
            if (hi - lo < step * 2) {
                lo = Math.floor(((yMin + yMax) / 2 - step) / step) * step;
                hi = lo + step * 2;
            }
            const span = hi - lo;

            const ticks = [];
            for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
            const tickLabel = (v) => (step >= 1 ? String(Math.round(v)) : v.toFixed(1));

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

            // ---- Scrub ----
            //
            // Press and drag along the plot to read a point off it. The value
            // shown is the TREND at that date, not that morning's raw reading —
            // the line under your finger is the trend line, so anything else
            // would be labelling one number with another's position, and the
            // raw dailies stay unrecallable as they are everywhere else here.
            //
            // Hand-written pointer events, matching SwipeDeck: no gesture
            // library, no build step to add one, and pointer events cover mouse
            // and touch in a single path.
            const pickIndex = (clientX) => {
                const rect = plotRef.current && plotRef.current.getBoundingClientRect();
                if (!rect || !rect.width) return null;
                // Undo x(): pixels -> viewBox units -> fraction -> timestamp.
                const vx = ((clientX - rect.left) / rect.width) * CHART_W;
                const f = (vx - CHART_PAD) / (CHART_W - CHART_PAD * 2);
                const t = xMin + f * (xMax - xMin);
                let best = 0;
                let bestD = Infinity;
                for (let i = 0; i < xs.length; i++) {
                    const d = Math.abs(xs[i] - t);
                    if (d < bestD) { bestD = d; best = i; }
                }
                return best;
            };
            pickRef.current = pickIndex;

            // Mouse only. Touch is handled separately below, and these same
            // events fire for touch too — without this guard every tap runs
            // both paths and they fight over `scrub`.
            const onDown = (e) => {
                if (e.pointerType === 'touch') return;
                // Capture, so a drag that wanders off the chart keeps reporting
                // here instead of being swallowed by whatever it crosses.
                if (e.currentTarget.setPointerCapture) {
                    e.currentTarget.setPointerCapture(e.pointerId);
                }
                setScrub(pickIndex(e.clientX));
            };
            const onMove = (e) => {
                if (e.pointerType === 'touch' || scrub === null) return;
                setScrub(pickIndex(e.clientX));
            };
            const endScrub = (e) => {
                if (e && e.pointerType === 'touch') return;
                setScrub(null);
            };

            const at = scrub !== null && scrub < points.length ? points[scrub] : null;
            const atX = at ? coords[scrub][0] : 0;
            const atPct = (atX / CHART_W) * 100;
            // Anchor the readout so it never hangs off the card at either end.
            const anchor = atPct < 18 ? 'start' : atPct > 82 ? 'end' : 'mid';
            // Flip it below when the point sits high, so the pill does not
            // cover the very line being read.
            const flip = at && coords[scrub][1] < CHART_H * 0.42;

            // The axis labels live in an HTML gutter beside the SVG rather than
            // in <text> inside it, and so does the scrub readout. The plot is
            // drawn with preserveAspectRatio=none so the line always fills the
            // card's width, and that same stretch would smear any text sharing
            // those coordinates. Lines are immune — a horizontal one stays
            // horizontal, a vertical one stays vertical — so the gridlines and
            // the scrub rule stay in the SVG.
            return (
              <div className="weigh-chart-wrap">
                <div className="weigh-chart-yaxis">
                    {ticks.map((v) => (
                        <span key={v} style={{ top: ((y(v) / CHART_H) * 100).toFixed(2) + '%' }}>
                            {tickLabel(v)}
                        </span>
                    ))}
                </div>
                <div
                    className={'weigh-chart-plot' + (held ? ' held' : '')}
                    ref={plotRef}
                    onPointerDown={onDown}
                    onPointerMove={onMove}
                    onPointerUp={endScrub}
                    onPointerCancel={endScrub}
                >
                    <svg className="weigh-chart" viewBox={'0 0 ' + CHART_W + ' ' + CHART_H} preserveAspectRatio="none" role="img"
                         aria-label={'Weight trend from ' + tickLabel(lo) + ' to ' + tickLabel(hi) + ' lb'
                                     + (plan ? ', against the cut plan line' : '')}>
                        <defs>
                            <linearGradient id="weighFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--accent-muted)" stopOpacity="0.30" />
                                <stop offset="100%" stopColor="var(--accent-muted)" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        {ticks.map((v) => (
                            <line key={v} x1="0" x2={CHART_W} y1={y(v)} y2={y(v)}
                                  stroke="#1c1c2c" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                        ))}
                        {coords.length > 1 && <path d={area} fill="url(#weighFill)" />}
                        {planPath && (
                            <path d={planPath} fill="none" stroke="#4e4e63" strokeWidth="1.5"
                                  strokeDasharray="5 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                        )}
                        {coords.length > 1 && (
                            <path d={line} fill="none" stroke="var(--accent-muted)" strokeWidth="2.5"
                                  strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                        )}
                        {at && (
                            <line x1={atX} x2={atX} y1="0" y2={CHART_H}
                                  stroke="#f0f0fa" strokeWidth="1" strokeOpacity="0.45"
                                  vectorEffect="non-scaling-stroke" />
                        )}
                        <circle cx={last[0]} cy={last[1]} r="4" fill="#f0f0fa" />
                        {at && (
                            <circle cx={atX} cy={coords[scrub][1]} r="5" fill="#f0f0fa"
                                    stroke="#0b0b16" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                        )}
                    </svg>
                    {at && (
                        <div className={'weigh-scrub ' + anchor + (flip ? ' flip' : '')}
                             style={{ left: atPct.toFixed(2) + '%' }}>
                            <div className="weigh-scrub-weight">
                                {formatWeight(at.trend)}<span> lb</span>
                            </div>
                            <div className="weigh-scrub-date">{formatWeekdayDay(at.date)} · trend</div>
                        </div>
                    )}
                </div>
              </div>
            );
        }

        // The readings inside one opened week, newest first, each with a way
        // to correct it.
        //
        // Editing is inline rather than a modal, and that is the same decision
        // the check-in card makes for today's number: a correction is one field
        // and two taps, and a modal over a list you are scanning loses your
        // place in it. Only one row is open at a time — the state is a day key,
        // not a set — so a half-typed correction can never be sitting in a row
        // that has scrolled off screen.
        function WeekEntries({ entries, onSave, onDelete }) {
            const [editing, setEditing] = React.useState(null);
            const [draft, setDraft] = React.useState('');
            const inputRef = React.useRef(null);

            // Same keystroke filter as the check-in field, and deliberately the
            // same one: a correction that accepts input the original did not
            // would let a value into the log by the back door.
            const onDraftChange = (e) => {
                const v = e.target.value;
                if (v === '' || /^\d{0,3}(\.\d?)?$/.test(v)) setDraft(v);
            };

            const parsed = parseFloat(draft);
            const valid = draft !== '' && !isNaN(parsed) && parsed > 0;

            // The focus has to happen inside the tap that opens the editor.
            // iOS raises the keyboard only for a focus() that runs in the same
            // task as the user gesture, and focusing from an effect after the
            // re-render is one task too late: the field takes the caret and the
            // keyboard stays down, so it costs a second tap to type into. The
            // input does not exist yet when the tap arrives, so flushSync
            // renders it immediately — that is the whole reason for reaching
            // for it here rather than letting the update batch as usual.
            const begin = (entry) => {
                ReactDOM.flushSync(() => {
                    setEditing(entry.date);
                    setDraft(formatWeight(entry.weight));
                });
                // select() focuses as well, so the keyboard comes up on a field
                // whose contents are ready to be typed over.
                if (inputRef.current) inputRef.current.select();
            };

            const commit = (dayKey) => {
                if (!valid) return;
                onSave(dayKey, parsed);
                setEditing(null);
            };

            // Confirmed, unlike the edit: a mistyped correction is visible in
            // the row you just typed it into, a deleted morning is gone from
            // the record with nothing left on screen to notice.
            const drop = (entry) => {
                if (!confirm('Delete the ' + formatWeekdayDay(entry.date) + ' reading? '
                             + 'It is removed from the trend and the weekly average.')) return;
                onDelete(entry.date);
                setEditing(null);
            };

            return (
                <div className="weigh-days">
                    {entries.map((entry) => (
                        <div className={'weigh-day' + (editing === entry.date ? ' editing' : '')}
                             key={entry.date}>
                            <div className="weigh-day-date">
                                {formatWeekdayDay(entry.date)}
                                {entry.editedAt && <span className="weigh-day-edited">edited</span>}
                            </div>
                            {editing === entry.date ? (
                                <div className="weigh-day-edit">
                                    <input
                                        ref={inputRef}
                                        className="weigh-day-input"
                                        type="text"
                                        inputMode="decimal"
                                        value={draft}
                                        onChange={onDraftChange}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') commit(entry.date);
                                            if (e.key === 'Escape') setEditing(null);
                                        }}
                                        aria-label={'Weight for ' + formatWeekdayDay(entry.date)}
                                    />
                                    <button className="weigh-day-btn save" disabled={!valid}
                                            onClick={() => commit(entry.date)}>Save</button>
                                    <button className="weigh-day-btn" onClick={() => setEditing(null)}>Cancel</button>
                                    <button className="weigh-day-btn danger" onClick={() => drop(entry)}>Delete</button>
                                </div>
                            ) : (
                                <button className="weigh-day-value" onClick={() => begin(entry)}>
                                    {formatWeight(entry.weight)}<span className="weigh-day-unit">lbs</span>
                                    <span className="weigh-day-pencil">✎</span>
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            );
        }

        function WeightHistory({ log, range, setRange, progress, onEditPlan, onEditEntry, onDeleteEntry }) {
            const points = trendSeries(log, range || 0);
            const weeks = weeklyAverages(log).slice().reverse();
            const rate = weeklyRate(log);
            const rangeAvg = rangeAverage(log, range || 0);
            // Which week's dailies are open, by its Monday. One at a time: the
            // ledger runs to a hundred-odd rows on the All range, and a screen
            // with several weeks unfolded is the scrollable list of raw
            // readings this page does not have.
            const [openWeek, setOpenWeek] = React.useState(null);

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
                        <div className="weigh-chart-foot">
                            {/* The average for whatever window is selected, so
                                the range buttons answer "what have I been
                                lately" as well as "what does it look like".
                                Mean of the raw readings in the window, not of
                                the trend: the trend is weighted toward its most
                                recent points by construction, which makes it
                                the wrong thing to call an average. */}
                            {rangeAvg && (
                                <div className="weigh-chart-avg">
                                    <span className="weigh-chart-avg-value">{formatWeight(rangeAvg.avg)}</span>
                                    <span className="weigh-chart-avg-label">
                                        lb avg · {rangeAvg.count} day{rangeAvg.count === 1 ? '' : 's'}
                                    </span>
                                </div>
                            )}
                            <div className={'weigh-chart-rate' + (rate !== null && rate < -0.05 ? ' good' : '')}>
                                {rate === null
                                    ? 'Not enough data for a weekly rate yet'
                                    : (rate < 0 ? '↓ ' : rate > 0 ? '↑ ' : '→ ') + formatWeight(Math.abs(rate)) + ' lb / week'}
                            </div>
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
                        const open = openWeek === wk.weekStart;
                        return (
                            <div className={'history-item weigh-week' + (open ? ' open' : '')} key={wk.weekStart}>
                              <button
                                  className="weigh-week-head"
                                  aria-expanded={open}
                                  onClick={() => setOpenWeek(open ? null : wk.weekStart)}
                              >
                                <div className="history-date">
                                    <span className="weigh-week-caret">{open ? '▾' : '▸'}</span>
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
                              </button>
                              {open && (
                                  <WeekEntries
                                      entries={entriesForWeek(log, wk.weekStart)}
                                      onSave={onEditEntry}
                                      onDelete={onDeleteEntry}
                                  />
                              )}
                            </div>
                        );
                    })}
                </>
            );
        }
