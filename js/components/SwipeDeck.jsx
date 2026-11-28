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
        // The rail, the gestures and their thresholds live in SwipeRail.jsx,
        // shared with History. What is left here is what a card IS on this
        // screen: an exercise you open, log and leave.
        const PR_CELEBRATION_MS = 2000;

        // The History Time button's live total, pinned above the card for the whole of
        // an unsubmitted day. getSessionTiming returns null until something is
        // logged, so opening cards alone shows nothing — but the first LOG
        // reveals a clock that already counts from that card's opening swipe.
        // It ticks in its own component so the deck and its three mounted
        // cards are not re-rendered every second; recomputed from the clock
        // rather than counted up, so a phone that slept is right on waking.
        function SessionClock({ workout, foregroundAt }) {
            const [now, setNow] = React.useState(() => new Date());
            React.useEffect(() => {
                const id = setInterval(() => setNow(new Date()), 1000);
                return () => clearInterval(id);
            }, []);

            const timing = getSessionTiming(workout, foregroundAt, now);
            if (!timing) return null;
            return (
                <div className="session-clock" data-session-clock>
                    <span data-session-clock-total>
                        {formatDuration(timing.totalSeconds)
                            + (timing.live ? ` ${timing.totalSeconds % 60}s` : '')}
                    </span>
                    <span className="session-clock-label">at the gym</span>
                </div>
            );
        }

        function SwipeDeck({ workoutData, loggedExercises, handleInputChange, getPreviousWorkout,
                             logExercise, completeDay, getCurrentExercises, currentWeek,
                             workoutHistory, expandedWeightBreakdown, openWeightBreakdown,
                             closeWeightBreakdown, activeDayType, foregroundAt,
                             deckIndex, setDeckIndex, onEditExercise }) {
            const exercises = getCurrentExercises();
            // One slot past the last exercise is the finish card.
            const finishIndex = exercises.length;
            // Owned by App, not held here — see the deckIndex comment there.
            // Clamped on the way in because the roster can shrink underneath a
            // stored position: a Settings reorder, or a day whose exercise list
            // is shorter than the one the number was written against.
            const index = Math.max(0, Math.min(finishIndex, deckIndex));
            const setIndex = setDeckIndex;
            const collapseTimer = React.useRef(null);
            // The card that timer is due to close, so an unmount can finish the
            // job instead of cancelling it.
            const collapsePending = React.useRef(null);
            const celebrationTimer = React.useRef(null);
            const [celebratingId, setCelebratingId] = React.useState(null);

            const clearCelebration = () => {
                clearTimeout(celebrationTimer.current);
                celebrationTimer.current = null;
                setCelebratingId(null);
            };

            // Leaving a card is where this screen differs from History: it
            // clears a celebration, and an open card closes behind you.
            const onMove = (target) => {
                clearCelebration();
                if (target === index) return;

                // Leaving an open card closes it. Walking back to a machine
                // should start a fresh clock rather than resume a stale one,
                // and a panel still open from minutes ago would let you log
                // against an anchor that no longer means anything — the exact
                // dishonest measurement this screen exists to prevent.
                //
                // Deliberately NOT cancelled if you swipe straight back: the
                // point is that returning finds the card shut.
                // The close names the card it is closing. It fires after the
                // rail has carried that card off-screen, and in that window you
                // can already have opened the NEXT one — a blanket close would
                // then wipe a reveal that had nothing to do with the card you
                // left, taking its freshly stamped anchor with it. Swiping on
                // and immediately opening the next machine is not an unusual
                // thing to do; it is the normal thing to do.
                const leaving = exercises[index];
                if (leaving && expandedWeightBreakdown === leaving.id) {
                    clearTimeout(collapseTimer.current);
                    collapsePending.current = leaving.id;
                    collapseTimer.current = setTimeout(() => {
                        collapsePending.current = null;
                        closeWeightBreakdown(leaving.id);
                    }, RAIL_MS);
                }
            };

            // Up on an unrevealed card is the whole point of the screen: it is
            // openWeightBreakdown, which is what stamps startedAt. Down opens
            // this exercise's settings over the deck. Nothing here closes the
            // panel or touches the anchor, so an open card keeps its startedAt
            // and is still open when the settings close.
            const vertical = {
                // Down only needs to hint at moving; damp it so the card feels
                // anchored rather than broken.
                damp: (dy) => (dy < 0 ? dy : dy * 0.2),
                onRelease: (g) => {
                    const flickedUp = g.vy < -FLICK_SPEED && g.dy < -FLICK_MIN_PIXELS;
                    if ((g.dy < -SWIPE_V_PIXELS || flickedUp) && exercise && !isRevealed) {
                        openWeightBreakdown(exercise.id);
                        return;
                    }
                    const flickedDown = g.vy > FLICK_SPEED && g.dy > FLICK_MIN_PIXELS;
                    if ((g.dy > SWIPE_V_PIXELS || flickedDown) && exercise) {
                        onEditExercise(exercise.id);
                    }
                },
            };

            // Manual navigation always steps one card. Only the jump after a
            // LOG skips ahead — swiping is how you browse, and a swipe that
            // silently vaulted over three cards would make the deck impossible
            // to read.
            const { goTo, go, reset, stageProps, railRef, railStyle, slotProps } =
                useSwipeRail({ index, setIndex, last: finishIndex, onMove, vertical });

            // A day switch swaps the whole roster, so an index into the old one
            // is meaningless.
            //
            // Guarded against firing on MOUNT, which is the whole point of the
            // ref. This effect used to run on every mount as well as every
            // change, and since the deck is unmounted while History is on
            // screen, coming back from History ran the day-switch reset: card
            // one, panel shut. Nothing had switched. The day toggle has lived in
            // Settings since Nov 2026, so a switch can now happen while the deck
            // is unmounted (Settings over History); App's showDay does the
            // index and panel reset itself for that case, and this effect is
            // what clears a celebration when the deck is mounted.
            const lastDayType = React.useRef(activeDayType);
            React.useEffect(() => {
                if (lastDayType.current === activeDayType) return;
                lastDayType.current = activeDayType;
                clearCelebration();
                setIndex(0); reset(); closeWeightBreakdown();
            }, [activeDayType]);
            React.useEffect(() => () => {
                clearTimeout(collapseTimer.current);
                clearTimeout(celebrationTimer.current);
                // A card left mid-collapse has to still be closed. Now that the
                // open panel outlives this component, dropping the pending
                // close on unmount would leave the card you swiped OFF sitting
                // open with its old anchor — so a swipe away followed straight
                // away by a tap on History would preserve exactly the stale
                // clock the delayed close exists to throw out.
                if (collapsePending.current) {
                    closeWeightBreakdown(collapsePending.current);
                    collapsePending.current = null;
                }
            }, []);

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
            // or the scan would find it and jump straight back onto it. A PR is
            // the one exception to the instant jump: keep the logged review in
            // front of the user long enough for the gold celebration to read,
            // then auto-advance to the same target.
            const onLog = (id) => {
                const result = logExercise(id);
                if (!result?.logged) return;

                const done = (ex) => ex.id === id || !!loggedExercises[ex.id];

                let target = finishIndex;
                for (let i = 0; i < finishIndex; i++) {
                    if (!done(exercises[i])) { target = i; break; }
                }

                if (result.isPR) {
                    clearTimeout(celebrationTimer.current);
                    setCelebratingId(id);
                    celebrationTimer.current = setTimeout(() => {
                        celebrationTimer.current = null;
                        goTo(target, target > index ? 1 : -1);
                    }, PR_CELEBRATION_MS);
                    return;
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
            // A submitted day is over, so only an unsubmitted one gets the clock.
            const liveWorkout = workoutHistory.find((w) => {
                const d = new Date(w.date); d.setHours(0, 0, 0, 0);
                return d.getTime() === today.getTime() && !w.submitted;
            });

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
                    <div key={ex ? ex.id : 'finish'} {...slotProps(slotOffset)}>
                        {ex ? (
                            <ExerciseCard
                                exercise={ex}
                                previous={getPreviousWorkout(ex.id)}
                                isLogged={!!loggedExercises[ex.id]}
                                isCelebrating={celebratingId === ex.id}
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
                    {liveWorkout && <SessionClock workout={liveWorkout} foregroundAt={foregroundAt} />}

                    <div className="deck-stage" {...stageProps}>
                        <div className="deck-rail" ref={railRef} style={railStyle}>
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
