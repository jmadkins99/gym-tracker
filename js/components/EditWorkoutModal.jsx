        const { useState } = React;

        function EditWorkoutModal({ workout, onClose, onSave, day1Exercises, day2Exercises, day3Exercises }) {
            const [editedExercises, setEditedExercises] = useState(workout.exercises);
            const allExercises = workout.day === 1 ? day1Exercises : workout.day === 2 ? day2Exercises : day3Exercises;

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
            apSplitDate.setHours(0, 0, 0, 0);
            pplSplitDate.setHours(0, 0, 0, 0);
            const workoutDate = new Date(workout.date);
            workoutDate.setHours(0, 0, 0, 0);
            let dayName;
            if (workoutDate < apSplitDate) {
                dayName = workout.day === 1 ? 'Upper' : 'Lower';
            } else if (workoutDate < pplSplitDate) {
                dayName = workout.day === 1 ? 'Anterior' : 'Posterior';
            } else {
                dayName = workout.day === 1 ? 'Push' : workout.day === 2 ? 'Pull' : 'Legs';
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
                                                value="10/20"
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
                                                placeholder="Watts"
                                                value={editedExercise?.watts || ''}
                                                onChange={(e) => handleExerciseChange(exercise.id, 'watts', e.target.value)}
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
                                            <input
                                                type="text"
                                                value="Level 10"
                                                disabled
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    background: '#0d0d1a',
                                                    border: '1px solid #3a2a5a',
                                                    borderRadius: '4px',
                                                    color: '#b8b8d0'
                                                }}
                                            />
                                            <select
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
                                                    for (let minutes = 5; minutes <= 20; minutes++) {
                                                        for (let seconds = 0; seconds < 60; seconds += 15) {
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
                                                value="Body Weight"
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
