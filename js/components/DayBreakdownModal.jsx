        function DayBreakdownModal({ onClose, workoutHistory, currentDay, getCurrentExercises, getPreviousWorkout }) {
            // Find today's workout
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const todayWorkout = workoutHistory.find(w => {
                const workoutDate = new Date(w.date);
                workoutDate.setHours(0, 0, 0, 0);
                const isSameDay = workoutDate.getTime() === today.getTime();
                const isSameWorkoutDay = w.day === currentDay;
                return isSameDay && isSameWorkoutDay;
            });

            if (!todayWorkout) {
                return null;
            }

            // Function to get most recent previous workout for the same exercise (looks back up to 3 sessions, skips NA)
            const getPreviousWorkoutForExercise = (exerciseId) => {
                const todayDate = new Date(todayWorkout.date);

                console.log('Looking for previous workout for:', exerciseId, 'Current day type:', currentDay);

                // Find up to 3 most recent workouts of the same day type (before today) with this exercise
                const candidates = [];
                const sortedWorkouts = workoutHistory
                    .filter(w => {
                        const workoutDate = new Date(w.date);
                        return w.day === currentDay && workoutDate < todayDate;
                    })
                    .sort((a, b) => new Date(b.date) - new Date(a.date));

                for (let workout of sortedWorkouts) {
                    if (candidates.length >= 3) break; // Stop after finding 3 candidates

                    const exercise = workout.exercises.find(e => e.id === exerciseId);
                    if (exercise) {
                        candidates.push(exercise);
                    }
                }

                console.log('Found', candidates.length, 'candidate(s)');

                // Return first candidate that doesn't have "NA" values (check appropriate field based on exercise type)
                for (let candidate of candidates) {
                    // For assault bike, check watts
                    if (candidate.type === 'assault-bike') {
                        if (candidate.watts && candidate.watts !== 'NA') {
                            console.log('Returning valid assault-bike workout with watts:', candidate.watts);
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
                if (!exercise.weight && !exercise.reps && !exercise.watts && !exercise.time) {
                    return; // Skip NA exercises
                }

                const previous = getPreviousWorkoutForExercise(exercise.id);
                if (!previous) {
                    console.log('No previous data for:', exercise.name);
                    return; // Skip if no previous workout
                }

                let isPR = false;

                if (exercise.type === 'assault-bike') {
                    if (parseInt(exercise.watts) > parseInt(previous.watts || 0)) {
                        isPR = true;
                    }
                } else if (exercise.type === 'stairmaster') {
                    const currentSeconds = parseTimeToSeconds(exercise.time);
                    const previousSeconds = parseTimeToSeconds(previous.time);
                    if (currentSeconds > previousSeconds) {
                        isPR = true;
                    }
                } else if (exercise.type === 'bodyweight') {
                    const currentReps = parseInt(exercise.reps);
                    const previousReps = parseInt(previous.reps || 0);
                    console.log('Bodyweight comparison:', exercise.name, 'Current:', currentReps, 'Previous:', previousReps);
                    if (currentReps > previousReps && currentReps >= 4) {
                        isPR = true;
                    }
                } else {
                    // Standard exercise - PR if weight OR reps increased (and reps >= 4)
                    const currentWeight = parseFloat(exercise.weight);
                    const previousWeight = parseFloat(previous.weight);
                    const currentReps = parseInt(exercise.reps);
                    const previousReps = parseInt(previous.reps);

                    console.log('Standard comparison:', exercise.name, 'Current:', currentWeight, 'lbs x', currentReps, 'Previous:', previousWeight, 'lbs x', previousReps);

                    if ((currentWeight > previousWeight || currentReps > previousReps) && currentReps >= 4) {
                        isPR = true;
                    }
                }

                if (isPR) {
                    console.log('PR detected for:', exercise.name);
                    prCount++;
                }
            });

            console.log('Total PR count:', prCount);

            // Count completed exercises (only for current day, excluding NA)
            const completedCount = currentDayWorkoutExercises.filter(e => {
                // Check if exercise has valid data (not NA)
                if (e.type === 'assault-bike') {
                    return e.watts && e.watts !== 'NA';
                } else if (e.type === 'stairmaster') {
                    return e.time && e.time !== 'NA';
                } else if (e.type === 'bodyweight') {
                    return e.reps && e.reps !== 'NA';
                } else {
                    return (e.weight && e.weight !== 'NA') || (e.reps && e.reps !== 'NA');
                }
            }).length;
            const totalCount = getCurrentExercises().length;

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
                        <div className="modal-title">{currentDay === 1 ? 'Anterior' : 'Posterior'} Day Breakdown</div>

                        <div style={{ marginBottom: '20px', color: '#888', fontSize: '14px' }}>
                            {formattedDate}
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '10px' }}>
                                Exercises Completed
                            </div>
                            <div style={{ fontSize: '32px', fontWeight: '700', color: '#3a2a5a' }}>
                                {completedCount} / {totalCount}
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '10px' }}>
                                PRs Smashed
                            </div>
                            <div style={{ fontSize: '32px', fontWeight: '700', color: '#3a2a5a' }}>
                                {prCount}
                            </div>
                        </div>

                        <button className="modal-btn primary" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>
            );
        }
