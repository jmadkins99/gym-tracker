        const { useState } = React;

        function EditWorkoutModal({ workout, onClose, onSave, exercises }) {
            const [editedExercises, setEditedExercises] = useState(workout.exercises);
            // Which fields this workout offers, by era. Mirrors WeeklyView —
            // see getWorkoutExerciseList in utils.js.
            const allExercises = getWorkoutExerciseList(workout, exercises);

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
            const dayName = getWorkoutDayLabel(workout);

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
                                            <select
                                                data-field="watts"
                                                value={editedExercise?.watts || '25'}
                                                onChange={(e) => handleExerciseChange(exercise.id, 'watts', e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    background: '#0d0d1a',
                                                    border: '1px solid var(--accent)',
                                                    borderRadius: '4px',
                                                    color: '#b8b8d0'
                                                }}
                                            >
                                                {['25', '30', '35'].map(w => (
                                                    <option key={w} value={w}>{w}</option>
                                                ))}
                                            </select>
                                            <select
                                                data-field="intensity"
                                                value={editedExercise?.intensity || '20/40'}
                                                onChange={(e) => handleExerciseChange(exercise.id, 'intensity', e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    background: '#0d0d1a',
                                                    border: '1px solid var(--accent)',
                                                    borderRadius: '4px',
                                                    color: '#b8b8d0'
                                                }}
                                            >
                                                {(() => {
                                                    const opts = [];
                                                    for (let work = 20; work <= 40; work++) {
                                                        opts.push(`${work}/${60 - work}`);
                                                    }
                                                    return opts.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ));
                                                })()}
                                            </select>
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
                                                    border: '1px solid var(--accent)',
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
                                                    border: '1px solid var(--accent)',
                                                    borderRadius: '4px',
                                                    color: '#b8b8d0'
                                                }}
                                            >
                                                <option value="">Select time</option>
                                                {(() => {
                                                    const timeOptions = [];
                                                    for (let minutes = 10; minutes <= 20; minutes++) {
                                                        for (let seconds = 0; seconds < 60; seconds += 10) {
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
                                            <select
                                                data-field="reps"
                                                value={editedExercise?.reps || ''}
                                                onChange={(e) => handleExerciseChange(exercise.id, 'reps', e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    background: '#0d0d1a',
                                                    border: '1px solid var(--accent)',
                                                    borderRadius: '4px',
                                                    color: '#b8b8d0'
                                                }}
                                            >
                                                <option value="">Reps</option>
                                                {(getBodyweightRepOptions(exercise.id) || []).map(r => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
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
                                                    border: '1px solid var(--accent)',
                                                    borderRadius: '4px',
                                                    color: '#b8b8d0'
                                                }}
                                            />
                                            <select
                                                data-field="reps"
                                                value={editedExercise?.reps || ''}
                                                onChange={(e) => handleExerciseChange(exercise.id, 'reps', e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    background: '#0d0d1a',
                                                    border: '1px solid var(--accent)',
                                                    borderRadius: '4px',
                                                    color: '#b8b8d0'
                                                }}
                                            >
                                                <option value="">Reps</option>
                                                {[...new Set([...getStandardRepOptions(exercise.id), editedExercise?.reps].filter(Boolean))]
                                                    .sort((a, b) => parseInt(a) - parseInt(b))
                                                    .map(r => <option key={r} value={r}>{r}</option>)}
                                            </select>
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
