        // History: a swipe deck of History cards, one per calendar date, from
        // the date of the first session ever logged through today. A rest day
        // gets a "No workout" card, so a swipe always moves one real date.
        // The rail and the gesture are SwipeRail's, shared with the Workout
        // deck; only horizontal drags move it, and a vertical one scrolls a
        // long card.

        // The "← Week" and "Week →" jump. Seven calendar days, not a Week: the
        // header's "Week N" is a training-week count and does not move.
        const HISTORY_JUMP_DAYS = 7;

        function startOfDate(d) {
            const x = new Date(d);
            x.setHours(0, 0, 0, 0);
            return x;
        }

        // Whole dates from a to b. Rounded because a daylight-saving change
        // makes one date 23 or 25 hours long.
        function datesBetween(a, b) {
            return Math.round((startOfDate(b) - startOfDate(a)) / 86400000);
        }

        function addDates(d, n) {
            const x = startOfDate(d);
            x.setDate(x.getDate() + n);
            return x;
        }

        // A local calendar date as YYYY-MM-DD: the key a History card is
        // found by, and what App keeps as the date History is showing.
        function historyDateKey(d) {
            const x = new Date(d);
            const pad = (n) => String(n).padStart(2, '0');
            return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
        }

        function historyKeyToDate(key) {
            const [y, m, d] = key.split('-').map(Number);
            return new Date(y, m - 1, d);
        }

        // The session's time on the card: per exercise, and the total at the
        // gym. Null for anything logged before August 2026, which carries no
        // per-exercise timestamps, so those cards show no times at all.
        // While the session is today's and not yet submitted, the total runs
        // to now and ticks, answering "how long have I been here so far"; it
        // is recomputed from the clock rather than counted up, so a phone that
        // slept is right on waking. Once 30 minutes pass with no new log it
        // reads the last log again (see getSessionTiming).
        function useHistoryTiming(workout, foregroundAt) {
            const [now, setNow] = React.useState(() => new Date());
            const inProgress = !workout.submitted
                && startOfDate(workout.date).getTime() === startOfDate(now).getTime();
            React.useEffect(() => {
                if (!inProgress) return;
                const id = setInterval(() => setNow(new Date()), 1000);
                return () => clearInterval(id);
            }, [inProgress]);
            return getSessionTiming(workout, foregroundAt, inProgress ? now : null);
        }

        function HistorySession({ workout, workoutHistory, exercises, onEditWorkout, foregroundAt }) {
            // Current-program workouts render against their own day in the
            // current config; older eras keep their stored layout. See
            // getWorkoutExerciseList in utils.js.
            const allExercises = getWorkoutExerciseList(workout, exercises);

            const timing = useHistoryTiming(workout, foregroundAt);
            const timeById = new Map(timing ? timing.rows.map((r) => [r.id, r]) : []);
            const hasEstimate = !!timing && timing.rows.some((r) => r.estimated || r.placeholder);

            return (
                <div className="history-item">
                    <div className="history-date">
                        <span className="history-date-text">
                            <span className="history-date-full">{formatHistoryDate(workout.date)}</span>
                            <span className="history-day-label">
                                {getWorkoutDayLabel(workout)}
                                {timing && (
                                    <span className="history-total" data-history-total>
                                        {' · ' + formatDuration(timing.totalSeconds) + (timing.live ? ' so far' : '')}
                                    </span>
                                )}
                            </span>
                        </span>
                        <button onClick={() => onEditWorkout(workout)} className="settings-btn history-edit"
                                aria-label="Edit workout">
                            <GearIcon />
                        </button>
                    </div>
                    {allExercises.map((expectedExercise) => {
                        const completedExercise = workout.exercises.find(e => e.id === expectedExercise.id);
                        // Not gated on workout.submitted: today's in-progress
                        // entry is already in this list, and the badge should
                        // land the moment the set is logged. Submitting a day
                        // cannot change any badge either way — the baseline
                        // isExercisePRInWorkout compares against is simply the
                        // last session older than this one, submitted or not.
                        const isPR = completedExercise &&
                            isExercisePRInWorkout(completedExercise, workout, workoutHistory);
                        // A lone PR keeps reading "PR", exactly as it
                        // always has. Once the entry sits on a run of two
                        // or more, it borrows the Workout card's pill
                        // instead and says how long the run is — the same
                        // flame and the same count, so the ledger and the
                        // card never describe one streak two ways. Counted
                        // as of this entry, not today, so an older row in
                        // the run keeps the number it earned.
                        const prStreak = isPR && PR_STREAK_TRACKING
                            ? getPRStreakInWorkout(completedExercise, workout, workoutHistory)
                            : 0;
                        const rowTime = timeById.get(expectedExercise.id);
                        return (
                            <div key={expectedExercise.id} className="history-exercise">
                                <div className="history-exercise-title">
                                    <div className="history-exercise-name">{expectedExercise.name}</div>
                                    {isPR ? (
                                        <PRPill streak={prStreak} className="streak-badge history-pr-badge" data-pr-badge
                                                data-streak={prStreak > 1 ? prStreak : undefined} />
                                    ) : null}
                                </div>
                                <div className="history-exercise-data">
                                    <div>{completedExercise ? (
                                        completedExercise.type === 'assault-bike'
                                            ? (completedExercise.intensity && completedExercise.intensity !== 'NA' ? `${completedExercise.intensity}${completedExercise.watts ? ` @ ${completedExercise.watts}W` : ''}` : <span style={{ color: '#555' }}>NA</span>)
                                            : completedExercise.type === 'stairmaster'
                                            ? (completedExercise.time ? `${completedExercise.time} / ${completedExercise.level || 'Level 7'}` : <span style={{ color: '#555' }}>NA</span>)
                                            : (completedExercise.weight && completedExercise.reps
                                                ? `${completedExercise.weight === 'Body Weight' ? 'BW' : completedExercise.weight + 'lbs'} × ${completedExercise.reps}`
                                                : <span style={{ color: '#555' }}>NA</span>)
                                    ) : (
                                        <span style={{ color: '#555' }}>NA</span>
                                    )}</div>
                                    {rowTime && rowTime.seconds !== null && (
                                        <div className="history-exercise-time" data-history-time={expectedExercise.id}>
                                            {formatSecondsToTime(rowTime.seconds) + (rowTime.estimated || rowTime.placeholder ? ' *' : '')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {hasEstimate && (
                        <div className="history-time-note">* estimated: measured from the previous log</div>
                    )}
                </div>
            );
        }

        function formatHistoryDate(d) {
            return new Date(d).toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            });
        }

        // today: App's date string, so the deck grows by a card when the date
        // rolls over. viewingDate: the YYYY-MM-DD key of the card on screen,
        // owned by App so the History tab can put it back on today; a key
        // rather than an index, so a new date added at the end leaves you on
        // the card you were reading.
        function HistoryDeck({ workoutHistory, exercises, onEditWorkout, foregroundAt,
                               today, viewingDate, setViewingDate }) {
            const todayDate = startOfDate(new Date(today));

            const sessionsByDate = new Map();
            let first = todayDate;
            workoutHistory.forEach((w) => {
                const d = startOfDate(w.date);
                if (isNaN(d)) return;
                sessionsByDate.set(historyDateKey(d), w);
                if (d < first) first = d;
            });

            const last = datesBetween(first, todayDate);
            const wanted = viewingDate ? datesBetween(first, historyKeyToDate(viewingDate)) : last;
            const index = Math.max(0, Math.min(last, wanted));
            const setIndex = (i) => setViewingDate(historyDateKey(addDates(first, i)));

            const { go, stageProps, railRef, railStyle, slotProps } =
                useSwipeRail({ index, setIndex, last });

            const renderSlot = (slotOffset) => {
                const i = index + slotOffset;
                if (i < 0 || i > last) return null;
                const date = addDates(first, i);
                const key = historyDateKey(date);
                const workout = sessionsByDate.get(key);
                return (
                    <div key={key} {...slotProps(slotOffset)}>
                        <div className="card history-card" data-history-date={key}>
                            {workout ? (
                                <HistorySession
                                    workout={workout}
                                    workoutHistory={workoutHistory}
                                    exercises={exercises}
                                    onEditWorkout={onEditWorkout}
                                    foregroundAt={foregroundAt}
                                />
                            ) : (
                                <>
                                    <div className="history-date">
                                        <span className="history-date-full">{formatHistoryDate(date)}</span>
                                    </div>
                                    <div className="history-rest">No workout</div>
                                </>
                            )}
                        </div>
                    </div>
                );
            };

            const shown = addDates(first, index);

            return (
                <div className="deck history-deck">
                    <div className="deck-stage" {...stageProps}>
                        <div className="deck-rail" ref={railRef} style={railStyle}>
                            {[-1, 0, 1].map(renderSlot)}
                        </div>
                    </div>

                    <div className="deck-foot history-foot">
                        <button className="text-btn history-jump" onClick={() => go(-HISTORY_JUMP_DAYS)}
                                disabled={index === 0}>← Week</button>
                        <button className="deck-arrow" onClick={() => go(-1)} disabled={index === 0}
                                aria-label="Previous day">‹</button>
                        <div className="deck-progress">
                            <div className="deck-count" data-history-shown={historyDateKey(shown)}>
                                {shown.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </div>
                        </div>
                        <button className="deck-arrow" onClick={() => go(1)} disabled={index === last}
                                aria-label="Next day">›</button>
                        <button className="text-btn history-jump" onClick={() => go(HISTORY_JUMP_DAYS)}
                                disabled={index === last}>Week →</button>
                    </div>
                </div>
            );
        }
