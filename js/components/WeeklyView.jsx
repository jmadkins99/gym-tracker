        // Both buttons in a history entry's header row are bare emoji at the
        // same weight, so the styling lives in one place.
        const iconBtnStyle = {
            background: 'none',
            border: 'none',
            color: 'var(--accent-muted)',
            cursor: 'pointer',
            fontSize: '18px',
            padding: '4px 8px'
        };

        function WeeklyView({ workoutHistory, viewingWeek, setViewingWeek, currentWeek, exercises, onEditWorkout, onViewTiming, foregroundAt }) {
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

                                // Lower/Upper workouts render against their own day in the
                                // current config; older eras keep their stored layout. See
                                // getWorkoutExerciseList in utils.js.
                                const allExercises = getWorkoutExerciseList(workout, exercises);

                                // Calculate sequential day number - count down from total
                                const dayNumber = weekWorkouts.length - idx;

                                // Null for anything logged before August 2026,
                                // which carries no per-exercise timestamps —
                                // and that is what hides the ⏱️ on those
                                // entries rather than offering an empty modal.
                                const timing = getSessionTiming(workout, foregroundAt);

                                return (
                                    <div key={idx} className="history-item">
                                        <div className="history-date" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Day {dayNumber} - {formattedDate}</span>
                                            <span>
                                                {timing && (
                                                    <button
                                                        onClick={() => onViewTiming(workout)}
                                                        style={iconBtnStyle}
                                                    >
                                                        ⏱️
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => onEditWorkout(workout)}
                                                    style={iconBtnStyle}
                                                >
                                                    ✏️
                                                </button>
                                            </span>
                                        </div>
                                        {allExercises.map((expectedExercise) => {
                                            const completedExercise = workout.exercises.find(e => e.id === expectedExercise.id);
                                            const isPR = workout.submitted && completedExercise &&
                                                isTopOfStandardRepRange(completedExercise);
                                            return (
                                                <div key={expectedExercise.id} className="history-exercise">
                                                    <div className="history-exercise-title">
                                                        <div className="history-exercise-name">{expectedExercise.name}</div>
                                                        {isPR ? (
                                                            <div className="streak-badge history-pr-badge" data-pr-badge>
                                                                🔥 PR
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                    <div className="history-exercise-data">
                                                        {completedExercise ? (
                                                            completedExercise.type === 'assault-bike'
                                                                ? (completedExercise.intensity && completedExercise.intensity !== 'NA' ? `${completedExercise.intensity}${completedExercise.watts ? ` @ ${completedExercise.watts}W` : ''}` : <span style={{ color: '#555' }}>NA</span>)
                                                                : completedExercise.type === 'stairmaster'
                                                                ? (completedExercise.time ? `${completedExercise.time} / ${completedExercise.level || 'Level 7'}` : <span style={{ color: '#555' }}>NA</span>)
                                                                : (completedExercise.weight && completedExercise.reps
                                                                    ? `${completedExercise.weight === 'Body Weight' ? 'BW' : completedExercise.weight + 'lbs'} × ${completedExercise.reps}`
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
