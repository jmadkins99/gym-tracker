        const { useState, useEffect, useMemo, useRef } = React;

        function App() {
            const [currentView, setCurrentView] = useState('workout');
            const [workoutData, setWorkoutData] = useState({});
            const [loggedExercises, setLoggedExercises] = useState({});
            const [workoutHistory, setWorkoutHistory] = useState([]);
            const [showSuccess, setShowSuccess] = useState(false);
            const [successMessage, setSuccessMessage] = useState('');
            const [exercises, setExercises] = useState(DEFAULT_EXERCISES);
            const [showSettings, setShowSettings] = useState(false);
            const [showBackupReminder, setShowBackupReminder] = useState(false);
            const [showDayBreakdown, setShowDayBreakdown] = useState(false);
            const [showEditWorkout, setShowEditWorkout] = useState(false);
            const [editingWorkout, setEditingWorkout] = useState(null);
            const [viewingWeek, setViewingWeek] = useState(1);
            const [expandedWeightBreakdown, setExpandedWeightBreakdown] = useState(null);
            // Which day type the workout view shows. Defaults by weekday (Tue/Thu =
            // cardio) on every load; a manual toggle only lasts for the session.
            const [activeDayType, setActiveDayType] = useState(() => getDefaultDayType(new Date()));
            const currentWeek = useMemo(() => getCurrentWeek(workoutHistory), [workoutHistory]);
            const hasMigratedWeeks = useRef(false);

            useEffect(() => {
                // Migrate existing data to namespaced storage (one-time for existing users)
                migrateToNamespacedStorage();

                // Load workout history
                const saved = storage.getItem('gymWorkoutHistory');
                if (saved) {
                    const history = JSON.parse(saved);
                    setWorkoutHistory(history);
                }

                // Full Body migration: wipe old day1/day2 exercise config so users
                // pick up the new single-list defaults.
                const hasMigratedToFB = storage.getItem('migratedToFullBody2');
                if (!hasMigratedToFB) {
                    storage.removeItem('gymExerciseConfig');
                    storage.removeItem('migratedToFullBody');
                    storage.removeItem('migratedToTorsoLimbs2');
                    storage.removeItem('activeDay');
                    storage.setItem('migratedToFullBody2', 'true');
                }

                // Clean up stale migration flag
                storage.removeItem('removedStairmaster');

                // Check if exercise config needs migration (new exercises added/removed)
                const migratedConfig = migrateExerciseConfig();

                if (migratedConfig) {
                    setExercises(migratedConfig.exercises.sort((a, b) => a.order - b.order));
                } else {
                    const savedExercises = storage.getItem('gymExerciseConfig');
                    if (savedExercises) {
                        const config = JSON.parse(savedExercises);
                        if (config.exercises) {
                            setExercises(config.exercises.sort((a, b) => a.order - b.order));
                        }
                    }
                }

                // Check last backup reminder
                const lastReminder = storage.getItem('lastBackupReminder');
                const now = new Date().getTime();
                const oneMonth = 30 * 24 * 60 * 60 * 1000;

                if (!lastReminder || (now - parseInt(lastReminder)) > oneMonth) {
                    setShowBackupReminder(true);
                }
            }, []);

            useEffect(() => {
                if (workoutHistory.length > 0 && !hasMigratedWeeks.current) {
                    storage.removeItem('firstWorkoutMonday');

                    const migratedHistory = workoutHistory.map(workout => ({
                        ...workout,
                        week: getWeekNumber(workout.date, workoutHistory)
                    }));

                    const hasChanges = migratedHistory.some((workout, idx) =>
                        workout.week !== workoutHistory[idx].week
                    );

                    if (hasChanges) {
                        setWorkoutHistory(migratedHistory);
                        storage.setItem('gymWorkoutHistory', JSON.stringify(migratedHistory));
                    }

                    setViewingWeek(currentWeek);
                    hasMigratedWeeks.current = true;
                }
            }, [workoutHistory.length, currentWeek]);

            // Restore logged state and workout data from today's unsubmitted workout
            useEffect(() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const todayWorkout = workoutHistory.find(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    return workoutDate.getTime() === today.getTime();
                });

                if (todayWorkout && !todayWorkout.submitted) {
                    const newLoggedExercises = {};
                    const newWorkoutData = {};

                    todayWorkout.exercises.forEach(exercise => {
                        let hasData = false;
                        if (exercise.type === 'assault-bike') {
                            hasData = exercise.watts && exercise.watts !== '' && exercise.watts !== 'NA';
                        } else if (exercise.type === 'stairmaster') {
                            hasData = exercise.time && exercise.time !== '' && exercise.time !== 'NA';
                        } else if (exercise.type === 'bodyweight') {
                            hasData = exercise.reps && exercise.reps !== '' && exercise.reps !== 'NA';
                        } else {
                            hasData = (exercise.weight && exercise.weight !== '' && exercise.weight !== 'NA') ||
                                     (exercise.reps && exercise.reps !== '' && exercise.reps !== 'NA');
                        }

                        if (hasData) {
                            newLoggedExercises[exercise.id] = true;

                            if (exercise.type === 'assault-bike') {
                                newWorkoutData[exercise.id] = { watts: exercise.watts };
                            } else if (exercise.type === 'stairmaster') {
                                newWorkoutData[exercise.id] = { time: exercise.time, level: exercise.level || 'Level 7' };
                            } else if (exercise.type === 'bodyweight') {
                                newWorkoutData[exercise.id] = { reps: exercise.reps };
                            } else {
                                newWorkoutData[exercise.id] = {
                                    weight: exercise.weight,
                                    reps: exercise.reps
                                };
                            }
                        }
                    });

                    setLoggedExercises(newLoggedExercises);
                    setWorkoutData(newWorkoutData);
                } else {
                    setLoggedExercises({});
                    setWorkoutData({});
                }
            }, [workoutHistory]);

            const getCurrentExercises = () => activeDayType === 'cardio' ? CARDIO_EXERCISES : exercises;

            const getTodayWorkout = () => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return workoutHistory.find(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    return workoutDate.getTime() === today.getTime();
                });
            };

            const isWorkoutSubmitted = () => {
                const todayWorkout = getTodayWorkout();
                return todayWorkout && todayWorkout.submitted;
            };

            const saveExerciseConfig = (updated = exercises) => {
                storage.setItem('gymExerciseConfig', JSON.stringify({ exercises: updated }));
            };

            const updateExerciseName = (exerciseId, newName) => {
                setExercises(prev => {
                    const updated = prev.map(ex =>
                        ex.id === exerciseId ? { ...ex, name: newName } : ex
                    );
                    saveExerciseConfig(updated);
                    return updated;
                });
            };

            const moveExercise = (exerciseId, direction) => {
                const currentIndex = exercises.findIndex(ex => ex.id === exerciseId);

                if (direction === 'up' && currentIndex === 0) return;
                if (direction === 'down' && currentIndex === exercises.length - 1) return;

                const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
                const reordered = [...exercises];
                [reordered[currentIndex], reordered[newIndex]] = [reordered[newIndex], reordered[currentIndex]];

                const updated = reordered.map((ex, idx) => ({ ...ex, order: idx }));
                setExercises(updated);
                saveExerciseConfig(updated);
            };

            const getPreviousWorkout = (exerciseId) => {
                if (workoutHistory.length === 0) return null;

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const candidates = [];
                for (let workout of workoutHistory) {
                    const workoutDate = new Date(workout.date);
                    workoutDate.setHours(0, 0, 0, 0);

                    // Skip today's workout only if it's not submitted yet
                    if (workoutDate.getTime() === today.getTime() && !workout.submitted) {
                        continue;
                    }

                    const exercise = workout.exercises.find(e => e.id === exerciseId);
                    if (exercise) {
                        candidates.push(exercise);
                    }
                }

                for (let candidate of candidates) {
                    if (candidate.type === 'assault-bike') {
                        if (candidate.watts && candidate.watts !== 'NA') return candidate;
                    } else if (candidate.type === 'stairmaster') {
                        if (candidate.time && candidate.time !== 'NA') return candidate;
                    } else {
                        if (candidate.reps && candidate.reps !== 'NA') return candidate;
                    }
                }

                return candidates.length > 0 ? candidates[0] : null;
            };

            const handleInputChange = (exerciseId, field, value) => {
                setWorkoutData(prev => ({
                    ...prev,
                    [exerciseId]: {
                        ...prev[exerciseId],
                        [field]: value
                    }
                }));
            };

            const logExercise = (exerciseId) => {
                const exercise = getCurrentExercises().find(e => e.id === exerciseId);
                let data = workoutData[exerciseId] || {};

                if (exercise.type === 'standard' && !data.weight && data.reps) {
                    const exerciseCard = document.querySelector(`[data-exercise-id="${exerciseId}"]`);
                    if (exerciseCard) {
                        const weightInput = exerciseCard.querySelector('input[type="number"][inputmode="decimal"]');
                        if (weightInput && weightInput.value) {
                            data = { ...data, weight: weightInput.value };
                        }
                    }
                }
                if (exercise.type === 'stairmaster') {
                    const exerciseCard = document.querySelector(`[data-exercise-id="${exerciseId}"]`);
                    if (!data.time) {
                        const timeSelect = exerciseCard?.querySelector('select[data-field="time"]');
                        if (timeSelect && timeSelect.value) {
                            data = { ...data, time: timeSelect.value };
                        }
                    }
                    if (!data.level) {
                        const levelSelect = exerciseCard?.querySelector('select[data-field="level"]');
                        if (levelSelect && levelSelect.value) {
                            data = { ...data, level: levelSelect.value };
                        }
                    }
                }
                if (exercise.type === 'bodyweight' && !data.reps) {
                    const exerciseCard = document.querySelector(`[data-exercise-id="${exerciseId}"]`);
                    const repsInput = exerciseCard?.querySelector('input[type="number"]');
                    if (repsInput && repsInput.value) {
                        data = { ...data, reps: repsInput.value };
                    }
                }

                if (!data || Object.keys(data).length === 0) return;

                if (exercise.type === 'assault-bike' && !data.watts) return;
                if (exercise.type === 'stairmaster' && !data.time) return;
                if (exercise.type === 'bodyweight' && !data.reps) return;
                if (exercise.type === 'standard' && !data.weight && !data.reps) return;

                let finalData = { ...data };
                const timestamp = new Date().toISOString();
                finalData.timestamp = timestamp;

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayWeek = getWeekNumber(today, workoutHistory);

                let existingWorkoutIndex = workoutHistory.findIndex(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    return workoutDate.getTime() === today.getTime() && !w.submitted;
                });

                let exerciseToSave;
                if (exercise.type === 'assault-bike') {
                    exerciseToSave = {
                        id: exercise.id,
                        name: exercise.name,
                        category: exercise.category,
                        type: exercise.type,
                        intensity: '20/40',
                        watts: finalData.watts || ''
                    };
                } else if (exercise.type === 'stairmaster') {
                    exerciseToSave = {
                        id: exercise.id,
                        name: exercise.name,
                        category: exercise.category,
                        type: exercise.type,
                        level: finalData.level || 'Level 7',
                        time: finalData.time || ''
                    };
                } else if (exercise.type === 'bodyweight') {
                    exerciseToSave = {
                        id: exercise.id,
                        name: exercise.name,
                        category: exercise.category,
                        type: exercise.type,
                        weight: 'Body Weight',
                        reps: finalData.reps || ''
                    };
                } else {
                    exerciseToSave = {
                        id: exercise.id,
                        name: exercise.name,
                        category: exercise.category,
                        type: exercise.type,
                        weight: finalData.weight || '',
                        reps: finalData.reps || ''
                    };
                }

                let updatedHistory;
                if (existingWorkoutIndex !== -1) {
                    updatedHistory = [...workoutHistory];
                    const workout = updatedHistory[existingWorkoutIndex];
                    const exerciseIndex = workout.exercises.findIndex(e => e.id === exerciseId);

                    if (exerciseIndex !== -1) {
                        workout.exercises[exerciseIndex] = exerciseToSave;
                    } else {
                        workout.exercises.push(exerciseToSave);
                    }

                    workout.date = timestamp;
                } else {
                    const allExercises = getCurrentExercises().map(ex => {
                        if (ex.id === exerciseId) {
                            return exerciseToSave;
                        } else {
                            if (ex.type === 'assault-bike') {
                                return { id: ex.id, name: ex.name, category: ex.category, type: ex.type, intensity: '20/40', watts: '' };
                            } else if (ex.type === 'stairmaster') {
                                return { id: ex.id, name: ex.name, category: ex.category, type: ex.type, level: 'Level 7', time: '' };
                            } else if (ex.type === 'bodyweight') {
                                return { id: ex.id, name: ex.name, category: ex.category, type: ex.type, weight: 'Body Weight', reps: '' };
                            } else {
                                return { id: ex.id, name: ex.name, category: ex.category, type: ex.type, weight: '', reps: '' };
                            }
                        }
                    });

                    const newWorkout = {
                        date: timestamp,
                        day: activeDayType,
                        week: todayWeek,
                        exercises: allExercises,
                        submitted: false,
                        plateauBusters: []
                    };

                    updatedHistory = [newWorkout, ...workoutHistory];
                }

                setWorkoutHistory(updatedHistory);
                storage.setItem('gymWorkoutHistory', JSON.stringify(updatedHistory));

                setLoggedExercises(prev => ({
                    ...prev,
                    [exerciseId]: true
                }));

                setSuccessMessage('Exercise logged!');
                setShowSuccess(true);
                setTimeout(() => setShowSuccess(false), 2000);
            };

            const completeDay = () => {
                const todayWorkout = getTodayWorkout();

                if (!todayWorkout) {
                    alert('Please log at least one exercise first!');
                    return;
                }

                const findPreviousValidExercise = (exerciseId) => {
                    const previousWorkouts = workoutHistory
                        .filter(w => {
                            if (w.date === todayWorkout.date) return false;
                            if (!w.submitted) return false;
                            return true;
                        })
                        .sort((a, b) => new Date(b.date) - new Date(a.date))
                        .slice(0, 5);

                    for (const workout of previousWorkouts) {
                        const exercise = workout.exercises.find(e => e.id === exerciseId);
                        if (exercise && exercise.reps && exercise.reps !== 'NA' &&
                            (exercise.type === 'bodyweight' || (exercise.weight && exercise.weight !== 'NA'))) {
                            return exercise;
                        }
                    }
                    return null;
                };

                const plateauBusters = [];
                console.log('[completeDay] Checking for plateau busters in:', todayWorkout);
                todayWorkout.exercises.forEach(exercise => {
                    if ((exercise.type === 'standard' || exercise.type === 'bodyweight') && exercise.reps && exercise.reps !== 'NA') {
                        const reps = parseInt(exercise.reps);
                        console.log('[completeDay] Exercise:', exercise.name, 'Reps:', reps);

                        if (isNaN(reps)) return;

                        if (reps < 4) {
                            console.log('[completeDay] PLATEAU BUSTER (< 4 reps) detected for:', exercise.name);
                            plateauBusters.push(exercise.id);
                            return;
                        }

                        if (reps >= 4 && reps <= 5) {
                            const previousWorkoutWithPlateau = workoutHistory
                                .filter(w => {
                                    if (w.date === todayWorkout.date) return false;
                                    if (!w.submitted) return false;
                                    const ex = w.exercises.find(e => e.id === exercise.id);
                                    return ex && ex.reps && ex.reps !== 'NA';
                                })
                                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

                            if (previousWorkoutWithPlateau?.plateauBusters?.includes(exercise.id)) {
                                console.log('[completeDay] Already in plateau buster recovery, skipping chain for:', exercise.name);
                                return;
                            }

                            const previousExercise = findPreviousValidExercise(exercise.id);

                            if (previousExercise) {
                                const previousReps = parseInt(previousExercise.reps) || 0;

                                if (exercise.type === 'bodyweight') {
                                    if (reps <= previousReps) {
                                        console.log('[completeDay] PLATEAU BUSTER (bodyweight 4-5 reps, no rep improvement) detected for:', exercise.name);
                                        plateauBusters.push(exercise.id);
                                    }
                                    return;
                                }

                                const currentWeight = parseFloat(exercise.weight) || 0;
                                const previousWeight = parseFloat(previousExercise.weight) || 0;

                                if (currentWeight <= previousWeight && reps <= previousReps) {
                                    console.log('[completeDay] PLATEAU BUSTER (4-5 reps, no progress) detected for:', exercise.name);
                                    plateauBusters.push(exercise.id);
                                }
                            }
                        }
                    }
                });
                console.log('[completeDay] Total plateau busters:', plateauBusters);

                const updatedHistory = workoutHistory.map(w => {
                    if (w === todayWorkout) {
                        return { ...w, submitted: true, plateauBusters };
                    }
                    return w;
                });

                setWorkoutHistory(updatedHistory);
                storage.setItem('gymWorkoutHistory', JSON.stringify(updatedHistory));

                autoBackup();

                setLoggedExercises({});
                setWorkoutData({});

                setShowDayBreakdown(true);
            };

            const markDayAsNA = () => {
                if (!confirm('Are you sure you want to mark this day as NA?')) {
                    return;
                }

                const timestamp = new Date().toISOString();
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayWeek = getWeekNumber(today, workoutHistory);

                const currentDayExercises = getCurrentExercises();

                const naExercises = currentDayExercises.map(ex => {
                    if (ex.type === 'assault-bike') {
                        return { id: ex.id, name: ex.name, category: ex.category, type: ex.type, intensity: '20/40', watts: 'NA' };
                    } else if (ex.type === 'stairmaster') {
                        return { id: ex.id, name: ex.name, category: ex.category, type: ex.type, level: 'Level 7', time: 'NA' };
                    } else if (ex.type === 'bodyweight') {
                        return { id: ex.id, name: ex.name, category: ex.category, type: ex.type, weight: 'Body Weight', reps: 'NA' };
                    } else {
                        return { id: ex.id, name: ex.name, category: ex.category, type: ex.type, weight: 'NA', reps: 'NA' };
                    }
                });

                let existingWorkoutIndex = workoutHistory.findIndex(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    return workoutDate.getTime() === today.getTime() && !w.submitted;
                });

                let updatedHistory;
                if (existingWorkoutIndex !== -1) {
                    updatedHistory = [...workoutHistory];
                    updatedHistory[existingWorkoutIndex] = {
                        ...updatedHistory[existingWorkoutIndex],
                        exercises: naExercises,
                        date: timestamp,
                        submitted: true,
                        plateauBusters: []
                    };
                } else {
                    const newWorkout = {
                        date: timestamp,
                        day: activeDayType,
                        week: todayWeek,
                        exercises: naExercises,
                        submitted: true,
                        plateauBusters: []
                    };
                    updatedHistory = [newWorkout, ...workoutHistory];
                }

                setWorkoutHistory(updatedHistory);
                storage.setItem('gymWorkoutHistory', JSON.stringify(updatedHistory));

                autoBackup();

                setLoggedExercises({});
                setWorkoutData({});

                setShowDayBreakdown(true);
            };

            const updateWorkout = (workoutDate, updatedExercises) => {
                const updatedHistory = workoutHistory.map(w => {
                    if (w.date === workoutDate) {
                        return { ...w, exercises: updatedExercises };
                    }
                    return w;
                });

                setWorkoutHistory(updatedHistory);
                storage.setItem('gymWorkoutHistory', JSON.stringify(updatedHistory));
                setSuccessMessage('Workout updated!');
                setShowSuccess(true);
                setTimeout(() => setShowSuccess(false), 2000);
            };

            const exportData = () => {
                const exportObj = {
                    workoutHistory,
                    exerciseConfig: { exercises },
                    exportDate: new Date().toISOString()
                };
                const dataStr = JSON.stringify(exportObj, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(dataBlob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `gym-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
                link.click();
                URL.revokeObjectURL(url);
            };

            const autoBackup = () => {
                const exportObj = {
                    workoutHistory,
                    exerciseConfig: { exercises },
                    exportDate: new Date().toISOString()
                };
                const dataStr = JSON.stringify(exportObj, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(dataBlob);
                const link = document.createElement('a');
                link.href = url;
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                link.download = `gym-tracker-AUTO-BACKUP-${timestamp}.json`;
                link.click();
                URL.revokeObjectURL(url);
            };

            const importData = (event) => {
                const file = event.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const imported = JSON.parse(e.target.result);

                        if (Array.isArray(imported)) {
                            setWorkoutHistory(imported);
                            storage.setItem('gymWorkoutHistory', JSON.stringify(imported));
                        } else {
                            if (imported.workoutHistory) {
                                setWorkoutHistory(imported.workoutHistory);
                                storage.setItem('gymWorkoutHistory', JSON.stringify(imported.workoutHistory));
                            }
                            if (imported.exerciseConfig) {
                                // New Full Body shape: { exercises: [...] }
                                if (imported.exerciseConfig.exercises) {
                                    const sorted = imported.exerciseConfig.exercises.sort((a, b) => a.order - b.order);
                                    setExercises(sorted);
                                    storage.setItem('gymExerciseConfig', JSON.stringify({ exercises: sorted }));
                                } else if (imported.exerciseConfig.day1 || imported.exerciseConfig.day2) {
                                    // Legacy split shape: merge day1+day2 into a single list, then
                                    // let the next migrateExerciseConfig pass reconcile against DEFAULT_EXERCISES.
                                    const merged = [
                                        ...(imported.exerciseConfig.day1 || []),
                                        ...(imported.exerciseConfig.day2 || [])
                                    ];
                                    const reindexed = merged.map((ex, idx) => ({ ...ex, order: idx, category: 'Full Body' }));
                                    setExercises(reindexed);
                                    storage.setItem('gymExerciseConfig', JSON.stringify({ exercises: reindexed }));
                                }
                            }
                        }

                        setSuccessMessage('Data imported successfully!');
                        setShowSuccess(true);
                        setTimeout(() => setShowSuccess(false), 3000);
                        setShowSettings(false);
                    } catch (error) {
                        alert('Invalid backup file');
                    }
                };
                reader.readAsText(file);
            };

            const resetData = () => {
                if (confirm('ARE YOU VERY SURE? This will delete ALL your workout data AND exercise customizations permanently. This cannot be undone!')) {
                    if (confirm('FINAL WARNING: All your progress and custom exercise names/order will be lost forever. Continue?')) {
                        storage.removeItem('gymWorkoutHistory');
                        storage.removeItem('gymExerciseConfig');
                        storage.removeItem('lastBackupReminder');
                        setWorkoutHistory([]);
                        setWorkoutData({});
                        setLoggedExercises({});
                        setExercises(DEFAULT_EXERCISES);
                        setShowSettings(false);
                        setSuccessMessage('All data has been reset');
                        setShowSuccess(true);
                        setTimeout(() => setShowSuccess(false), 3000);
                    }
                }
            };

            const dismissBackupReminder = () => {
                storage.setItem('lastBackupReminder', new Date().getTime().toString());
                setShowBackupReminder(false);
            };

            return (
                <div className="app">
                    {showSuccess && <div className={`success-message ${showBackupReminder ? 'backup-reminder' : ''}`}>{successMessage}</div>}

                    {showBackupReminder && (
                        <BackupReminderModal
                            onExport={() => { exportData(); dismissBackupReminder(); }}
                            onDismiss={dismissBackupReminder}
                        />
                    )}

                    {showSettings && (
                        <SettingsModal
                            onClose={() => setShowSettings(false)}
                            onExport={exportData}
                            onImport={importData}
                            onReset={resetData}
                            exercises={exercises}
                            updateExerciseName={updateExerciseName}
                            moveExercise={moveExercise}
                        />
                    )}

                    {showDayBreakdown && (
                        <DayBreakdownModal
                            onClose={() => setShowDayBreakdown(false)}
                            workoutHistory={workoutHistory}
                            getCurrentExercises={getCurrentExercises}
                            getPreviousWorkout={getPreviousWorkout}
                        />
                    )}

                    {showEditWorkout && editingWorkout && (
                        <EditWorkoutModal
                            workout={editingWorkout}
                            onClose={() => {
                                setShowEditWorkout(false);
                                setEditingWorkout(null);
                            }}
                            onSave={updateWorkout}
                            exercises={exercises}
                        />
                    )}

                    <div className="header">
                        <div className="header-top">
                            <h1>Gym Tracker</h1>
                            <button className="settings-btn" onClick={() => setShowSettings(true)}>⚙️</button>
                        </div>
                        <div className="week-indicator">Week {currentWeek}</div>
                        <div className="nav">
                            <button
                                className={`nav-btn ${currentView === 'workout' ? 'active' : ''}`}
                                onClick={() => setCurrentView('workout')}
                            >
                                Workout
                            </button>
                            <button
                                className={`nav-btn ${currentView === 'weekly' ? 'active' : ''}`}
                                onClick={() => { setCurrentView('weekly'); setViewingWeek(currentWeek); window.scrollTo(0, 0); }}
                            >
                                Weekly
                            </button>
                        </div>
                    </div>

                    <div className="content">
                        {currentView === 'workout' && <WorkoutView
                            workoutData={workoutData}
                            loggedExercises={loggedExercises}
                            handleInputChange={handleInputChange}
                            getPreviousWorkout={getPreviousWorkout}
                            logExercise={logExercise}
                            completeDay={completeDay}
                            markDayAsNA={markDayAsNA}
                            getCurrentExercises={getCurrentExercises}
                            currentWeek={currentWeek}
                            workoutHistory={workoutHistory}
                            expandedWeightBreakdown={expandedWeightBreakdown}
                            setExpandedWeightBreakdown={setExpandedWeightBreakdown}
                            activeDayType={activeDayType}
                            setActiveDayType={setActiveDayType}
                        />}
                        {currentView === 'weekly' && <WeeklyView
                            workoutHistory={workoutHistory}
                            viewingWeek={viewingWeek}
                            setViewingWeek={setViewingWeek}
                            currentWeek={currentWeek}
                            exercises={exercises}
                            onEditWorkout={(workout) => {
                                setEditingWorkout(workout);
                                setShowEditWorkout(true);
                            }}
                        />}
                    </div>
                </div>
            );
        }

        ReactDOM.render(<App />, document.getElementById('root'));
