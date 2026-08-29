        function DayBreakdownModal({ onClose, workoutHistory, getCurrentExercises, getPreviousWorkout, foregroundAt }) {
            const [showDetails, setShowDetails] = React.useState(false);
            // Find today's workout
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const todayWorkout = workoutHistory.find(w => {
                const workoutDate = new Date(w.date);
                workoutDate.setHours(0, 0, 0, 0);
                return workoutDate.getTime() === today.getTime();
            });

            if (!todayWorkout) {
                return null;
            }

            // Function to get most recent previous workout for the same exercise (skips NA, no lookback cap)
            const getPreviousWorkoutForExercise = (exerciseId) => {
                const todayDate = new Date(todayWorkout.date);

                // Find all previous workouts with this exercise, most recent first
                const candidates = [];
                const sortedWorkouts = workoutHistory
                    .filter(w => {
                        // Submitted only, matching getPRStreak's session filter.
                        // An abandoned day sits in history with every row
                        // materialised and empty, and comparing against one is
                        // not a comparison against a session that happened.
                        if (!w.submitted) return false;
                        const workoutDate = new Date(w.date);
                        return workoutDate < todayDate;
                    })
                    .sort((a, b) => new Date(b.date) - new Date(a.date));

                for (let workout of sortedWorkouts) {
                    const exercise = workout.exercises.find(e => e.id === exerciseId);
                    if (exercise) {
                        candidates.push(exercise);
                    }
                }

                console.log('Found', candidates.length, 'candidate(s)');

                // Return first candidate that doesn't have "NA" values (check appropriate field based on exercise type)
                for (let candidate of candidates) {
                    // For assault bike, check intensity
                    if (candidate.type === 'assault-bike') {
                        if (candidate.intensity && candidate.intensity !== 'NA') {
                            console.log('Returning valid assault-bike workout with intensity:', candidate.intensity);
                            return candidate;
                        }
                    }
                    // For stairmaster, check time
                    else if (candidate.type === 'stairmaster') {
                        if (candidate.time && candidate.time !== 'NA') {
                            console.log('Returning valid stairmaster workout with time:', candidate.time);
                            return candidate;
                        }
                    }
                    // For standard/bodyweight exercises, check reps
                    else {
                        if (candidate.reps && candidate.reps !== 'NA') {
                            console.log('Returning valid workout with reps:', candidate.reps);
                            return candidate;
                        }
                    }
                }

                console.log('All candidates have NA values or no valid candidates found');
                // If all candidates have NA values (or no valid candidates), return the most recent one
                return candidates.length > 0 ? candidates[0] : null;
            };

            // Get only exercises that match the current day
            const currentDayExerciseIds = new Set(getCurrentExercises().map(e => e.id));
            const currentDayWorkoutExercises = todayWorkout.exercises.filter(e => currentDayExerciseIds.has(e.id));

            // Calculate PRs (just count them)
            let prCount = 0;
            currentDayWorkoutExercises.forEach(exercise => {
                if (!exercise.weight && !exercise.reps && !exercise.intensity && !exercise.time) {
                    return; // Skip NA exercises
                }

                // Cardio movements (stairmaster today; assault bike and the
                // bodyweight pair on retired Cardio days) just carry over last
                // session — they never count as PRs.
                if (exercise.type === 'assault-bike' || exercise.type === 'stairmaster' || exercise.type === 'bodyweight') {
                    return;
                }

                const previous = getPreviousWorkoutForExercise(exercise.id);
                if (!previous) {
                    console.log('No previous data for:', exercise.name);
                    return; // Skip if no previous workout
                }

                // isImprovement (plateauLogic.js) is the app's one definition
                // of a lift moving forward, and the flame streak badge on the
                // card runs off the same call. This used to be a second, looser
                // rule living here — `weight up OR reps up`, gated on reps >= 4 —
                // which counted a weight DROP as a PR whenever the reps rose. A
                // plateau buster drops the weight deliberately, so the recovery
                // session scored a PR for backing off, and the badge and this
                // count could disagree about the very same session.
                console.log('Comparison:', exercise.name,
                    'Current:', exercise.weight, 'lbs x', exercise.reps,
                    'Previous:', previous.weight, 'lbs x', previous.reps);

                if (isImprovement(exercise, previous)) {
                    console.log('PR detected for:', exercise.name);
                    prCount++;
                }
            });

            console.log('Total PR count:', prCount);

            // Count completed exercises (only for current day, excluding NA)
            const completedCount = currentDayWorkoutExercises.filter(e => {
                // Check if exercise has valid data (not NA)
                if (e.type === 'assault-bike') {
                    return e.intensity && e.intensity !== 'NA';
                } else if (e.type === 'stairmaster') {
                    return e.time && e.time !== 'NA';
                } else if (e.type === 'bodyweight') {
                    return e.reps && e.reps !== 'NA';
                } else {
                    return (e.weight && e.weight !== 'NA') || (e.reps && e.reps !== 'NA');
                }
            }).length;
            const totalCount = getCurrentExercises().length;

            // Reconstructed from the per-exercise timestamps logExercise
            // stamps. Null for any workout logged before August 2026, which
            // carries none — the whole block is then left out rather than
            // rendering a zero.
            const timing = getSessionTiming(todayWorkout, foregroundAt);
            const hasEstimatedRow = !!timing && timing.rows.some(r => r.estimated);

            const date = new Date(todayWorkout.date);
            const formattedDate = date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            return (
                <div className="modal-overlay" onClick={onClose}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="modal-title">{getWorkoutDayLabel(todayWorkout)} Day Breakdown</div>

                        <div style={{ marginBottom: '20px', color: '#888', fontSize: '14px' }}>
                            {formattedDate}
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '10px' }}>
                                Exercises Completed
                            </div>
                            <div style={{ fontSize: '32px', fontWeight: '700', color: 'var(--accent)' }}>
                                {completedCount} / {totalCount}
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '10px' }}>
                                PRs Smashed
                            </div>
                            <div data-pr-count style={{ fontSize: '32px', fontWeight: '700', color: 'var(--accent)' }}>
                                {prCount}
                            </div>
                        </div>

                        {timing && (
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '10px' }}>
                                    Time at the Gym
                                </div>
                                <div data-timing-total style={{ fontSize: '32px', fontWeight: '700', color: 'var(--accent)' }}>
                                    {formatDuration(timing.totalSeconds)}
                                </div>
                            </div>
                        )}

                        {timing && (
                            <button
                                className="modal-btn"
                                onClick={() => setShowDetails(!showDetails)}
                                style={{ marginBottom: '12px' }}
                            >
                                {showDetails ? 'Hide Details' : 'View More Details'}
                            </button>
                        )}

                        {timing && showDetails && (
                            <div data-timing-details style={{ marginBottom: '20px', fontSize: '14px' }}>
                                {timing.rows.map(row => (
                                    <div
                                        key={row.id}
                                        data-timing-row={row.id}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            gap: '12px',
                                            padding: '6px 0',
                                            borderBottom: '1px solid #2a2a3a'
                                        }}
                                    >
                                        <span>{row.name}</span>
                                        <span style={{ fontWeight: '600', whiteSpace: 'nowrap' }}>
                                            {row.seconds === null
                                                ? 'NA'
                                                : formatSecondsToTime(row.seconds) + (row.estimated ? ' *' : '')}
                                        </span>
                                    </div>
                                ))}
                                {hasEstimatedRow && (
                                    <div style={{ marginTop: '10px', color: '#888', fontSize: '12px' }}>
                                        * estimated — Weight Breakdown was not opened for this movement,
                                        so it is measured from the previous log
                                    </div>
                                )}
                            </div>
                        )}

                        <button className="modal-btn primary" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>
            );
        }
