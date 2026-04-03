        function WeeklyView({ workoutHistory, viewingWeek, setViewingWeek, currentWeek, day1Exercises, day2Exercises, day3Exercises, onEditWorkout }) {
            const weekWorkouts = workoutHistory
                .filter(w => w.week === viewingWeek)
                .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort newest to oldest

            return (
                <>
                    <div className="week-nav">
                        <button
                            className="week-nav-btn"
                            onClick={() => setViewingWeek(viewingWeek - 1)}
                            disabled={viewingWeek <= 1}
                        >
                            ← Prev
                        </button>
                        <div className="week-title">
                            Week {viewingWeek}
                            {viewingWeek === currentWeek && ' (Current)'}
                        </div>
                        <button
                            className="week-nav-btn"
                            onClick={() => setViewingWeek(viewingWeek + 1)}
                            disabled={viewingWeek >= currentWeek}
                        >
                            Next →
                        </button>
                    </div>

                    {weekWorkouts.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">📊</div>
                            <div>No workouts in Week {viewingWeek}</div>
                        </div>
                    ) : (
                        <>
                            {weekWorkouts.map((workout, idx) => {
                                const date = new Date(workout.date);
                                const formattedDate = date.toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                });
                                const formattedTime = date.toLocaleTimeString('en-US', {
                                    hour: 'numeric',
                                    minute: '2-digit'
                                });

                                // Get all exercises for this day
                                const allExercises = workout.day === 1 ? day1Exercises : workout.day === 2 ? day2Exercises : day3Exercises;
                                const completedIds = new Set(workout.exercises.map(e => e.id));

                                // Calculate sequential day number - count down from total
                                const dayNumber = weekWorkouts.length - idx;

                                return (
                                    <div key={idx} className="history-item">
                                        <div className="history-date" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Day {dayNumber} - {formattedDate}</span>
                                            <button
                                                onClick={() => onEditWorkout(workout)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: '#6a5a8a',
                                                    cursor: 'pointer',
                                                    fontSize: '18px',
                                                    padding: '4px 8px'
                                                }}
                                            >
                                                ✏️
                                            </button>
                                        </div>
                                        {allExercises.map((expectedExercise) => {
                                            const completedExercise = workout.exercises.find(e => e.id === expectedExercise.id);
                                            return (
                                                <div key={expectedExercise.id} className="history-exercise">
                                                    <div className="history-exercise-name">{expectedExercise.name}</div>
                                                    <div className="history-exercise-data">
                                                        {completedExercise ? (
                                                            completedExercise.type === 'assault-bike'
                                                                ? (completedExercise.watts ? `${completedExercise.watts} watts` : <span style={{ color: '#555' }}>NA</span>)
                                                                : completedExercise.type === 'stairmaster'
                                                                ? (completedExercise.time ? `${completedExercise.time} / Level 10` : <span style={{ color: '#555' }}>NA</span>)
                                                                : (completedExercise.weight && completedExercise.reps
                                                                    ? `${completedExercise.weight}${completedExercise.weight === 'Body Weight' ? '' : 'lbs'} × ${completedExercise.reps}`
                                                                    : <span style={{ color: '#555' }}>NA</span>)
                                                        ) : (
                                                            <span style={{ color: '#555' }}>NA</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </>
            );
        }
