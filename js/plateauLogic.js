        // Helper function to check if an exercise has valid data (not NA)
        function isValidExercise(exercise) {
            if (!exercise) return false;
            if (exercise.reps === 'NA' || exercise.weight === 'NA') return false;
            if (!exercise.reps || !exercise.weight) return false;
            return true;
        }

        // Helper function to check if exercise is marked for plateau busting
        function isPlateauBuster(exerciseId, workoutHistory) {
            if (!workoutHistory || workoutHistory.length === 0) return false;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Find most recent previous workout of the same day type with valid data for this exercise
            const previousWorkout = workoutHistory
                .filter(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    if (workoutDate > today) return false;

                    // Exclude today's unsubmitted workout
                    if (workoutDate.getTime() === today.getTime() && !w.submitted) return false;

                    // Check if this workout has valid data for this exercise
                    const exercise = w.exercises.find(e => e.id === exerciseId);
                    return isValidExercise(exercise);
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

            if (!previousWorkout || !previousWorkout.plateauBusters) return false;

            return previousWorkout.plateauBusters.includes(exerciseId);
        }

        // Simple PR tracking: if last session hit 6+ reps, suggest weight + increment highlighted green
        function getSimplePR(exerciseId, workoutHistory) {
            if (!workoutHistory || workoutHistory.length === 0) return null;
            if (!PR_WEIGHT_INCREMENTS[exerciseId]) return null;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const previousWorkout = workoutHistory
                .filter(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    if (workoutDate > today) return false;
                    if (workoutDate.getTime() === today.getTime() && !w.submitted) return false;
                    const exercise = w.exercises.find(e => e.id === exerciseId);
                    return isValidExercise(exercise);
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

            if (!previousWorkout) return null;

            const previousExercise = previousWorkout.exercises.find(e => e.id === exerciseId);
            if (!previousExercise || !previousExercise.reps || !previousExercise.weight) return null;

            if (parseInt(previousExercise.reps) >= 6) {
                const lastWeight = parseFloat(previousExercise.weight);
                const increment = PR_WEIGHT_INCREMENTS[exerciseId];
                return {
                    weight: (lastWeight + increment).toString(),
                    lastWeight: previousExercise.weight,
                    lastReps: previousExercise.reps,
                    increment
                };
            }

            return null;
        }

        // Simple stagnation detection: same weight + same reps for 3 consecutive sessions
        function getStagnationWarning(exerciseId, workoutHistory) {
            if (!workoutHistory || workoutHistory.length === 0) return null;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const recentWorkouts = workoutHistory
                .filter(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    if (workoutDate > today) return false;
                    if (workoutDate.getTime() === today.getTime() && !w.submitted) return false;
                    if (!w.submitted) return false;
                    const exercise = w.exercises.find(e => e.id === exerciseId);
                    return isValidExercise(exercise);
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 3);

            if (recentWorkouts.length < 3) return null;

            const exercises = recentWorkouts.map(w => w.exercises.find(e => e.id === exerciseId));
            const firstWeight = exercises[0].weight;
            const firstReps = exercises[0].reps;

            const allSame = exercises.every(e => e.weight === firstWeight && e.reps === firstReps);

            if (allSame) {
                return { weight: firstWeight, reps: firstReps };
            }

            return null;
        }

        // Helper function to check if this is a PR Weight Recovery week (week after plateau buster)
        function getPRWeightRecovery(exerciseId, workoutHistory) {
            if (!workoutHistory || workoutHistory.length < 2) return null;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Get the two most recent previous workouts of the same day type with valid data
            const previousWorkouts = workoutHistory
                .filter(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    if (workoutDate > today) return false;

                    // Exclude today's unsubmitted workout
                    if (workoutDate.getTime() === today.getTime() && !w.submitted) return false;

                    // Check if this workout has valid data for this exercise
                    const exercise = w.exercises.find(e => e.id === exerciseId);
                    return isValidExercise(exercise);
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            if (previousWorkouts.length < 2) return null;

            const lastWeek = previousWorkouts[0];
            const twoWeeksAgo = previousWorkouts[1];

            // Check if two weeks ago had this exercise as a plateau buster
            // That means last week the user saw the gold plateau buster reminder
            // This week they should see green and recover to the original weight
            // BUT only if last week hit 8+ reps (plateau buster success)
            if (twoWeeksAgo.plateauBusters && twoWeeksAgo.plateauBusters.includes(exerciseId)) {
                const lastWeekExercise = lastWeek.exercises.find(e => e.id === exerciseId);
                const twoWeeksExercise = twoWeeksAgo.exercises.find(e => e.id === exerciseId);

                // Only trigger Trial of Strength if last week hit 6+ reps
                if (lastWeekExercise && lastWeekExercise.reps && parseInt(lastWeekExercise.reps) >= 6) {
                    if (twoWeeksExercise && twoWeeksExercise.weight) {
                        return {
                            weight: twoWeeksExercise.weight,
                            reps: '4'  // Always show 4 as the target for Trial of Strength
                        };
                    }
                }
                // If last week didn't hit 8 reps, return null so other logic can handle it
            }

            return null;
        }

        // Helper function to handle failed plateau buster (got 6-7 reps, need to retry)
        function getFailedPlateauBusterRetry(exerciseId, workoutHistory) {
            if (!workoutHistory || workoutHistory.length < 2) return null;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Get the two most recent previous workouts of the same day type with valid data
            const previousWorkouts = workoutHistory
                .filter(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    if (workoutDate > today) return false;

                    // Exclude today's unsubmitted workout
                    if (workoutDate.getTime() === today.getTime() && !w.submitted) return false;

                    // Check if this workout has valid data for this exercise
                    const exercise = w.exercises.find(e => e.id === exerciseId);
                    return isValidExercise(exercise);
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            if (previousWorkouts.length < 2) return null;

            const lastWeek = previousWorkouts[0];
            const twoWeeksAgo = previousWorkouts[1];

            // Check if two weeks ago had a plateau buster and last week got 6-7 reps (failed plateau buster)
            if (twoWeeksAgo.plateauBusters && twoWeeksAgo.plateauBusters.includes(exerciseId)) {
                const lastWeekExercise = lastWeek.exercises.find(e => e.id === exerciseId);

                if (lastWeekExercise && lastWeekExercise.reps && lastWeekExercise.weight) {
                    const lastReps = parseInt(lastWeekExercise.reps);

                    // If got 4-5 reps (didn't hit the 6 rep goal), suggest same weight but reps+1
                    if (lastReps >= 4 && lastReps < 6) {
                        return {
                            weight: lastWeekExercise.weight,
                            targetReps: (lastReps + 1).toString(),
                            lastReps: lastWeekExercise.reps
                        };
                    }
                }
            }

            return null;
        }

        // Helper function to check if this is a PR Auto-Regulation week (after hitting 8+ reps)
        function getPRAutoRegulation(exerciseId, workoutHistory) {
            console.log('[getPRAutoRegulation] Checking for:', exerciseId);
            if (!workoutHistory || workoutHistory.length === 0) {
                console.log('[getPRAutoRegulation] No workout history');
                return null;
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Find most recent previous workout with valid data
            const previousWorkout = workoutHistory
                .filter(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    if (workoutDate > today) return false;

                    // Exclude today's unsubmitted workout
                    if (workoutDate.getTime() === today.getTime() && !w.submitted) return false;

                    // Check if this workout has valid data for this exercise
                    const exercise = w.exercises.find(e => e.id === exerciseId);
                    return isValidExercise(exercise);
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

            console.log('[getPRAutoRegulation] Previous workout:', previousWorkout);

            if (!previousWorkout) {
                console.log('[getPRAutoRegulation] No previous workout found');
                return null;
            }

            const previousExercise = previousWorkout.exercises.find(e => e.id === exerciseId);
            console.log('[getPRAutoRegulation] Previous exercise:', previousExercise);

            // Check if last week hit a PR (6+ reps) and has a weight increment defined
            if (previousExercise && previousExercise.reps && parseInt(previousExercise.reps) >= 6 &&
                previousExercise.weight && PR_WEIGHT_INCREMENTS[exerciseId]) {
                const lastWeight = parseFloat(previousExercise.weight);
                const increment = PR_WEIGHT_INCREMENTS[exerciseId];
                const newWeight = (lastWeight + increment).toString();

                console.log('[getPRAutoRegulation] PR DETECTED! Last:', lastWeight, 'lbs x', previousExercise.reps, 'New:', newWeight);

                return {
                    weight: newWeight,
                    lastWeight: previousExercise.weight,
                    lastReps: previousExercise.reps,
                    increment: increment
                };
            }

            console.log('[getPRAutoRegulation] No PR (reps < 6 or missing data)');
            return null;
        }

        // Helper function for assault bike progression: +1 round from last session,
        // or a first-session default of 3 rounds when there's no prior history.
        // Returns { rounds, lastRounds, isFirstSession }.
        function getAssaultBikePR(workoutHistory) {
            const DEFAULT_ROUNDS = '3';
            const firstSession = { rounds: DEFAULT_ROUNDS, isFirstSession: true };

            if (!workoutHistory || workoutHistory.length === 0) return firstSession;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Find the most recent workout with valid assault bike data
            const previousWorkout = workoutHistory
                .filter(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    // Exclude future workouts
                    if (workoutDate > today) return false;
                    // Exclude today's unsubmitted workout
                    if (workoutDate.getTime() === today.getTime() && !w.submitted) return false;

                    // Check if this workout has valid assault bike data
                    const assaultBike = w.exercises.find(e => e.id === 'assault-bike');
                    return assaultBike && assaultBike.rounds && assaultBike.rounds !== 'NA';
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

            if (!previousWorkout) return firstSession;

            const lastAssaultBike = previousWorkout.exercises.find(e => e.id === 'assault-bike');

            if (lastAssaultBike && lastAssaultBike.rounds) {
                const lastRounds = parseInt(lastAssaultBike.rounds);
                if (isNaN(lastRounds)) return firstSession;

                return {
                    rounds: (lastRounds + 1).toString(),
                    lastRounds: lastAssaultBike.rounds,
                    isFirstSession: false
                };
            }

            return firstSession;
        }

        // Helper function for stairmaster suggestion.
        // Time: +30 seconds from last session, capped at 20:00, default 10:00 on the
        // first session. Level: carried over from last session (so "use whatever was
        // last session"), defaulting to Level 7 when there's no prior data.
        // exerciseId parameter allows independent tracking per day
        function getStairmasterSuggestion(exerciseId = 'stairmaster', workoutHistory) {
            const DEFAULT_TIME = '10:00';
            const DEFAULT_LEVEL = 'Level 7';

            if (!workoutHistory || workoutHistory.length === 0) {
                return { time: DEFAULT_TIME, level: DEFAULT_LEVEL, isFirstSession: true };
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Find the most recent workout with valid stairmaster data for this specific exercise
            const previousWorkout = workoutHistory
                .filter(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    if (workoutDate > today) return false;
                    if (workoutDate.getTime() === today.getTime() && !w.submitted) return false;

                    const stairmaster = w.exercises.find(e => e.type === 'stairmaster');
                    return stairmaster && stairmaster.time && stairmaster.time !== 'NA';
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

            if (!previousWorkout) {
                return { time: DEFAULT_TIME, level: DEFAULT_LEVEL, isFirstSession: true };
            }

            const lastStairmaster = previousWorkout.exercises.find(e => e.type === 'stairmaster');

            if (lastStairmaster && lastStairmaster.time) {
                const lastSeconds = parseTimeToSeconds(lastStairmaster.time);
                const newSeconds = Math.min(lastSeconds + 30, 20 * 60); // +30s, cap at 20:00

                return {
                    time: formatSecondsToTime(newSeconds),
                    level: lastStairmaster.level || DEFAULT_LEVEL,
                    lastTime: lastStairmaster.time,
                    isFirstSession: false
                };
            }

            return { time: DEFAULT_TIME, level: DEFAULT_LEVEL, isFirstSession: true };
        }

        // Helper for bodyweight rep progression (e.g. Body Weight Squats).
        // Suggests last session's reps + a fixed increment every session, or a
        // configured first-session default when there's no prior history.
        // Returns { reps, lastReps, isFirstSession } or null if the exercise has
        // no BODYWEIGHT_REP_DEFAULTS entry.
        function getBodyweightPR(exerciseId, workoutHistory) {
            const config = BODYWEIGHT_REP_DEFAULTS[exerciseId];
            if (!config) return null;

            const firstSession = { reps: String(config.firstSession), isFirstSession: true };

            if (!workoutHistory || workoutHistory.length === 0) return firstSession;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const previousWorkout = workoutHistory
                .filter(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    if (workoutDate > today) return false;
                    if (workoutDate.getTime() === today.getTime() && !w.submitted) return false;

                    const exercise = w.exercises.find(e => e.id === exerciseId);
                    return exercise && exercise.reps && exercise.reps !== 'NA';
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

            if (!previousWorkout) return firstSession;

            const previousExercise = previousWorkout.exercises.find(e => e.id === exerciseId);
            const prevReps = parseInt(previousExercise.reps);
            if (isNaN(prevReps)) return firstSession;

            return {
                reps: String(prevReps + config.increment),
                lastReps: previousExercise.reps,
                isFirstSession: false
            };
        }

        // Helper function for plateau buster weight decrement
        function getPlateauBusterDecrement(exerciseId, workoutHistory) {
            console.log('[getPlateauBusterDecrement] Checking for:', exerciseId);
            if (!workoutHistory || workoutHistory.length === 0) return null;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Find most recent previous workout with valid data
            const previousWorkout = workoutHistory
                .filter(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    if (workoutDate > today) return false;

                    // Exclude today's unsubmitted workout
                    if (workoutDate.getTime() === today.getTime() && !w.submitted) return false;

                    // Check if this workout has valid data for this exercise
                    const exercise = w.exercises.find(e => e.id === exerciseId);
                    return isValidExercise(exercise);
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

            console.log('[getPlateauBusterDecrement] Previous workout:', previousWorkout);
            console.log('[getPlateauBusterDecrement] Plateau busters:', previousWorkout?.plateauBusters);

            if (!previousWorkout || !previousWorkout.plateauBusters || !previousWorkout.plateauBusters.includes(exerciseId)) {
                console.log('[getPlateauBusterDecrement] Not a plateau buster');
                return null;
            }

            const previousExercise = previousWorkout.exercises.find(e => e.id === exerciseId);

            // Only drop weight if previous reps were < 4 (true failure)
            // For 4-5 reps stagnation, keep same weight (just do 2 sets)
            const previousReps = parseInt(previousExercise?.reps) || 0;
            if (previousReps >= 4) {
                console.log('[getPlateauBusterDecrement] Previous reps were', previousReps, '(>= 4), no weight drop needed');
                return null;
            }

            // Decrease weight by the increment amount (only for < 6 reps)
            if (previousExercise && previousExercise.weight && PR_WEIGHT_INCREMENTS[exerciseId]) {
                const lastWeight = parseFloat(previousExercise.weight);
                const increment = PR_WEIGHT_INCREMENTS[exerciseId];
                const newWeight = (lastWeight - increment).toString();

                console.log('[getPlateauBusterDecrement] PLATEAU BUSTER! Last:', lastWeight, 'New:', newWeight);

                return {
                    weight: newWeight,
                    lastWeight: previousExercise.weight,
                    increment: increment
                };
            }

            console.log('[getPlateauBusterDecrement] Missing data');
            return null;
        }

        // Calculate plate breakdown for a given weight
        function calculatePlateBreakdown(totalWeight, exerciseId) {
            const config = PLATE_LOADED_EXERCISES[exerciseId];
            if (!config) return null;

            const availablePlates = [45, 25, 10, 5, 2.5, 1.25];

            // Helper function to break down weight into plates
            const breakdownWeight = (weight) => {
                const plates = {};
                let remaining = weight;

                for (const plate of availablePlates) {
                    const count = Math.floor(remaining / plate);
                    if (count > 0) {
                        plates[plate] = count;
                        remaining = parseFloat((remaining - (count * plate)).toFixed(2));
                    }
                }

                return plates;
            };

            // Calculate warmup and top set weights
            const warmup1Weight = totalWeight * 0.7;  // 70%
            const warmup2Weight = totalWeight * 0.9;  // 90%
            const topSetWeight = totalWeight;

            // For two-sided machines, divide by 2 to get per-side weight
            const isTwoSided = config.type === 'two-sided';

            const warmup1PerSide = isTwoSided ? warmup1Weight / 2 : warmup1Weight;
            const warmup2PerSide = isTwoSided ? warmup2Weight / 2 : warmup2Weight;
            const topSetPerSide = isTwoSided ? topSetWeight / 2 : topSetWeight;

            return {
                isTwoSided,
                warmup1: {
                    totalWeight: warmup1Weight,
                    perSideWeight: warmup1PerSide,
                    plates: breakdownWeight(warmup1PerSide)
                },
                warmup2: {
                    totalWeight: warmup2Weight,
                    perSideWeight: warmup2PerSide,
                    plates: breakdownWeight(warmup2PerSide)
                },
                topSet: {
                    totalWeight: topSetWeight,
                    perSideWeight: topSetPerSide,
                    plates: breakdownWeight(topSetPerSide)
                }
            };
        }

        // Calculate the warmup + top-set breakdown for a pin-stack exercise.
        //
        // Returns: { warmup1, warmup2, topSet } where each set is one of:
        //   { overflow: false, pinWeight, totalWeight }
        //     - The set fits on the pin stack. Display just the pin weight.
        //   { overflow: true, pinWeight, plates, totalWeight }
        //     - The set exceeds maxPin (cable-wrist-curls is the only such
        //       exercise today). Display "pin at max + plates" using the
        //       same plate breakdown shape as plate-loaded exercises.
        //       Plate weight is rounded DOWN to a clean plate combination,
        //       so totalWeight may be slightly under the target.
        //
        // When the exercise has no `maxPin` configured, no set is ever in
        // overflow mode and the top-set entry can be ignored by the UI
        // (the user already sees their working weight in the input field).
        function calculatePinStackBreakdown(totalWeight, exerciseId) {
            const config = PIN_STACK_EXERCISES[exerciseId];
            const maxPin = (config && typeof config === 'object') ? config.maxPin : null;
            const availablePlates = [45, 25, 10, 5, 2.5, 1.25];

            // Round to nearest achievable pin weight (5 lb increments + optional
            // 1.25, 2.5, or 3.75 micro-plate on top of the pin).
            const roundPinToAchievable = (weight) => {
                const base = Math.floor(weight / 5) * 5;
                const remainder = weight - base;
                if (remainder < 0.625) return base;
                else if (remainder < 1.875) return base + 1.25;
                else if (remainder < 3.125) return base + 2.5;
                else if (remainder < 4.375) return base + 3.75;
                else return base + 5;
            };

            // Break `weight` down into the largest plate combo that doesn't
            // exceed it. Floor semantics — if there's a remainder smaller than
            // 1.25 it's dropped (no fractional plate available).
            const breakdownPlatesFloor = (weight) => {
                const plates = {};
                let remaining = weight;
                for (const plate of availablePlates) {
                    const count = Math.floor(remaining / plate);
                    if (count > 0) {
                        plates[plate] = count;
                        remaining = parseFloat((remaining - count * plate).toFixed(2));
                    }
                }
                return plates;
            };

            const buildSet = (target) => {
                if (maxPin === null || target <= maxPin) {
                    const w = roundPinToAchievable(target);
                    return { overflow: false, pinWeight: w, totalWeight: w };
                }
                const excess = target - maxPin;
                const plates = breakdownPlatesFloor(excess);
                const plateTotal = Object.entries(plates)
                    .reduce((sum, [p, c]) => sum + parseFloat(p) * c, 0);
                return {
                    overflow: true,
                    pinWeight: maxPin,
                    plates,
                    totalWeight: parseFloat((maxPin + plateTotal).toFixed(2)),
                };
            };

            return {
                warmup1: buildSet(totalWeight * 0.7),
                warmup2: buildSet(totalWeight * 0.9),
                topSet: buildSet(totalWeight),
            };
        }
