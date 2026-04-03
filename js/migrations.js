        // Migrate existing data to namespaced keys (one-time migration for existing users)
        function migrateToNamespacedStorage() {
            const keysToMigrate = ['gymWorkoutHistory', 'gymExerciseConfig', 'lastBackupReminder'];

            keysToMigrate.forEach(key => {
                // Check if data exists in the old location (without namespace)
                const oldData = localStorage.getItem(key);
                // Check if data already exists in the new location (with namespace)
                const newData = storage.getItem(key);

                // Only migrate if old data exists and new location is empty
                if (oldData && !newData) {
                    storage.setItem(key, oldData);
                    // Optionally remove the old data to clean up
                    // Commenting this out to be safe - users can manually clear old data later
                    // localStorage.removeItem(key);
                }
            });
        }

        // Migrate exercise config when exercises are added/removed from defaults
        // This ensures new exercises show up for existing users
        function migrateExerciseConfig() {
            const savedConfig = storage.getItem('gymExerciseConfig');
            if (!savedConfig) return null; // No saved config, will use defaults

            try {
                const config = JSON.parse(savedConfig);
                const savedDay1 = config.day1 || [];
                const savedDay2 = config.day2 || [];
                const savedDay3 = config.day3 || [];

                const savedDay1ById = new Map(savedDay1.map(e => [e.id, e]));
                const savedDay2ById = new Map(savedDay2.map(e => [e.id, e]));
                const savedDay3ById = new Map(savedDay3.map(e => [e.id, e]));

                const savedDay1Ids = new Set(savedDay1.map(e => e.id));
                const savedDay2Ids = new Set(savedDay2.map(e => e.id));
                const savedDay3Ids = new Set(savedDay3.map(e => e.id));
                const defaultDay1Ids = new Set(DEFAULT_DAY_1_EXERCISES.map(e => e.id));
                const defaultDay2Ids = new Set(DEFAULT_DAY_2_EXERCISES.map(e => e.id));
                const defaultDay3Ids = new Set(DEFAULT_DAY_3_EXERCISES.map(e => e.id));

                const setsEqual = (a, b) => {
                    if (a.size !== b.size) return false;
                    for (const item of a) {
                        if (!b.has(item)) return false;
                    }
                    return true;
                };

                const day1Match = setsEqual(savedDay1Ids, defaultDay1Ids);
                const day2Match = setsEqual(savedDay2Ids, defaultDay2Ids);
                const day3Match = setsEqual(savedDay3Ids, defaultDay3Ids);

                if (day1Match && day2Match && day3Match) {
                    return null; // No migration needed
                }

                console.log('[Exercise Config Migration] Changes detected, migrating...');

                const migrateDay = (savedById, defaultExercises, dayName) => {
                    const result = [];
                    for (const defaultEx of defaultExercises) {
                        if (savedById.has(defaultEx.id)) {
                            const saved = savedById.get(defaultEx.id);
                            result.push({ ...defaultEx, name: saved.name });
                        } else {
                            result.push({ ...defaultEx });
                            console.log(`[${dayName}] Added new exercise: ${defaultEx.name}`);
                        }
                    }
                    for (const [id, saved] of savedById) {
                        if (!defaultExercises.some(d => d.id === id)) {
                            console.log(`[${dayName}] Removed exercise: ${saved.name} (id: ${id})`);
                        }
                    }
                    return result;
                };

                const newDay1 = migrateDay(savedDay1ById, DEFAULT_DAY_1_EXERCISES, 'Day 1 (Push)');
                const newDay2 = migrateDay(savedDay2ById, DEFAULT_DAY_2_EXERCISES, 'Day 2 (Pull)');
                const newDay3 = migrateDay(savedDay3ById, DEFAULT_DAY_3_EXERCISES, 'Day 3 (Legs)');

                const newConfig = { day1: newDay1, day2: newDay2, day3: newDay3 };
                storage.setItem('gymExerciseConfig', JSON.stringify(newConfig));

                console.log('[Exercise Config Migration] Complete! Exercise list updated to match defaults.');

                return newConfig;
            } catch (e) {
                console.error('[Exercise Config Migration] Error:', e);
                return null;
            }
        }
