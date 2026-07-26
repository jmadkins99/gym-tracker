        // Storage repository seam. All persistence for workout history and
        // exercise config goes through `repo`, an async interface with (for
        // now) a single localStorage-backed implementation. A cloud-backed
        // implementation can slot in behind the same interface without
        // touching the components.
        //
        // NOTE: written in Promise/.then style on purpose — @babel/standalone
        // lowers async/await to regenerator form, which crashes at runtime
        // without a regeneratorRuntime polyfill.
        //
        // Device-local keys (lastBackupReminder, firstWorkoutMonday, migration
        // sentinels) intentionally bypass the repo: they describe this device,
        // not the training data, and are never synced.

        function createLocalStorageRepo() {
            const parse = (raw) => {
                if (!raw) return null;
                try {
                    return JSON.parse(raw);
                } catch (e) {
                    console.warn('[repo] Ignoring unparseable stored value:', e);
                    return null;
                }
            };

            return {
                mode: 'local',

                // Resolves { workoutHistory: Array|null, exerciseConfig: Object|null }.
                loadAll: () => Promise.resolve({
                    workoutHistory: parse(storage.getItem('gymWorkoutHistory')),
                    exerciseConfig: parse(storage.getItem('gymExerciseConfig')),
                }),

                // Fire-and-forget saves: callers never await these.
                saveHistory: (history) => {
                    storage.setItem('gymWorkoutHistory', JSON.stringify(history));
                },

                saveExerciseConfig: (config) => {
                    storage.setItem('gymExerciseConfig', JSON.stringify(config));
                },

                clearAll: () => {
                    storage.removeItem('gymWorkoutHistory');
                    storage.removeItem('gymExerciseConfig');
                    storage.removeItem('lastBackupReminder');
                    return Promise.resolve();
                },

                status: () => ({ mode: 'local', signedIn: false, pendingWrites: 0 }),
            };
        }

        // Repo selection. For now this is always the localStorage repo; the
        // cloud implementation will hook in here (auth state decides).
        const repoReady = Promise.resolve(createLocalStorageRepo()).then((repo) => {
            window.repo = repo;
            return repo;
        });
        window.repoReady = repoReady;
