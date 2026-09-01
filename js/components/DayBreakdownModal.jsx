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

            // Get only exercises that match the current day
            const currentDayExerciseIds = new Set(getCurrentExercises().map(e => e.id));
            const currentDayWorkoutExercises = todayWorkout.exercises.filter(e => currentDayExerciseIds.has(e.id));

            // Calculate PRs (just count them)
            let prCount = 0;
            currentDayWorkoutExercises.forEach(exercise => {
                // Day Breakdown's PR count, History's PR badge, and the
                // workout-card flame streak all use the same "lift moved
                // forward" definition: weight up, or same weight with more
                // reps. A separate copy of that rule already drifted once.
                if (isExercisePRInWorkout(exercise, todayWorkout, workoutHistory)) {
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

                        {timing && showDetails && <TimingDetails timing={timing} />}

                        <button className="modal-btn primary" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>
            );
        }
