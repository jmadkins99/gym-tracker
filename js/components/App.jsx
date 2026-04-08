        const { useState, useEffect, useMemo, useRef } = React;

        function App() {
            const [currentView, setCurrentView] = useState('workout');
            const [currentDay, setCurrentDay] = useState(getTodayDay());
            const [workoutData, setWorkoutData] = useState({});
            const [loggedExercises, setLoggedExercises] = useState({});
            const [workoutHistory, setWorkoutHistory] = useState([]);
            const [showSuccess, setShowSuccess] = useState(false);
            const [successMessage, setSuccessMessage] = useState('');
            const [day1Exercises, setDay1Exercises] = useState(DEFAULT_DAY_1_EXERCISES);
            const [day2Exercises, setDay2Exercises] = useState(DEFAULT_DAY_2_EXERCISES);
            const [day3Exercises, setDay3Exercises] = useState(DEFAULT_DAY_3_EXERCISES);
            const [showSettings, setShowSettings] = useState(false);
            const [showBackupReminder, setShowBackupReminder] = useState(false);
            const [showDayBreakdown, setShowDayBreakdown] = useState(false);
            const [showEditWorkout, setShowEditWorkout] = useState(false);
            const [editingWorkout, setEditingWorkout] = useState(null);
            const [viewingWeek, setViewingWeek] = useState(1);
            const [expandedWeightBreakdown, setExpandedWeightBreakdown] = useState(null);
            const currentWeek = useMemo(() => getCurrentWeek(workoutHistory), [workoutHistory]);
            const hasMigratedWeeks = useRef(false);

            // Wrapper to change day and save to localStorage (sticky session)
            const handleDayChange = (day) => {
                setCurrentDay(day);
                saveActiveDay(day);
            };

            useEffect(() => {
                // Migrate existing data to namespaced storage (one-time for existing users)
                migrateToNamespacedStorage();

                // Load workout history
                const saved = storage.getItem('gymWorkoutHistory');
                if (saved) {
                    const history = JSON.parse(saved);
                    setWorkoutHistory(history);
                }

                // Load custom exercise configurations
                // Check if we need to migrate to Push/Pull/Legs split
                const hasMigratedToPPL = storage.getItem('migratedToPushPullLegs');
                if (!hasMigratedToPPL) {
                    // Clear old exercise config and use new defaults
                    storage.removeItem('gymExerciseConfig');
                    storage.setItem('migratedToPushPullLegs', 'true');
                }

                // Clean up stale migration flag
                storage.removeItem('removedStairmaster');

                // Check if exercise config needs migration (new exercises added/removed)
                // This runs after AP migration and handles ongoing exercise list changes
                const migratedConfig = migrateExerciseConfig();

                // Load the exercise config (either migrated or existing)
                if (migratedConfig) {
                    // Use the freshly migrated config
                    setDay1Exercises(migratedConfig.day1.sort((a, b) => a.order - b.order));
                    setDay2Exercises(migratedConfig.day2.sort((a, b) => a.order - b.order));
                    setDay3Exercises(migratedConfig.day3.sort((a, b) => a.order - b.order));
                } else {
                    // Load from storage if no migration occurred
                    const savedExercises = storage.getItem('gymExerciseConfig');
                    if (savedExercises) {
                        const config = JSON.parse(savedExercises);
                        if (config.day1) {
                            setDay1Exercises(config.day1.sort((a, b) => a.order - b.order));
                        }
                        if (config.day2) {
                            setDay2Exercises(config.day2.sort((a, b) => a.order - b.order));
                        }
                        if (config.day3) {
                            setDay3Exercises(config.day3.sort((a, b) => a.order - b.order));
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

            // Update viewing week and migrate workout history when it loads
            useEffect(() => {
                if (workoutHistory.length > 0 && !hasMigratedWeeks.current) {
                    // Clear the cached first workout Monday to recalculate based on actual data
                    storage.removeItem('firstWorkoutMonday');

                    // Recalculate week numbers for all workouts
                    const migratedHistory = workoutHistory.map(workout => ({
                        ...workout,
                        week: getWeekNumber(workout.date, workoutHistory)
                    }));

                    // Only update if week numbers changed
                    const hasChanges = migratedHistory.some((workout, idx) =>
                        workout.week !== workoutHistory[idx].week
                    );

                    if (hasChanges) {
                        setWorkoutHistory(migratedHistory);
                        storage.setItem('gymWorkoutHistory', JSON.stringify(migratedHistory));
                    }

                    // Set viewing week to current week
                    setViewingWeek(currentWeek);

                    // Mark migration as complete
                    hasMigratedWeeks.current = true;
                }
            }, [workoutHistory.length, currentWeek]); // Run when history loads or length changes

            // Restore logged state and workout data from today's workout
            useEffect(() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const todayWorkout = workoutHistory.find(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    const isSameDay = workoutDate.getTime() === today.getTime();
                    const isSameWorkoutDay = w.day === currentDay;
                    return isSameDay && isSameWorkoutDay;
                });

                if (todayWorkout && !todayWorkout.submitted) {
                    // Only restore state if workout hasn't been submitted yet
                    const newLoggedExercises = {};
                    const newWorkoutData = {};

                    todayWorkout.exercises.forEach(exercise => {
                        // Check if exercise has actual data (not just defaults or empty values)
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
                    // Clear logged state if switching to a day with no workout or if workout is submitted
                    setLoggedExercises({});
                    setWorkoutData({});
                }
            }, [workoutHistory, currentDay]);

            const getCurrentExercises = () => {
                if (currentDay === 1) return day1Exercises;
                if (currentDay === 2) return day2Exercises;
                return day3Exercises;
            };

            const getTodayWorkout = () => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return workoutHistory.find(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    const isSameDay = workoutDate.getTime() === today.getTime();
                    const isSameWorkoutDay = w.day === currentDay;
                    return isSameDay && isSameWorkoutDay;
                });
            };

            const isWorkoutSubmitted = () => {
                const todayWorkout = getTodayWorkout();
                return todayWorkout && todayWorkout.submitted;
            };

            const saveExerciseConfig = (updatedDay1 = day1Exercises, updatedDay2 = day2Exercises, updatedDay3 = day3Exercises) => {
                const config = {
                    day1: updatedDay1,
                    day2: updatedDay2,
                    day3: updatedDay3
                };
                storage.setItem('gymExerciseConfig', JSON.stringify(config));
            };

            const updateExerciseName = (day, exerciseId, newName) => {
                if (day === 1) {
                    setDay1Exercises(prev => {
                        const updated = prev.map(ex =>
                            ex.id === exerciseId ? { ...ex, name: newName } : ex
                        );
                        saveExerciseConfig(updated, day2Exercises, day3Exercises);
                        return updated;
                    });
                } else if (day === 2) {
                    setDay2Exercises(prev => {
                        const updated = prev.map(ex =>
                            ex.id === exerciseId ? { ...ex, name: newName } : ex
                        );
                        saveExerciseConfig(day1Exercises, updated, day3Exercises);
                        return updated;
                    });
                } else {
                    setDay3Exercises(prev => {
                        const updated = prev.map(ex =>
                            ex.id === exerciseId ? { ...ex, name: newName } : ex
                        );
                        saveExerciseConfig(day1Exercises, day2Exercises, updated);
                        return updated;
                    });
                }
            };

            const moveExercise = (day, exerciseId, direction) => {
                const exercises = day === 1 ? day1Exercises : day === 2 ? day2Exercises : day3Exercises;
                const currentIndex = exercises.findIndex(ex => ex.id === exerciseId);

                if (direction === 'up' && currentIndex === 0) return;
                if (direction === 'down' && currentIndex === exercises.length - 1) return;

                const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
                const reordered = [...exercises];
                [reordered[currentIndex], reordered[newIndex]] = [reordered[newIndex], reordered[currentIndex]];

                // Update order values
                const updated = reordered.map((ex, idx) => ({ ...ex, order: idx }));

                if (day === 1) {
                    setDay1Exercises(updated);
                    saveExerciseConfig(updated, day2Exercises, day3Exercises);
                } else if (day === 2) {
                    setDay2Exercises(updated);
                    saveExerciseConfig(day1Exercises, updated, day3Exercises);
                } else {
                    setDay3Exercises(updated);
                    saveExerciseConfig(day1Exercises, day2Exercises, updated);
                }
            };

            const getPreviousWorkout = (exerciseId) => {
                if (workoutHistory.length === 0) return null;

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                // Find up to 3 most recent workouts with this exercise (excluding today's unsubmitted workout)
                const candidates = [];
                for (let workout of workoutHistory) {
                    if (candidates.length >= 3) break; // Stop after finding 3 candidates

                    const workoutDate = new Date(workout.date);
                    workoutDate.setHours(0, 0, 0, 0);

                    // Skip today's workout only if it's not submitted yet
                    if (workoutDate.getTime() === today.getTime() && workout.day === currentDay && !workout.submitted) {
                        continue;
                    }

                    const exercise = workout.exercises.find(e => e.id === exerciseId);
                    if (exercise) {
                        candidates.push(exercise);
                    }
                }

                // Return first candidate that doesn't have "NA" values (check appropriate field based on exercise type)
                for (let candidate of candidates) {
                    // For assault bike, check watts
                    if (candidate.type === 'assault-bike') {
                        if (candidate.watts && candidate.watts !== 'NA') {
                            return candidate;
                        }
                    }
                    // For stairmaster, check time
                    else if (candidate.type === 'stairmaster') {
                        if (candidate.time && candidate.time !== 'NA') {
                            return candidate;
                        }
                    }
                    // For standard/bodyweight exercises, check reps
                    else {
                        if (candidate.reps && candidate.reps !== 'NA') {
                            return candidate;
                        }
                    }
                }

                // If all candidates have NA values (or no valid candidates), return the most recent one
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

                // Capture auto-filled weight if user didn't manually enter it
                if (exercise.type === 'standard' && !data.weight && data.reps) {
                    const exerciseCard = document.querySelector(`[data-exercise-id="${exerciseId}"]`);
                    if (exerciseCard) {
                        const weightInput = exerciseCard.querySelector('input[type="number"][inputmode="decimal"]');
                        if (weightInput && weightInput.value) {
                            data = { ...data, weight: weightInput.value };
                        }
                    }
                }
                // For stairmaster, capture displayed time from dropdown if user didn't interact with it
                if (exercise.type === 'stairmaster' && !data.time) {
                    const exerciseCard = document.querySelector(`[data-exercise-id="${exerciseId}"]`);
                    const timeSelect = exerciseCard?.querySelector('select');
                    if (timeSelect && timeSelect.value) {
                        data = { ...data, time: timeSelect.value };
                    }
                }

                if (!data || Object.keys(data).length === 0) return;

                // Validate data based on exercise type
                if (exercise.type === 'assault-bike' && !data.watts) return;
                if (exercise.type === 'stairmaster' && !data.time) return;
                if (exercise.type === 'bodyweight' && !data.reps) return;
                if (exercise.type === 'standard' && !data.weight && !data.reps) return;

                let finalData = { ...data };
                const timestamp = new Date().toISOString();
                finalData.timestamp = timestamp;

                // Save current day as active day (sticky session)
                saveActiveDay(currentDay);

                // Find if there's already a workout for today (that hasn't been submitted)
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayWeek = getWeekNumber(today, workoutHistory);

                let existingWorkoutIndex = workoutHistory.findIndex(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    const isSameDay = workoutDate.getTime() === today.getTime();
                    const isSameWorkoutDay = w.day === currentDay;
                    const isNotSubmitted = !w.submitted;
                    return isSameDay && isSameWorkoutDay && isNotSubmitted;
                });

                // Create exercise object to save
                let exerciseToSave;
                if (exercise.type === 'assault-bike') {
                    exerciseToSave = {
                        id: exercise.id,
                        name: exercise.name,
                        category: exercise.category,
                        type: exercise.type,
                        intensity: '10/20',
                        watts: finalData.watts || ''
                    };
                } else if (exercise.type === 'stairmaster') {
                    exerciseToSave = {
                        id: exercise.id,
                        name: exercise.name,
                        category: exercise.category,
                        type: exercise.type,
                        level: 'Level 10',  // Hardcoded level
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
                    // Update existing workout
                    updatedHistory = [...workoutHistory];
                    const workout = updatedHistory[existingWorkoutIndex];
                    const exerciseIndex = workout.exercises.findIndex(e => e.id === exerciseId);

                    if (exerciseIndex !== -1) {
                        workout.exercises[exerciseIndex] = exerciseToSave;
                    } else {
                        workout.exercises.push(exerciseToSave);
                    }

                    workout.date = timestamp; // Update to latest timestamp
                } else {
                    // Create new workout with all exercises initialized to NA
                    const allExercises = getCurrentExercises().map(ex => {
                        if (ex.id === exerciseId) {
                            return exerciseToSave;
                        } else {
                            // Initialize as NA
                            if (ex.type === 'assault-bike') {
                                return {
                                    id: ex.id,
                                    name: ex.name,
                                    category: ex.category,
                                    type: ex.type,
                                    intensity: '10/20',
                                    watts: ''
                                };
                            } else if (ex.type === 'stairmaster') {
                                return {
                                    id: ex.id,
                                    name: ex.name,
                                    category: ex.category,
                                    type: ex.type,
                                    level: 'Level 10',  // Hardcoded level
                                    time: ''
                                };
                            } else if (ex.type === 'bodyweight') {
                                return {
                                    id: ex.id,
                                    name: ex.name,
                                    category: ex.category,
                                    type: ex.type,
                                    weight: 'Body Weight',
                                    reps: ''
                                };
                            } else {
                                return {
                                    id: ex.id,
                                    name: ex.name,
                                    category: ex.category,
                                    type: ex.type,
                                    weight: '',
                                    reps: ''
                                };
                            }
                        }
                    });

                    const newWorkout = {
                        date: timestamp,
                        day: currentDay,
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
                // Find today's workout
                const todayWorkout = getTodayWorkout();

                if (!todayWorkout) {
                    alert('Please log at least one exercise first!');
                    return;
                }

                // Helper to find previous valid workout data for an exercise (up to 5 sessions back, skipping NA)
                const findPreviousValidExercise = (exerciseId) => {
                    // Get previous workouts of the same day type, sorted by date descending
                    // Exclude the current workout being submitted (compare by date string to handle same-day workouts)
                    const previousWorkouts = workoutHistory
                        .filter(w => {
                            // Same day type
                            if (w.day !== currentDay) return false;
                            // Exclude the current workout being submitted
                            if (w.date === todayWorkout.date) return false;
                            // Must be submitted
                            if (!w.submitted) return false;
                            return true;
                        })
                        .sort((a, b) => new Date(b.date) - new Date(a.date))
                        .slice(0, 5); // Check up to 5 sessions back

                    // Find first workout with valid (non-NA) data for this exercise
                    for (const workout of previousWorkouts) {
                        const exercise = workout.exercises.find(e => e.id === exerciseId);
                        if (exercise && exercise.reps && exercise.reps !== 'NA' &&
                            (exercise.type === 'bodyweight' || (exercise.weight && exercise.weight !== 'NA'))) {
                            return exercise;
                        }
                    }
                    return null;
                };

                // Detect exercises for plateau busting
                // Rules:
                // - reps < 4: ALWAYS plateau buster
                // - reps 4-5: plateau buster IF weight <= previous weight AND reps <= previous reps
                // - reps 6+: no plateau buster (PR system handles this)
                const plateauBusters = [];
                console.log('[completeDay] Checking for plateau busters in:', todayWorkout);
                todayWorkout.exercises.forEach(exercise => {
                    // Only check standard and bodyweight exercises (those with reps)
                    if ((exercise.type === 'standard' || exercise.type === 'bodyweight') && exercise.reps && exercise.reps !== 'NA') {
                        const reps = parseInt(exercise.reps);
                        console.log('[completeDay] Exercise:', exercise.name, 'Reps:', reps);

                        if (isNaN(reps)) return;

                        // Rule 1: Less than 4 reps ALWAYS triggers plateau buster
                        if (reps < 4) {
                            console.log('[completeDay] PLATEAU BUSTER (< 4 reps) detected for:', exercise.name);
                            plateauBusters.push(exercise.id);
                            return;
                        }

                        // Rule 2: 4-5 reps triggers plateau buster only if weight AND reps are not improving
                        // BUT skip if already in plateau buster recovery (previous session had this as plateau buster)
                        if (reps >= 4 && reps <= 5) {
                            // Check if previous session already had this as a plateau buster
                            const previousWorkoutWithPlateau = workoutHistory
                                .filter(w => {
                                    if (w.day !== currentDay) return false;
                                    if (w.date === todayWorkout.date) return false;
                                    if (!w.submitted) return false;
                                    const ex = w.exercises.find(e => e.id === exercise.id);
                                    return ex && ex.reps && ex.reps !== 'NA';
                                })
                                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

                            if (previousWorkoutWithPlateau?.plateauBusters?.includes(exercise.id)) {
                                console.log('[completeDay] Already in plateau buster recovery, skipping chain for:', exercise.name);
                                return; // Don't chain - retry system handles this
                            }

                            const previousExercise = findPreviousValidExercise(exercise.id);

                            if (previousExercise) {
                                const previousReps = parseInt(previousExercise.reps) || 0;

                                // For bodyweight exercises, trigger plateau buster only if reps didn't improve
                                if (exercise.type === 'bodyweight') {
                                    if (reps <= previousReps) {
                                        console.log('[completeDay] PLATEAU BUSTER (bodyweight 4-5 reps, no rep improvement) detected for:', exercise.name);
                                        plateauBusters.push(exercise.id);
                                    } else {
                                        console.log('[completeDay] Neutral (bodyweight 4-5 reps but reps improved) for:', exercise.name);
                                    }
                                    return;
                                }

                                const currentWeight = parseFloat(exercise.weight) || 0;
                                const previousWeight = parseFloat(previousExercise.weight) || 0;

                                // Plateau buster only if: weight not increased AND reps not increased
                                if (currentWeight <= previousWeight && reps <= previousReps) {
                                    console.log('[completeDay] PLATEAU BUSTER (4-5 reps, no progress) detected for:', exercise.name);
                                    console.log('[completeDay] Current:', currentWeight, 'lbs ×', reps, '| Previous:', previousWeight, 'lbs ×', previousReps);
                                    plateauBusters.push(exercise.id);
                                } else if (currentWeight > previousWeight) {
                                    console.log('[completeDay] Neutral (4-5 reps but weight increased) for:', exercise.name);
                                } else {
                                    console.log('[completeDay] Neutral (4-5 reps but reps improved) for:', exercise.name);
                                }
                            } else {
                                // No previous data - treat 4-5 reps as neutral (not enough history to compare)
                                console.log('[completeDay] No previous data for comparison, treating as neutral:', exercise.name);
                            }
                        }

                        // Rule 3: 6+ reps - no plateau buster (PR system handles this)
                    }
                });
                console.log('[completeDay] Total plateau busters:', plateauBusters);

                // Mark workout as submitted (immutable) and add plateau busters
                const updatedHistory = workoutHistory.map(w => {
                    if (w === todayWorkout) {
                        return { ...w, submitted: true, plateauBusters };
                    }
                    return w;
                });

                setWorkoutHistory(updatedHistory);
                storage.setItem('gymWorkoutHistory', JSON.stringify(updatedHistory));

                // Automatically backup to Downloads folder
                autoBackup();

                // Reset all log states so exercises act like a fresh day
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

                // Get all exercises for the current day
                const currentDayExercises = getCurrentExercises();

                // Create NA entries for all exercises based on their type
                const naExercises = currentDayExercises.map(ex => {
                    if (ex.type === 'assault-bike') {
                        return {
                            id: ex.id,
                            name: ex.name,
                            category: ex.category,
                            type: ex.type,
                            intensity: '10/20',
                            watts: 'NA'
                        };
                    } else if (ex.type === 'stairmaster') {
                        return {
                            id: ex.id,
                            name: ex.name,
                            category: ex.category,
                            type: ex.type,
                            level: 'Level 10',  // Hardcoded level
                            time: 'NA'
                        };
                    } else if (ex.type === 'bodyweight') {
                        return {
                            id: ex.id,
                            name: ex.name,
                            category: ex.category,
                            type: ex.type,
                            weight: 'Body Weight',
                            reps: 'NA'
                        };
                    } else {
                        return {
                            id: ex.id,
                            name: ex.name,
                            category: ex.category,
                            type: ex.type,
                            weight: 'NA',
                            reps: 'NA'
                        };
                    }
                });

                // Find if there's already a workout for today with the same day number (that hasn't been submitted)
                let existingWorkoutIndex = workoutHistory.findIndex(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    const isSameDay = workoutDate.getTime() === today.getTime();
                    const isSameWorkoutDay = w.day === currentDay;
                    const isNotSubmitted = !w.submitted;
                    return isSameDay && isSameWorkoutDay && isNotSubmitted;
                });

                let updatedHistory;
                if (existingWorkoutIndex !== -1) {
                    // Update existing workout with NA values and mark as submitted
                    updatedHistory = [...workoutHistory];
                    updatedHistory[existingWorkoutIndex] = {
                        ...updatedHistory[existingWorkoutIndex],
                        exercises: naExercises,
                        date: timestamp,
                        submitted: true,
                        plateauBusters: []
                    };
                } else {
                    // Create new workout and mark as submitted
                    const newWorkout = {
                        date: timestamp,
                        day: currentDay,
                        week: todayWeek,
                        exercises: naExercises,
                        submitted: true,
                        plateauBusters: []
                    };
                    updatedHistory = [newWorkout, ...workoutHistory];
                }

                setWorkoutHistory(updatedHistory);
                storage.setItem('gymWorkoutHistory', JSON.stringify(updatedHistory));

                // Automatically backup to Downloads folder
                autoBackup();

                // Reset all log states so exercises act like a fresh day
                setLoggedExercises({});
                setWorkoutData({});

                // Show the breakdown modal
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
                    exerciseConfig: {
                        day1: day1Exercises,
                        day2: day2Exercises,
                        day3: day3Exercises
                    },
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
                    exerciseConfig: {
                        day1: day1Exercises,
                        day2: day2Exercises,
                        day3: day3Exercises
                    },
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

                        // Handle old format (just workout history array) or new format (object with configs)
                        if (Array.isArray(imported)) {
                            // Old format
                            setWorkoutHistory(imported);
                            storage.setItem('gymWorkoutHistory', JSON.stringify(imported));
                        } else {
                            // New format
                            if (imported.workoutHistory) {
                                setWorkoutHistory(imported.workoutHistory);
                                storage.setItem('gymWorkoutHistory', JSON.stringify(imported.workoutHistory));
                            }
                            if (imported.exerciseConfig) {
                                if (imported.exerciseConfig.day1) {
                                    setDay1Exercises(imported.exerciseConfig.day1.sort((a, b) => a.order - b.order));
                                }
                                if (imported.exerciseConfig.day2) {
                                    setDay2Exercises(imported.exerciseConfig.day2.sort((a, b) => a.order - b.order));
                                }
                                if (imported.exerciseConfig.day3) {
                                    setDay3Exercises(imported.exerciseConfig.day3.sort((a, b) => a.order - b.order));
                                }
                                storage.setItem('gymExerciseConfig', JSON.stringify({
                                    day1: imported.exerciseConfig.day1,
                                    day2: imported.exerciseConfig.day2,
                                    day3: imported.exerciseConfig.day3
                                }));
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
                        setDay1Exercises(DEFAULT_DAY_1_EXERCISES);
                        setDay2Exercises(DEFAULT_DAY_2_EXERCISES);
                        setDay3Exercises(DEFAULT_DAY_3_EXERCISES);
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
                            day1Exercises={day1Exercises}
                            day2Exercises={day2Exercises}
                            day3Exercises={day3Exercises}
                            updateExerciseName={updateExerciseName}
                            moveExercise={moveExercise}
                        />
                    )}

                    {showDayBreakdown && (
                        <DayBreakdownModal
                            onClose={() => setShowDayBreakdown(false)}
                            workoutHistory={workoutHistory}
                            currentDay={currentDay}
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
                            day1Exercises={day1Exercises}
                            day2Exercises={day2Exercises}
                            day3Exercises={day3Exercises}
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
                            currentDay={currentDay}
                            setCurrentDay={handleDayChange}
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
                        />}
                        {currentView === 'weekly' && <WeeklyView
                            workoutHistory={workoutHistory}
                            viewingWeek={viewingWeek}
                            setViewingWeek={setViewingWeek}
                            currentWeek={currentWeek}
                            day1Exercises={day1Exercises}
                            day2Exercises={day2Exercises}
                            day3Exercises={day3Exercises}
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
