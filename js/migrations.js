        // Migrate existing data to namespaced keys (one-time migration for existing users)
        function migrateToNamespacedStorage() {
            const keysToMigrate = ['gymWorkoutHistory', 'gymExerciseConfig', 'lastBackupReminder'];

            keysToMigrate.forEach(key => {
                const oldData = localStorage.getItem(key);
                const newData = storage.getItem(key);

                if (oldData && !newData) {
                    storage.setItem(key, oldData);
                }
            });
        }

        // One-time cleanup of the assault bike's abandoned `rounds` metric. The
        // bike is now tracked by `intensity` (work/rest seconds, 20/40 -> 40/20)
        // plus a `watts` effort level; the brief rounds-per-session experiment is
        // discarded. Any historical entry that still carries `rounds` is reset to a
        // clean no-data state so progression restarts fresh at 20/40.
        // Returns { history, changed }.
        function migrateAssaultBikeRoundsToIntensity(workoutHistory) {
            let changed = false;
            const history = workoutHistory.map(workout => {
                let workoutChanged = false;
                const exercises = workout.exercises.map(ex => {
                    if (ex.type === 'assault-bike' && ex.rounds !== undefined) {
                        workoutChanged = true;
                        changed = true;
                        return { id: ex.id, name: ex.name, category: ex.category, type: ex.type, intensity: 'NA' };
                    }
                    return ex;
                });
                return workoutChanged ? { ...workout, exercises } : workout;
            });
            return { history, changed };
        }

        // Reconcile a loaded exercise config against DEFAULT_EXERCISES.
        // - Adds new defaults the user doesn't have.
        // - Drops saved exercises that are no longer in defaults.
        // - Applies the canonical order from DEFAULT_EXERCISES.
        // - Preserves user-renamed display names by id.
        // Pure function: takes the parsed config and returns the reconciled
        // config, or null if no changes are needed. The caller persists.
        //
        // Runs in BOTH local and Firestore mode (App.jsx calls it outside the
        // local-mode gate and saves the result through the repo), so a bump of
        // EXERCISE_CONFIG_VERSION is how a code-side reorder reaches a
        // signed-in device. Without the version check this returns early
        // whenever the id set matches, which made pure reorders a silent no-op.
        function migrateExerciseConfig(config) {
            if (!config) return null;

            const savedExercises = config.exercises || [];

            const savedById = new Map(savedExercises.map(e => [e.id, e]));
            const savedIds = new Set(savedExercises.map(e => e.id));
            const defaultIds = new Set(DEFAULT_EXERCISES.map(e => e.id));

            const setsEqual = (a, b) => {
                if (a.size !== b.size) return false;
                for (const item of a) {
                    if (!b.has(item)) return false;
                }
                return true;
            };

            if (config.version === EXERCISE_CONFIG_VERSION && setsEqual(savedIds, defaultIds)) {
                return null; // Up to date on both membership and layout
            }

            console.log('[Exercise Config Migration] Changes detected, migrating...');

            const result = [];
            for (const defaultEx of DEFAULT_EXERCISES) {
                if (savedById.has(defaultEx.id)) {
                    const saved = savedById.get(defaultEx.id);
                    // Preserve the user's renamed display name; everything else
                    // (category, type, order) comes from defaults.
                    result.push({ ...defaultEx, name: saved.name });
                } else {
                    result.push({ ...defaultEx });
                    console.log(`[Migration] Added new exercise: ${defaultEx.name}`);
                }
            }
            for (const [id, saved] of savedById) {
                if (!defaultIds.has(id)) {
                    console.log(`[Migration] Removed exercise: ${saved.name} (id: ${id})`);
                }
            }

            console.log('[Exercise Config Migration] Complete!');

            return { exercises: result, version: EXERCISE_CONFIG_VERSION };
        }
