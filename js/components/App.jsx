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
            // Which day type the workout view shows. Defaults by weekday
            // (Mon/Wed/Fri = lower) on every load; a manual toggle only lasts
            // for the session.
            const [activeDayType, setActiveDayType] = useState(() => getDefaultDayType(new Date()));
            const [hydrated, setHydrated] = useState(false);
            const [showSyncPrompt, setShowSyncPrompt] = useState(false);
            const currentWeek = useMemo(() => getCurrentWeek(workoutHistory), [workoutHistory]);
            const hasMigratedWeeks = useRef(false);

            useEffect(() => {
                window.repoReady.then((repo) => {
                    // Legacy localStorage-era migrations. Only meaningful in
                    // local mode: cloud data is imported post-migration, and a
                    // fresh device must not wipe synced config just because its
                    // own localStorage lacks the sentinel flags. They reshape
                    // the stored keys, so they run before loadAll reads them.
                    if (repo.mode === 'local') {
                        migrateToNamespacedStorage();

                        // Full Body migration: wipe old day1/day2 exercise config
                        // so users pick up the new single-list defaults.
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
                    }

                    return repo.loadAll().then(({ workoutHistory: savedHistory, exerciseConfig: savedConfig }) => {
                        if (savedHistory) {
                            let history = savedHistory;
                            // One-time: discard the abandoned assault bike `rounds` metric.
                            const migrated = migrateAssaultBikeRoundsToIntensity(history);
                            if (migrated.changed) {
                                history = migrated.history;
                                repo.saveHistory(history);
                            }
                            setWorkoutHistory(history);
                        }

                        // Reconcile the loaded config against DEFAULT_EXERCISES
                        // (new exercises added/removed since it was saved).
                        const migratedConfig = migrateExerciseConfig(savedConfig);
                        if (migratedConfig) {
                            setExercises(migratedConfig.exercises.sort((a, b) => a.order - b.order));
                            repo.saveExerciseConfig(migratedConfig);
                        } else if (savedConfig && savedConfig.exercises) {
                            setExercises(savedConfig.exercises.sort((a, b) => a.order - b.order));
                        }

                        // Check last backup reminder (device-local, not repo data)
                        const lastReminder = storage.getItem('lastBackupReminder');
                        const now = new Date().getTime();
                        const oneMonth = 30 * 24 * 60 * 60 * 1000;

                        if (!lastReminder || (now - parseInt(lastReminder)) > oneMonth) {
                            setShowBackupReminder(true);
                        }

                        // Cloud sync available but signed out: offer sign-in once
                        // (dismissible, never blocks the workout flow).
                        if (window.FIREBASE_READY && repo.mode === 'local' &&
                            !storage.getItem('syncPromptDismissed')) {
                            setShowSyncPrompt(true);
                        }

                        setHydrated(true);
                    });
                });
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
                        window.repo.saveHistory(migratedHistory);
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
                            hasData = exercise.intensity && exercise.intensity !== '' && exercise.intensity !== 'NA';
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
                                newWorkoutData[exercise.id] = { intensity: exercise.intensity, watts: exercise.watts || '25' };
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

            const getCurrentExercises = () => exercises.filter(ex => ex.day === activeDayType);

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

            // Stamp the version so an in-app rename/reorder survives the next
            // load: migrateExerciseConfig treats a missing version as stale and
            // would otherwise reset the list to the DEFAULT_EXERCISES order.
            const saveExerciseConfig = (updated = exercises) => {
                window.repo.saveExerciseConfig({ exercises: updated, version: EXERCISE_CONFIG_VERSION });
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

            // How the machine is loaded — pin stack, or plate-loaded on one or
            // both sides. The second user-owned field after `name`, and the
            // reason migrateExerciseConfig preserves it rather than taking it
            // from defaults.
            const updateExerciseLoadType = (exerciseId, loadType) => {
                setExercises(prev => {
                    const updated = prev.map(ex =>
                        ex.id === exerciseId ? { ...ex, loadType } : ex
                    );
                    saveExerciseConfig(updated);
                    return updated;
                });
            };

            // Reordering is scoped to the exercise's own day. Swapping across
            // the Lower/Upper boundary would move a card in the settings list
            // without changing which day it belongs to, so the arrow would look
            // like it did nothing.
            const moveExercise = (exerciseId, direction) => {
                const current = exercises.find(ex => ex.id === exerciseId);
                if (!current) return;

                const sameDay = exercises.filter(ex => ex.day === current.day);
                const indexInDay = sameDay.findIndex(ex => ex.id === exerciseId);
                const targetInDay = direction === 'up' ? indexInDay - 1 : indexInDay + 1;
                if (targetInDay < 0 || targetInDay >= sameDay.length) return;

                const currentIndex = exercises.findIndex(ex => ex.id === exerciseId);
                const newIndex = exercises.findIndex(ex => ex.id === sameDay[targetInDay].id);
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
                        if (candidate.intensity && candidate.intensity !== 'NA') return candidate;
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

                if (exercise.type === 'standard') {
                    const exerciseCard = document.querySelector(`[data-exercise-id="${exerciseId}"]`);
                    // Capture pre-filled (untouched) values so one-tap LOG works:
                    // the weight from its input, the reps from the 3/4/5/6 dropdown.
                    if (!data.weight) {
                        const weightInput = exerciseCard?.querySelector('input[type="number"][inputmode="decimal"]');
                        if (weightInput && weightInput.value) {
                            data = { ...data, weight: weightInput.value };
                        }
                    }
                    if (!data.reps) {
                        const repsSelect = exerciseCard?.querySelector('select[data-field="reps"]');
                        if (repsSelect && repsSelect.value) {
                            data = { ...data, reps: repsSelect.value };
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
                    const repsSelect = exerciseCard?.querySelector('select[data-field="reps"]');
                    if (repsSelect && repsSelect.value) {
                        data = { ...data, reps: repsSelect.value };
                    }
                }
                if (exercise.type === 'assault-bike') {
                    const exerciseCard = document.querySelector(`[data-exercise-id="${exerciseId}"]`);
                    if (!data.intensity) {
                        const intensitySelect = exerciseCard?.querySelector('select[data-field="intensity"]');
                        if (intensitySelect && intensitySelect.value) {
                            data = { ...data, intensity: intensitySelect.value };
                        }
                    }
                    if (!data.watts) {
                        const wattsSelect = exerciseCard?.querySelector('select[data-field="watts"]');
                        if (wattsSelect && wattsSelect.value) {
                            data = { ...data, watts: wattsSelect.value };
                        }
                    }
                }

                if (!data || Object.keys(data).length === 0) return;

                if (exercise.type === 'assault-bike' && !data.intensity) return;
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
                        watts: finalData.watts || '25',
                        intensity: finalData.intensity || '20/40'
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
                                return { id: ex.id, name: ex.name, category: ex.category, type: ex.type, watts: '', intensity: '' };
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
                window.repo.saveHistory(updatedHistory);

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
                window.repo.saveHistory(updatedHistory);

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
                        return { id: ex.id, name: ex.name, category: ex.category, type: ex.type, watts: '25', intensity: 'NA' };
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
                window.repo.saveHistory(updatedHistory);

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
                window.repo.saveHistory(updatedHistory);
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

            const importData = (event) => {
                const file = event.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const imported = JSON.parse(e.target.result);

                        if (Array.isArray(imported)) {
                            setWorkoutHistory(imported);
                            window.repo.saveHistory(imported);
                        } else {
                            if (imported.workoutHistory) {
                                setWorkoutHistory(imported.workoutHistory);
                                window.repo.saveHistory(imported.workoutHistory);
                            }
                            if (imported.exerciseConfig) {
                                // New Full Body shape: { exercises: [...] }
                                if (imported.exerciseConfig.exercises) {
                                    const sorted = imported.exerciseConfig.exercises.sort((a, b) => a.order - b.order);
                                    setExercises(sorted);
                                    window.repo.saveExerciseConfig({ exercises: sorted });
                                } else if (imported.exerciseConfig.day1 || imported.exerciseConfig.day2) {
                                    // Legacy split shape: merge day1+day2 into a single list, then
                                    // let the next migrateExerciseConfig pass reconcile against DEFAULT_EXERCISES.
                                    const merged = [
                                        ...(imported.exerciseConfig.day1 || []),
                                        ...(imported.exerciseConfig.day2 || [])
                                    ];
                                    const reindexed = merged.map((ex, idx) => ({ ...ex, order: idx, category: 'Full Body' }));
                                    setExercises(reindexed);
                                    window.repo.saveExerciseConfig({ exercises: reindexed });
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
                        window.repo.clearAll();
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

            // Storage not read yet: render nothing rather than a flash of
            // default state (avoids acting on data that is about to change).
            if (!hydrated) {
                return <div className="app" />;
            }

            return (
                <div className="app">
                    {showSyncPrompt && (
                        <div style={{
                            background: '#1a1a2a',
                            border: '1px solid var(--accent)',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            margin: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontSize: '14px'
                        }}>
                            <span style={{ flex: 1 }}>☁️ Sign in to sync your workouts across devices</span>
                            <button
                                onClick={() => window.repoSignIn()}
                                style={{
                                    padding: '6px 10px', background: 'var(--accent)', border: 'none',
                                    borderRadius: '4px', color: '#b8b8d0', cursor: 'pointer'
                                }}
                            >
                                Sign in
                            </button>
                            <button
                                onClick={() => {
                                    storage.setItem('syncPromptDismissed', 'true');
                                    setShowSyncPrompt(false);
                                }}
                                style={{
                                    padding: '6px 10px', background: 'transparent',
                                    border: '1px solid #2a2a3a', borderRadius: '4px',
                                    color: '#8a8aa0', cursor: 'pointer'
                                }}
                            >
                                ✕
                            </button>
                        </div>
                    )}
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
                            updateExerciseLoadType={updateExerciseLoadType}
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
