        // The workout screen: one exercise at a time, swiped through.
        //
        // Why this shape at all — the honest reason is measurement, not looks.
        // Session timing runs from the Weight Breakdown tap to the LOG, and that
        // tap kept not happening, because its only reward was a warmup table.
        // Putting the working weight behind the same gesture fixes the incentive:
        // you cannot start a set without opening the card, so the clock cannot go
        // unstarted. Every asterisked "estimated" row in the Day Breakdown is a
        // set this screen is designed to stop producing.
        //
        // Gestures are hand-written pointer events. There is no gesture library
        // here and no build step to add one, and pointer events cover mouse and
        // touch in a single path — which is also what makes this checkable in
        // desktop Firefox before it goes near a gym.

        // How far a drag has to travel to count. Horizontal scales with the card
        // so it feels the same on a phone and a laptop; vertical is a flat pixel
        // distance because card height varies far more than a thumb flick does.
        // A gesture commits on EITHER distance or speed. Distance alone forces
        // a bad trade: set it long and quick flicks get ignored, set it short
        // and a card you grabbed to read slides away under your thumb. Speed is
        // what separates the two intents, so a fast flick goes through however
        // short it is, while a slow deliberate drag still has to cross the line.
        const SWIPE_H_FRACTION = 0.18;
        const SWIPE_V_PIXELS = 58;
        // px per ms. About the speed of a flick that is unmistakably a flick.
        const FLICK_SPEED = 0.45;
        // A flick still has to travel far enough to not be a tap with a wobble.
        const FLICK_MIN_PIXELS = 22;
        // Below this, a drag has no direction yet and we refuse to guess — it is
        // what stops a sloppy diagonal doing two things at once.
        const AXIS_LOCK_PIXELS = 10;
        // Gap between neighbouring cards on the rail. Must match --deck-gap.
        const DECK_GAP = 14;
        // Must match the .deck-rail transition. A card you have left is closed
        // only after the rail has carried it off-stage — closing it any sooner
        // snaps it from open to nameplate while it is still in full view.
        const RAIL_MS = 300;

        function SwipeDeck({ workoutData, loggedExercises, handleInputChange, getPreviousWorkout,
                             logExercise, completeDay, getCurrentExercises, currentWeek,
                             workoutHistory, expandedWeightBreakdown, openWeightBreakdown,
                             closeWeightBreakdown, activeDayType, setActiveDayType, foregroundAt }) {
            const exercises = getCurrentExercises();
            // One slot past the last exercise is the finish card.
            const finishIndex = exercises.length;
            const [index, setIndex] = React.useState(0);
            // Whether a finger is down. The drag ITSELF is deliberately not
            // React state: setDrag on every pointermove re-rendered this
            // component and all three mounted cards dozens of times a second
            // purely to move a transform, which is what made the swipe feel
            // coarse. The live transform is written straight to the node
            // instead, so a gesture costs two renders — down and up — rather
            // than one per event.
            const [dragging, setDragging] = React.useState(false);
            // How far the rail is displaced from its resting position, in px.
            // A move sets this to where the rail *was* and then animates it to
            // zero, which is the trick that keeps the deck responsive: the
            // index commits immediately, so a second swipe never has to wait
            // for an animation to finish and can never be dropped.
            const [offset, setOffset] = React.useState(0);
            const [animating, setAnimating] = React.useState(false);
            const offsetRef = React.useRef(0);
            offsetRef.current = offset;
            const gesture = React.useRef(null);
            const stageRef = React.useRef(null);
            const railRef = React.useRef(null);
            const activeSlotRef = React.useRef(null);
            const raf = React.useRef(null);
            const paintFrame = React.useRef(null);
            const collapseTimer = React.useRef(null);

            // A day switch swaps the whole roster, so an index into the old one
            // is meaningless.
            React.useEffect(() => {
                setIndex(0); setOffset(0); closeWeightBreakdown();
            }, [activeDayType]);
            React.useEffect(() => () => {
                cancelAnimationFrame(raf.current);
                cancelAnimationFrame(paintFrame.current);
                clearTimeout(collapseTimer.current);
            }, []);

            const clamp = (i) => Math.max(0, Math.min(finishIndex, i));

            // `dir` is the direction the rail should APPEAR to travel, which
            // is not always the distance travelled: a post-log jump can cross
            // most of the deck, and sliding eleven cards' worth would read as a
            // glitch. One card of movement in the right direction is the honest
            // signal — where you landed is what the counter is for.
            const goTo = (target, dir) => {
                if (target === index) { setOffset(0); return; }

                // Leaving an open card closes it. Walking back to a machine
                // should start a fresh clock rather than resume a stale one,
                // and a panel still open from minutes ago would let you log
                // against an anchor that no longer means anything — the exact
                // dishonest measurement this screen exists to prevent.
                //
                // Deliberately NOT cancelled if you swipe straight back: the
                // point is that returning finds the card shut.
                const leaving = exercises[index];
                if (leaving && expandedWeightBreakdown === leaving.id) {
                    clearTimeout(collapseTimer.current);
                    collapseTimer.current = setTimeout(closeWeightBreakdown, RAIL_MS);
                }

                const step = (stageRef.current ? stageRef.current.offsetWidth : 0) + DECK_GAP;
                // Commit first, then put the rail back where the eye last saw
                // it and let it travel home.
                setIndex(target);
                setAnimating(false);
                setOffset(dir * step);
                // Two frames: one for the browser to paint the displaced rail,
                // one to start the transition from it. Skipping this makes the
                // offset and the transition land together and nothing moves.
                cancelAnimationFrame(raf.current);
                raf.current = requestAnimationFrame(() => {
                    raf.current = requestAnimationFrame(() => {
                        setAnimating(true);
                        setOffset(0);
                    });
                });
            };

            // Manual navigation always steps one card. Only the jump after a
            // LOG skips ahead — swiping is how you browse, and a swipe that
            // silently vaulted over three cards would make the deck impossible
            // to read.
            const go = (delta) => goTo(clamp(index + delta), delta);

            const exercise = index < finishIndex ? exercises[index] : null;
            // A logged card is always shown open. It is a review at that point,
            // and making you swipe up again to read back what you just recorded
            // is friction for nothing. Note this needs no new state and does not
            // touch the timing path: logExercise has already dropped the anchor
            // and cleared expandedWeightBreakdown by the time isLogged is true,
            // so a logged card is open by virtue of being logged rather than by
            // holding an anchor — which is also why the close-on-leave rule
            // above never fires for one.
            const revealedFor = (ex) => !!ex && (!!loggedExercises[ex.id] || expandedWeightBreakdown === ex.id);
            const isRevealed = revealedFor(exercise);

            // ---- Gestures ----------------------------------------------------
            //
            // Nothing here calls setState while a finger is moving. The live
            // transform is written to the node inside a single rAF, so however
            // fast pointermove fires we paint at most once per frame and never
            // re-render React mid-gesture.
            const paint = () => {
                paintFrame.current = null;
                const g = gesture.current;
                if (!g || !g.axis) return;
                if (g.axis === 'x') {
                    const el = railRef.current;
                    if (!el) return;
                    el.style.transition = 'none';
                    el.style.transform = 'translateX(' + g.dx + 'px)';
                } else {
                    const el = activeSlotRef.current;
                    if (!el) return;
                    // Downward drags have no meaning here; damp them so the
                    // card feels anchored rather than broken.
                    const dy = g.dy < 0 ? g.dy : g.dy * 0.2;
                    el.style.transition = 'none';
                    el.style.transform = 'translateY(' + dy + 'px)';
                }
            };

            const onPointerDown = (e) => {
                const control = e.target.closest('input, select, button, a');
                const now = e.timeStamp || performance.now();
                gesture.current = {
                    x: e.clientX, y: e.clientY, axis: null, dx: 0, dy: 0,
                    width: e.currentTarget.offsetWidth || 320,
                    // The control this gesture began on, if any. A gesture that
                    // starts on the weight box is not yet a swipe and not yet a
                    // tap — only movement decides, so we track it and wait.
                    control,
                    captured: false,
                    hijacked: false,
                    lastX: e.clientX, lastY: e.clientY, lastT: now,
                    vx: 0, vy: 0,
                };
                // Capture immediately ONLY when the gesture started on bare
                // card. Capturing over a field steals the tap from it, and the
                // reps dropdown stops opening — which is the bug the old
                // blanket bail-out was avoiding, at the cost of making those
                // fields dead zones for swiping.
                if (!control) {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    gesture.current.captured = true;
                }
                setDragging(true);
            };

            const onPointerMove = (e) => {
                const g = gesture.current;
                if (!g) return;
                g.dx = e.clientX - g.x;
                g.dy = e.clientY - g.y;
                if (!g.axis && Math.hypot(g.dx, g.dy) > AXIS_LOCK_PIXELS) {
                    g.axis = Math.abs(g.dx) > Math.abs(g.dy) ? 'x' : 'y';
                    // Movement has settled the question: this is a drag, not a
                    // tap. Take the pointer off the field now, and remember to
                    // swallow the tap it would otherwise fire on release.
                    if (g.control && !g.captured) {
                        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
                        g.captured = true;
                        g.hijacked = true;
                        // Blur so a keyboard cannot come up mid-swipe.
                        if (document.activeElement === g.control) g.control.blur();
                    }
                }
                const now = e.timeStamp || performance.now();
                const dt = now - g.lastT;
                if (dt > 0) {
                    g.vx = (e.clientX - g.lastX) / dt;
                    g.vy = (e.clientY - g.lastY) / dt;
                    g.lastX = e.clientX; g.lastY = e.clientY; g.lastT = now;
                }
                if (paintFrame.current === null) {
                    paintFrame.current = requestAnimationFrame(paint);
                }
            };

            const onPointerUp = () => {
                const g = gesture.current;
                gesture.current = null;
                cancelAnimationFrame(paintFrame.current);
                paintFrame.current = null;
                if (!g) return;

                // A drag that began on a field would still fire a click on
                // release — focusing the input, or opening the reps picker,
                // right as the card slides away. Swallow exactly one, and clear
                // the trap shortly after in case no click ever comes.
                if (g.hijacked) {
                    const swallow = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
                    document.addEventListener('click', swallow, { capture: true, once: true });
                    setTimeout(() => document.removeEventListener('click', swallow, true), 400);
                }

                // Put the nodes back to exactly the values React believes it
                // rendered, and let the CSS transition carry them there.
                //
                // Restoring these explicitly is not optional. React diffs
                // against its own previous props, so after `paint` has written
                // a transform behind its back the next render sees an unchanged
                // style prop and leaves the node alone — the dragged transform
                // then sticks forever. That is a stuck card, not a slow one,
                // and it looked like the reveal had broken.
                if (railRef.current) {
                    railRef.current.style.transition = '';
                    railRef.current.style.transform = 'translateX(' + offsetRef.current + 'px)';
                }
                if (activeSlotRef.current) {
                    activeSlotRef.current.style.transition = '';
                    activeSlotRef.current.style.transform = 'translateY(0px)';
                }
                setDragging(false);

                const flickedX = Math.abs(g.vx) > FLICK_SPEED && Math.abs(g.dx) > FLICK_MIN_PIXELS;
                if (g.axis === 'x' && (Math.abs(g.dx) > g.width * SWIPE_H_FRACTION || flickedX)) {
                    go(g.dx < 0 ? 1 : -1);
                    return;
                }
                // Up on an unrevealed card is the whole point of the screen: it
                // is openWeightBreakdown, which is what stamps startedAt.
                const flickedUp = g.vy < -FLICK_SPEED && g.dy < -FLICK_MIN_PIXELS;
                if (g.axis === 'y' && (g.dy < -SWIPE_V_PIXELS || flickedUp) && exercise && !isRevealed) {
                    openWeightBreakdown(exercise.id);
                }
            };

            // The rail carries previous, current and next together, so a drag
            // shows the neighbours sliding in rather than black nothing. While
            // a finger is down this is only the STARTING value — `paint` above
            // owns the node until the finger lifts.
            const railStyle = () => ({
                transform: 'translateX(' + offset + 'px)',
                transition: (animating && !dragging) ? undefined : 'none',
            });

            // Where to land after a LOG: the earliest unlogged card in the
            // roster, wherever it is. If there is none, the day is done and the
            // finish card is the answer.
            //
            // This deliberately does NOT prefer cards ahead of you. Preferring
            // forward reads well — sweep the floor, collect stragglers at the
            // end — but it means a machine you skipped early stays skipped for
            // most of the session, and the roster order is the order the
            // program intends. Filling the earliest hole first keeps the day in
            // its designed sequence and makes "what is left" always the thing
            // in front of you.
            //
            // `loggedExercises` has not caught up at this point — logExercise
            // sets it — so the card just logged is treated as done explicitly,
            // or the scan would find it and jump straight back onto it.
            const onLog = (id) => {
                logExercise(id);
                const done = (ex) => ex.id === id || !!loggedExercises[ex.id];

                let target = finishIndex;
                for (let i = 0; i < finishIndex; i++) {
                    if (!done(exercises[i])) { target = i; break; }
                }

                goTo(target, target > index ? 1 : -1);
            };

            // ---- Finish card -------------------------------------------------
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const todayWorkout = workoutHistory.find((w) => {
                const d = new Date(w.date); d.setHours(0, 0, 0, 0);
                return d.getTime() === today.getTime();
            });
            const doneCount = exercises.filter((ex) => loggedExercises[ex.id]).length;
            const timing = todayWorkout ? getSessionTiming(todayWorkout, foregroundAt) : null;

            const renderFinish = () => (
                <div className="card card-finish">
                    <div className="finish-title">
                        {doneCount === 0 ? 'Nothing logged yet' : 'Day complete'}
                    </div>
                    <div className="finish-stats">
                        <div className="finish-stat">
                            <div className="finish-stat-value">{doneCount}<span className="finish-stat-of">/{exercises.length}</span></div>
                            <div className="finish-stat-label">logged</div>
                        </div>
                        {timing ? (
                            <div className="finish-stat">
                                <div className="finish-stat-value">{formatDuration(timing.totalSeconds)}</div>
                                <div className="finish-stat-label">at the gym</div>
                            </div>
                        ) : null}
                    </div>
                    <button className="save-btn" onClick={completeDay}>
                        Submit Day
                    </button>
                    <div className="finish-back">swipe back to keep going</div>
                </div>
            );

            // One rail slot. `offset` is -1, 0 or 1 relative to the current
            // card. Only the middle one takes input.
            const renderSlot = (slotOffset) => {
                const i = index + slotOffset;
                if (i < 0 || i > finishIndex) return null;
                const ex = i < finishIndex ? exercises[i] : null;
                return (
                    <div
                        key={ex ? ex.id : 'finish'}
                        className="deck-slot"
                        ref={slotOffset === 0 ? activeSlotRef : null}
                        style={{
                            left: 'calc((100% + var(--deck-gap)) * ' + slotOffset + ')',
                            // Vertical drags move only the active card, and
                            // while one is in progress `paint` owns this node.
                            transform: 'translateY(0px)',
                            transition: dragging ? 'none' : undefined,
                        }}
                        aria-hidden={slotOffset !== 0}
                    >
                        {ex ? (
                            <ExerciseCard
                                exercise={ex}
                                previous={getPreviousWorkout(ex.id)}
                                isLogged={!!loggedExercises[ex.id]}
                                isRevealed={revealedFor(ex)}
                                data={workoutData[ex.id] || {}}
                                workoutHistory={workoutHistory}
                                currentWeek={currentWeek}
                                handleInputChange={handleInputChange}
                                onLog={onLog}
                            />
                        ) : renderFinish()}
                    </div>
                );
            };

            return (
                <div className="deck">
                    <div className="day-toggle" data-day-type-toggle>
                        {['anterior', 'posterior'].map((type) => (
                            <button
                                key={type}
                                data-day-type={type}
                                className={'day-pill' + (activeDayType === type ? ' active' : '')}
                                onClick={() => setActiveDayType(type)}
                            >
                                {type === 'anterior' ? 'Anterior' : 'Posterior'}
                            </button>
                        ))}
                    </div>

                    <div
                        className="deck-stage"
                        ref={stageRef}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                    >
                        <div className="deck-rail" ref={railRef} style={railStyle()}>
                            {[-1, 0, 1].map(renderSlot)}
                        </div>
                    </div>

                    <div className="deck-foot">
                        <button className="deck-arrow" onClick={() => go(-1)} disabled={index === 0}
                                aria-label="Previous exercise">‹</button>
                        <div className="deck-progress">
                            <div className="deck-count">
                                {exercise ? (index + 1) + ' of ' + exercises.length : 'finish'}
                            </div>
                            <div className="deck-bar">
                                <div className="deck-bar-fill"
                                     style={{ width: (exercises.length ? (doneCount / exercises.length) * 100 : 0) + '%' }} />
                            </div>
                        </div>
                        <button className="deck-arrow" onClick={() => go(1)} disabled={index === finishIndex}
                                aria-label="Next exercise">›</button>
                    </div>
                </div>
            );
        }
