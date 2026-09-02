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

        // Simple PR tracking: if last session hit the top of this exercise's
        // rep range, suggest weight + increment highlighted green.
        function getSimplePR(exerciseId, workoutHistory, loadType) {
            if (!workoutHistory || workoutHistory.length === 0) return null;
            if (!getWeightIncrement(exerciseId, loadType)) return null;

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

            const range = getStandardRepRange(exerciseId);
            if (parseInt(previousExercise.reps, 10) >= range.max) {
                const lastWeight = parseFloat(previousExercise.weight);
                const increment = getWeightIncrement(exerciseId, loadType);
                return {
                    weight: (lastWeight + increment).toString(),
                    lastWeight: previousExercise.weight,
                    lastReps: previousExercise.reps,
                    increment
                };
            }

            return null;
        }

        // Simple stagnation detection: same weight + same reps for 6 consecutive
        // sessions. Surfaces as the gold "Plateau Detected" banner.
        //
        // Nothing keys off a 3-rep session on its own any more: the old
        // rest-pause / Trial of Strength escalation that did is gone, so a run
        // of 3-rep sessions now reaches this check like any other weight/rep
        // pair rather than being intercepted before it.
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
                .slice(0, 6);

            if (recentWorkouts.length < 6) return null;

            const exercises = recentWorkouts.map(w => w.exercises.find(e => e.id === exerciseId));
            const firstWeight = exercises[0].weight;
            const firstReps = exercises[0].reps;

            const allSame = exercises.every(e => e.weight === firstWeight && e.reps === firstReps);

            if (allSame) {
                return { weight: firstWeight, reps: firstReps };
            }

            return null;
        }

        // Did `newer` move this lift forward on `older`? The single definition of
        // "an improvement" in this app, and deliberately the only one: it backs
        // both the flame streak badge and the "PRs Smashed" count in the Day
        // Breakdown modal. Those disagreed until August 2026 — the modal carried
        // its own looser rule, `weight up OR reps up`, which scored a weight DROP
        // as a PR whenever the reps rose. That is not an edge case: a plateau
        // buster drops the weight on purpose (see getPlateauBusterDecrement), so
        // the recovery session came back lighter, at more reps, and the modal
        // congratulated the user for the session the app had told them to back off
        // on. Keep this the one arbiter; a second copy will drift the same way.
        //
        // The weight-up case ignores reps entirely, and that is deliberate: hitting
        // the top of a rep range makes getSimplePR bump the weight and repsDefault
        // reset the dropdown to its start, so the app's own progression always
        // looks like a rep regression on the session after a bump. Counting that
        // as backsliding would cap every streak at 2 and the badge would never
        // mean anything.
        //
        // Non-numeric weights (bodyweight rows carry 'Body Weight', NA rows carry
        // 'NA') can't be compared, so they read as "no improvement" rather than
        // being mistaken for a change.
        function isImprovement(newer, older) {
            if (!newer || !older) return false;
            const newWeight = parseFloat(newer.weight);
            const oldWeight = parseFloat(older.weight);
            const newReps = parseInt(newer.reps);
            const oldReps = parseInt(older.reps);
            if ([newWeight, oldWeight, newReps, oldReps].some(isNaN)) return false;
            if (newWeight > oldWeight) return true;
            if (newWeight < oldWeight) return false;
            return newReps > oldReps;
        }

        function getPreviousSubmittedExerciseForPR(exerciseId, workoutHistory, beforeDate) {
            const cutoff = new Date(beforeDate);
            const sortedWorkouts = workoutHistory
                .filter(w => {
                    if (!w.submitted) return false;
                    return new Date(w.date) < cutoff;
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            for (const workout of sortedWorkouts) {
                const exercise = workout.exercises.find(e => e.id === exerciseId);
                if (!exercise) continue;

                if (exercise.type === 'assault-bike') {
                    if (exercise.intensity && exercise.intensity !== 'NA') return exercise;
                } else if (exercise.type === 'stairmaster') {
                    if (exercise.time && exercise.time !== 'NA') return exercise;
                } else {
                    if (exercise.reps && exercise.reps !== 'NA') return exercise;
                }
            }

            return null;
        }

        function isExercisePRInWorkout(exercise, workout, workoutHistory) {
            if (!exercise || !workout || !workoutHistory) return false;
            if (exercise.type === 'assault-bike' || exercise.type === 'stairmaster' || exercise.type === 'bodyweight') {
                return false;
            }
            if (!exercise.weight || exercise.weight === 'NA' || !exercise.reps || exercise.reps === 'NA') {
                return false;
            }

            const previous = getPreviousSubmittedExerciseForPR(exercise.id, workoutHistory, workout.date);
            return !!previous && isImprovement(exercise, previous);
        }

        // The mirror image of getStagnationWarning: how many consecutive times
        // this lift has moved *forward*. Same history walk, no slice — a streak
        // has no ceiling. Surfaces as the gold-outline flame pill in the exercise header.
        //
        // It counts improvements, not sessions: the oldest session in the run is
        // the baseline you improved *from*, so a flat stretch capped by one better
        // session reads 1, not 2.
        //
        // A session extends the streak exactly when isImprovement says so above:
        // the weight went up, or the weight held and the reps went up. It breaks
        // on an identical session, on a weight drop, and on fewer reps at the
        // same weight.
        function getPRStreak(exerciseId, workoutHistory) {
            if (!workoutHistory || workoutHistory.length === 0) return null;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const sessions = workoutHistory
                .filter(w => {
                    const workoutDate = new Date(w.date);
                    workoutDate.setHours(0, 0, 0, 0);
                    if (workoutDate > today) return false;
                    if (workoutDate.getTime() === today.getTime() && !w.submitted) return false;
                    if (!w.submitted) return false;
                    const exercise = w.exercises.find(e => e.id === exerciseId);
                    return isValidExercise(exercise);
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            if (sessions.length === 0) return null;

            const entries = sessions.map(w => w.exercises.find(e => e.id === exerciseId));

            // Starts at 0: one session on its own is a baseline, not a gain.
            let streak = 0;
            for (let i = 0; i + 1 < entries.length; i++) {
                if (!isImprovement(entries[i], entries[i + 1])) break;
                streak++;
            }

            return streak >= PR_STREAK_MIN ? streak : null;
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

                const range = getStandardRepRange(exerciseId);
                // Only trigger Trial of Strength if last week hit the top of
                // this exercise's rep range.
                if (lastWeekExercise && lastWeekExercise.reps &&
                    parseInt(lastWeekExercise.reps, 10) >= range.max) {
                    if (twoWeeksExercise && twoWeeksExercise.weight) {
                        return {
                            weight: twoWeeksExercise.weight,
                            reps: getStandardRepStart(exerciseId)
                        };
                    }
                }
                // If last week did not hit the top, return null so other logic can handle it.
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
                    const lastReps = parseInt(lastWeekExercise.reps, 10);

                    const range = getStandardRepRange(exerciseId);
                    const startReps = parseInt(getStandardRepStart(exerciseId), 10);
                    // If got below the top, suggest same weight but reps+1.
                    if (lastReps >= startReps && lastReps < range.max) {
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

        // Helper function to check if this is a PR Auto-Regulation week.
        function getPRAutoRegulation(exerciseId, workoutHistory, loadType) {
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

            const range = getStandardRepRange(exerciseId);
            // Check if last week hit the top of the rep range and has a weight increment defined.
            if (previousExercise && previousExercise.reps && parseInt(previousExercise.reps, 10) >= range.max &&
                previousExercise.weight && getWeightIncrement(exerciseId, loadType)) {
                const lastWeight = parseFloat(previousExercise.weight);
                const increment = getWeightIncrement(exerciseId, loadType);
                const newWeight = (lastWeight + increment).toString();

                console.log('[getPRAutoRegulation] PR DETECTED! Last:', lastWeight, 'lbs x', previousExercise.reps, 'New:', newWeight);

                return {
                    weight: newWeight,
                    lastWeight: previousExercise.weight,
                    lastReps: previousExercise.reps,
                    increment: increment
                };
            }

            console.log('[getPRAutoRegulation] No PR (below rep range top or missing data)');
            return null;
        }

        // Helper for the assault bike's two fields. Both are simply carried over
        // from last session (no progression / no PR suggestion):
        //   - Intensity ("work/rest" seconds): defaults to 20/40 with no history.
        //   - Watts (effort level): defaults to 25 with no history.
        // Returns { intensity, watts, isFirstSession }.
        function getAssaultBikeLast(workoutHistory) {
            const DEFAULT_INTENSITY = '20/40';
            const DEFAULT_WATTS = '25';
            const firstSession = { intensity: DEFAULT_INTENSITY, watts: DEFAULT_WATTS, isFirstSession: true };

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
                    return assaultBike && assaultBike.intensity && assaultBike.intensity !== 'NA';
                })
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

            if (!previousWorkout) return firstSession;

            const lastAssaultBike = previousWorkout.exercises.find(e => e.id === 'assault-bike');
            const watts = (lastAssaultBike && lastAssaultBike.watts) || DEFAULT_WATTS;
            const intensity = (lastAssaultBike && lastAssaultBike.intensity) || DEFAULT_INTENSITY;

            return { intensity, watts, isFirstSession: false };
        }

        // Helper for the stairmaster.
        // Time: +10 seconds from last session (the dropdown's step), capped at
        // 20:00, defaulting to 10:00 on the first session. Level: carried over
        // from last session (use whatever was last session), defaulting to
        // Level 7 when there's no prior data.
        // Returns { time, level, lastTime, isFirstSession }.
        // exerciseId parameter allows independent tracking per day
        function getStairmasterSuggestion(exerciseId = 'stairmaster', workoutHistory) {
            const DEFAULT_TIME = '10:00';
            const DEFAULT_LEVEL = 'Level 7';
            const MAX_SECONDS = 20 * 60; // matches the top of the Time dropdown

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
                const newSeconds = Math.min(lastSeconds + 10, MAX_SECONDS); // +10s, cap at 20:00

                return {
                    time: formatSecondsToTime(newSeconds),
                    level: lastStairmaster.level || DEFAULT_LEVEL,
                    lastTime: lastStairmaster.time,
                    isFirstSession: false
                };
            }

            return { time: DEFAULT_TIME, level: DEFAULT_LEVEL, isFirstSession: true };
        }

        // The list of dropdown options ['min', ..., 'max'] for a bodyweight
        // exercise, or null if it has no range configured.
        function getBodyweightRepOptions(exerciseId) {
            const config = BODYWEIGHT_REP_DEFAULTS[exerciseId];
            if (!config || config.min === undefined) return null;
            const opts = [];
            for (let v = config.min; v <= config.max; v += config.step) opts.push(String(v));
            return opts;
        }

        // Snap a rep count to the nearest valid grid value within [min, max].
        function snapBodyweightReps(exerciseId, reps) {
            const config = BODYWEIGHT_REP_DEFAULTS[exerciseId];
            if (!config || config.min === undefined) return String(reps);
            const n = parseInt(reps);
            if (isNaN(n)) return String(config.firstSession);
            const snapped = Math.round((n - config.min) / config.step) * config.step + config.min;
            return String(Math.min(config.max, Math.max(config.min, snapped)));
        }

        // Helper for bodyweight reps (e.g. Body Weight Squats). Carries over last
        // session's reps (no progression / no PR suggestion), snapped to the rep
        // grid, or a configured first-session default when there's no history.
        // Returns { reps, isFirstSession } or null if the exercise has no
        // BODYWEIGHT_REP_DEFAULTS entry.
        function getBodyweightLast(exerciseId, workoutHistory) {
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
                reps: snapBodyweightReps(exerciseId, prevReps),
                isFirstSession: false
            };
        }

        // Helper function for plateau buster weight decrement
        function getPlateauBusterDecrement(exerciseId, workoutHistory, loadType) {
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

            // Only drop weight if previous reps were below the exercise's start
            // reps (true failure). For below-top stagnation, keep same weight.
            const previousReps = parseInt(previousExercise?.reps, 10) || 0;
            const startReps = parseInt(getStandardRepStart(exerciseId), 10);
            if (previousReps >= startReps) {
                console.log('[getPlateauBusterDecrement] Previous reps were', previousReps, '(>= start reps), no weight drop needed');
                return null;
            }

            // Decrease weight by the increment amount after a true failure.
            if (previousExercise && previousExercise.weight && getWeightIncrement(exerciseId, loadType)) {
                const lastWeight = parseFloat(previousExercise.weight);
                const increment = getWeightIncrement(exerciseId, loadType);
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

        // Calculate plate breakdown for a given weight. `loadType` is the
        // exercise's user setting, resolved by the caller — this used to look
        // the classification up itself, back when it lived in a code-side map.
        function calculatePlateBreakdown(totalWeight, loadType) {
            if (loadType !== 'plate-one-sided' && loadType !== 'plate-two-sided') return null;

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

            // Warmups round to a load you can actually BUILD, rather than to a
            // round number.
            //
            // A warmup per-side load is any number of 45s plus at most ONE each
            // of 25, 10 and 5. Stacking two of the same small plate is the
            // fiddly part of loading a warmup you do not care about, so 45+10+10
            // is not offered — 45+25 is, and it is the same trip to the rack.
            // Micro-plates (2.5, 1.25) never appear on a warmup at all; they
            // exist to hit an exact working weight, which is the top set's job.
            //
            // The top set is NEVER rounded. It always shows the exact working
            // weight, micro-plates and all.
            const WARMUP_SMALLS = [25, 10, 5];

            // Every total the small plates can make, each used at most once:
            // 0, 5, 10, 15, 25, 30, 35, 40. Note 20 is missing — it would need
            // two 10s or 10+5+5 — which is why some loads are simply not
            // offered as warmups.
            const smallSums = (() => {
                const out = new Set([0]);
                for (let mask = 1; mask < (1 << WARMUP_SMALLS.length); mask++) {
                    let sum = 0;
                    WARMUP_SMALLS.forEach((p, i) => { if (mask & (1 << i)) sum += p; });
                    out.add(sum);
                }
                return Array.from(out).sort((a, b) => a - b);
            })();

            // Every loadable warmup value up to a ceiling, with its plate count.
            const loadableUpTo = (ceiling) => {
                const out = [];
                const maxFortyFives = Math.max(0, Math.floor(ceiling / 45) + 1);
                for (let k = 0; k <= maxFortyFives; k++) {
                    for (const r of smallSums) {
                        const value = k * 45 + r;
                        // Count the smalls that build this residue.
                        let n = k, rest = r;
                        for (const plate of WARMUP_SMALLS) {
                            if (rest >= plate) { rest -= plate; n++; }
                        }
                        out.push({ value, plates: n });
                    }
                }
                return out;
            };

            // Nearest loadable value to `weight`. Ties go to the load that uses
            // FEWER plates — 65 sits equally between 45+10+5 and 45+25, and the
            // two-plate answer is the better trip to the rack.
            const roundWarmupPerSide = (weight) => {
                const candidates = loadableUpTo(weight + 45);
                let best = null;
                for (const c of candidates) {
                    if (best === null) { best = c; continue; }
                    const d = Math.abs(c.value - weight);
                    const bd = Math.abs(best.value - weight);
                    // A tie has to be judged with a tolerance, not with ===.
                    // The target is a percentage of a decimal weight, so a
                    // genuine tie arrives as 109.99999999999999 rather than 110
                    // and the tie-break never runs — which quietly picked the
                    // four-plate load over the three-plate one.
                    const tied = Math.abs(d - bd) < 1e-6;
                    if ((!tied && d < bd)
                        || (tied && c.plates < best.plates)
                        || (tied && c.plates === best.plates && c.value > best.value)) {
                        best = c;
                    }
                }
                return best ? best.value : 0;
            };

            // The largest loadable value strictly below `limit`, or 0 if there
            // is none. Used to keep the ramp honest at light weights, where the
            // old rule let warmup 2 catch — or even pass — the top set.
            const largestLoadableBelow = (limit) => {
                const under = loadableUpTo(limit + 45)
                    .filter((c) => c.value < limit && c.value > 0)
                    .sort((a, b) => (b.value - a.value) || (a.plates - b.plates));
                return under.length ? under[0].value : 0;
            };

            // Calculate warmup and top set weights
            const warmup1Weight = totalWeight * 0.7;  // 70%
            const warmup2Weight = totalWeight * 0.9;  // 90%
            const topSetWeight = totalWeight;

            // For two-sided machines, divide by 2 to get per-side weight
            const isTwoSided = loadType === 'plate-two-sided';

            const topSetPerSide = isTwoSided ? topSetWeight / 2 : topSetWeight;

            let warmup2PerSide = roundWarmupPerSide(isTwoSided ? warmup2Weight / 2 : warmup2Weight);
            let warmup1PerSide = roundWarmupPerSide(isTwoSided ? warmup1Weight / 2 : warmup1Weight);

            // A ramp has to ascend. Rounding to a coarse grid can push a warmup
            // up onto — or past — the set above it, which used to happen for
            // every plate-loaded weight under about 60 lb: at 60 lb two-sided
            // the 90% warmup WAS the top set. Step each one down to the next
            // loadable value instead. Zero means there is no honest warmup at
            // this weight, and the caller leaves the row out.
            if (warmup2PerSide >= topSetPerSide) {
                warmup2PerSide = largestLoadableBelow(topSetPerSide);
            }
            if (warmup1PerSide >= warmup2PerSide) {
                warmup1PerSide = largestLoadableBelow(warmup2PerSide);
            }

            return {
                isTwoSided,
                warmup1: {
                    totalWeight: isTwoSided ? warmup1PerSide * 2 : warmup1PerSide,
                    perSideWeight: warmup1PerSide,
                    plates: breakdownWeight(warmup1PerSide)
                },
                warmup2: {
                    totalWeight: isTwoSided ? warmup2PerSide * 2 : warmup2PerSide,
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
        //     - The set exceeds maxPin (Calf Raises at 405 is the only capped
        //       exercise today, since Leg Press went back to plate-loaded).
        //       Display "pin at max + plates" using the same plate breakdown
        //       shape as plate-loaded exercises — but always as a single pile,
        //       since a stack has no per-side split.
        //       Plate weight is rounded DOWN to a clean plate combination,
        //       so totalWeight may be slightly under the target.
        //
        // When the exercise has no cap in PIN_STACK_CAPS, no set is ever in
        // overflow mode and the top-set entry can be ignored by the UI
        // (the user already sees their working weight in the input field).
        function calculatePinStackBreakdown(totalWeight, exerciseId) {
            // Caps stay keyed by id in config.js rather than riding on the
            // user's loadType: a ceiling belongs to one machine, not to a way
            // of loading one. Callers only reach here when loadType is 'pin'.
            const maxPin = PIN_STACK_CAPS[exerciseId] ?? null;
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

            // Warmups sit on a ROUND pin position: nearest 10 lb.
            //
            // The stack moves in 5 lb steps, so every multiple of 10 is a real
            // position and no micro-plate is ever needed. Rounding to the exact
            // percentage instead is what produced warmups like 141.25 lb — a
            // 1.25 plate balanced on the pin for a set you do not care about.
            // The top set keeps the precise rounding: that one IS the working
            // weight, and it has to be reachable exactly.
            const roundWarmupPin = (weight) => Math.round(weight / 10) * 10;

            // `exact` skips the pin rounding for a value already known to be a
            // legal position, so a warmup is not rounded twice.
            const buildSet = (target, exact) => {
                if (maxPin === null || target <= maxPin) {
                    const w = exact ? target : roundPinToAchievable(target);
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

            const topSet = buildSet(totalWeight, false);

            // A ramp has to ascend. Rounding to 10 can push a warmup onto — or
            // past — the set above it: at a 30 lb working weight the 90% warmup
            // rounds to exactly 30. Step down to the next position below
            // instead, and let zero mean there is no honest warmup here, which
            // the card renders by leaving the row out.
            const below = (limit) => Math.floor((limit - 0.001) / 10) * 10;
            let warmup2Weight = roundWarmupPin(totalWeight * 0.9);
            let warmup1Weight = roundWarmupPin(totalWeight * 0.7);
            if (warmup2Weight >= topSet.totalWeight) warmup2Weight = below(topSet.totalWeight);
            if (warmup1Weight >= warmup2Weight) warmup1Weight = below(warmup2Weight);
            warmup2Weight = Math.max(0, warmup2Weight);
            warmup1Weight = Math.max(0, warmup1Weight);

            const empty = { overflow: false, pinWeight: 0, totalWeight: 0 };

            return {
                warmup1: warmup1Weight > 0 ? buildSet(warmup1Weight, true) : empty,
                warmup2: warmup2Weight > 0 ? buildSet(warmup2Weight, true) : empty,
                topSet,
            };
        }
