        const { useState } = React;

        function EditWorkoutModal({ workout, onClose, onSave, exercises }) {
            const [editedExercises, setEditedExercises] = useState(workout.exercises);
            // Use the full-body config only for full-body-era workouts; otherwise
            // (e.g. a Cardio-day workout) edit the exercises stored on the workout
            // itself, so cardio sessions render their own cards. Mirrors WeeklyView.
            const fbExerciseIds = new Set(exercises.map(e => e.id));
            const isFullBodyEra = workout.exercises.every(e => fbExerciseIds.has(e.id));
            const allExercises = isFullBodyEra ? exercises : workout.exercises;

            const handleExerciseChange = (exerciseId, field, value) => {
                setEditedExercises(prev => {
                    const updated = [...prev];
                    const exerciseIndex = updated.findIndex(e => e.id === exerciseId);
                    if (exerciseIndex !== -1) {
                        // Exercise exists - update it
                        updated[exerciseIndex] = {
                            ...updated[exerciseIndex],
                            [field]: value
                        };
                    } else {
                        // Exercise doesn't exist in workout data - add it
                        // Find the exercise definition from allExercises
                        const exerciseDef = allExercises.find(e => e.id === exerciseId);
                        if (exerciseDef) {
                            updated.push({
                                id: exerciseDef.id,
                                name: exerciseDef.name,
                                category: exerciseDef.category,
                                type: exerciseDef.type,
                                [field]: value
                            });
                        }
                    }
                    return updated;
                });
            };

            const handleSave = () => {
                onSave(workout.date, editedExercises);
                onClose();
            };

            const date = new Date(workout.date);
            const formattedDate = date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const apSplitDate = new Date(2026, 1, 2); // Feb 2, 2026
            const pplSplitDate = new Date(2026, 2, 14); // Mar 14, 2026
            const ap2SplitDate = new Date(2026, 3, 16); // Apr 16, 2026
            const tlSplitDate = new Date(2026, 5, 1); // Jun 1, 2026
            const fbSplitDate = new Date(2026, 5, 21); // Jun 21, 2026
            apSplitDate.setHours(0, 0, 0, 0);
            pplSplitDate.setHours(0, 0, 0, 0);
            ap2SplitDate.setHours(0, 0, 0, 0);
            tlSplitDate.setHours(0, 0, 0, 0);
            fbSplitDate.setHours(0, 0, 0, 0);
            const workoutDate = new Date(workout.date);
            workoutDate.setHours(0, 0, 0, 0);
            let dayName;
            if (workoutDate < apSplitDate) {
                dayName = workout.day === 1 ? 'Upper' : 'Lower';
            } else if (workoutDate < pplSplitDate) {
                dayName = workout.day === 1 ? 'Anterior' : 'Posterior';
            } else if (workoutDate < ap2SplitDate) {
                dayName = workout.day === 1 ? 'Push' : workout.day === 2 ? 'Pull' : 'Legs';
            } else if (workoutDate < tlSplitDate) {
                dayName = workout.day === 1 ? 'Anterior' : 'Posterior';
            } else if (workoutDate < fbSplitDate) {
                dayName = workout.day === 1 ? 'Torso' : 'Limbs';
            } else {
                dayName = workout.day === 'cardio' ? 'Cardio' : 'Full Body';
            }

            return (
                <div className="modal-overlay" onClick={onClose}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }}>
                        <div className="modal-title">Edit Workout - {dayName} Day</div>
                        <div style={{ marginBottom: '20px', color: '#888', fontSize: '14px' }}>
                            {formattedDate}
                        </div>

                        {allExercises.map((exercise) => {
                            const editedExercise = editedExercises.find(e => e.id === exercise.id);

                            return (
                                <div key={exercise.id} style={{
                                    background: '#1a1a2a',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    marginBottom: '12px',
                                    border: '1px solid #2a2a3a'
                                }}>
                                    <div style={{ fontWeight: '600', marginBottom: '8px' }}>
                                        {exercise.name}
                                    </div>
                                    {exercise.type === 'assault-bike' ? (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input
                                                type="text"
                                                value="20/40"
                                                disabled
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    background: '#0d0d1a',
                                                    border: '1px solid #2a2a3a',
                                                    borderRadius: '4px',
                                                    color: '#666'
                                                }}
                                            />
                                            <input
                                                type="number"
                                                placeholder="Rounds"
                                                data-field="rounds"
                                                value={editedExercise?.rounds || ''}
                                                onChange={(e) => handleExerciseChange(exercise.id, 'rounds', e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    background: '#0d0d1a',
                                                    border: '1px solid #3a2a5a',
                                                    borderRadius: '4px',
                                                    color: '#b8b8d0'
                                                }}
                                            />
                                        </div>
                                    ) : exercise.type === 'stairmaster' ? (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <select
                                                data-field="level"
                                                value={editedExercise?.level || 'Level 7'}
                                                onChange={(e) => handleExerciseChange(exercise.id, 'level', e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    background: '#0d0d1a',
                                                    border: '1px solid #3a2a5a',
                                                    borderRadius: '4px',
                                                    color: '#b8b8d0'
                                                }}
                                            >
                                                {['Level 7', 'Level 8', 'Level 9', 'Level 10'].map(level => (
                                                    <option key={level} value={level}>{level}</option>
                                                ))}
                                            </select>
                                            <select
                                                data-field="time"
                                                value={editedExercise?.time || ''}
                                                onChange={(e) => handleExerciseChange(exercise.id, 'time', e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    background: '#0d0d1a',
                                                    border: '1px solid #3a2a5a',
                                                    borderRadius: '4px',
                                                    color: '#b8b8d0'
                                                }}
                                            >
                                                <option value="">Select time</option>
                                                {(() => {
                                                    const timeOptions = [];
                                                    for (let minutes = 10; minutes <= 20; minutes++) {
                                                        for (let seconds = 0; seconds < 60; seconds += 30) {
                                                            if (minutes === 20 && seconds > 0) break;
                                                            const time = formatSecondsToTime(minutes * 60 + seconds);
                                                            timeOptions.push(<option key={time} value={time}>{time}</option>);
                                                        }
                                                    }
                                                    return timeOptions;
                                                })()}
                                            </select>
                                        </div>
                                    ) : exercise.type === 'bodyweight' ? (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input
                                                type="text"
                                                value="BW"
                                                disabled
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    background: '#0d0d1a',
                                                    border: '1px solid #2a2a3a',
                                                    borderRadius: '4px',
                                                    color: '#666'
                                                }}
                                            />
                                            <input
                                                type="number"
                                                placeholder="Reps"
                                                data-field="reps"
                                                value={editedExercise?.reps || ''}
                                                onChange={(e) => handleExerciseChange(exercise.id, 'reps', e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    background: '#0d0d1a',
                                                    border: '1px solid #3a2a5a',
                                                    borderRadius: '4px',
                                                    color: '#b8b8d0'
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input
                                                type="number"
                                                placeholder="Weight"
                                                value={editedExercise?.weight || ''}
                                                onChange={(e) => handleExerciseChange(exercise.id, 'weight', e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    background: '#0d0d1a',
                                                    border: '1px solid #3a2a5a',
                                                    borderRadius: '4px',
                                                    color: '#b8b8d0'
                                                }}
                                            />
                                            <input
                                                type="number"
                                                placeholder="Reps"
                                                value={editedExercise?.reps || ''}
                                                onChange={(e) => handleExerciseChange(exercise.id, 'reps', e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    background: '#0d0d1a',
                                                    border: '1px solid #3a2a5a',
                                                    borderRadius: '4px',
                                                    color: '#b8b8d0'
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                            <button className="modal-btn primary" onClick={handleSave} style={{ flex: 1 }}>
                                Save Changes
                            </button>
                            <button className="modal-btn" onClick={onClose} style={{ flex: 1 }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
