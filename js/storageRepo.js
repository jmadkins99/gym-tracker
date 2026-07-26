        // Storage repository seam. All persistence for workout history and
        // exercise config goes through `repo`, an async interface with two
        // implementations: localStorage (tests, signed-out, local dev) and
        // Firestore (signed in, non-local namespace). Selection happens once
        // at startup; the components only ever see the interface.
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

        // Firestore-backed repo. One document per workout entry at
        // users/{uid}/workouts/{entryId}; exercise config at
        // users/{uid}/settings/exerciseConfig. Writes are fire-and-forget —
        // Firestore's offline queue owns durability — and every save also
        // mirrors to localStorage so a later signed-out or offline-cold-cache
        // session still has the data.
        function createFirestoreRepo(user) {
            const db = firebase.firestore();
            const userDoc = db.collection('users').doc(user.uid);
            const workoutsCol = userDoc.collection('workouts');
            const configDoc = userDoc.collection('settings').doc('exerciseConfig');

            // entryId -> serialized entry, for diffing saves down to the
            // documents that actually changed.
            const lastSaved = new Map();
            let pendingWrites = 0;

            // Firestore rejects undefined values; a JSON round-trip strips them.
            const sanitize = (obj) => JSON.parse(JSON.stringify(obj));

            const track = (promise, what) => {
                pendingWrites++;
                promise
                    .then(() => { pendingWrites--; })
                    .catch((e) => {
                        pendingWrites--;
                        console.warn('[repo] ' + what + ' write failed:', e);
                    });
            };

            // Workout entries need an identity that survives `date` being
            // rewritten on every log tap. Assigned in place so the objects
            // React holds keep their ids across subsequent saves.
            const ensureEntryIds = (history) => {
                history.forEach((w) => {
                    if (!w.entryId) {
                        const day = String(w.date || new Date().toISOString()).slice(0, 10);
                        w.entryId = 'w-' + day + '-' + Math.random().toString(36).slice(2, 7);
                    }
                });
            };

            const mirror = createLocalStorageRepo();

            return {
                mode: 'firestore',

                loadAll: () => Promise.all([
                    workoutsCol.orderBy('date', 'desc').get(),
                    configDoc.get(),
                ]).then(([workoutsSnap, cfgSnap]) => {
                    const history = workoutsSnap.docs.map((d) => d.data());
                    history.forEach((w) => lastSaved.set(w.entryId, JSON.stringify(w)));
                    const config = cfgSnap.exists ? cfgSnap.data() : null;

                    if (history.length > 0) {
                        mirror.saveHistory(history);
                    }
                    if (config) {
                        mirror.saveExerciseConfig(config);
                    }

                    // Empty cloud data (e.g. offline cold cache before the
                    // first sync): fall back to whatever this device has.
                    if (history.length === 0 || !config) {
                        return mirror.loadAll().then((local) => ({
                            workoutHistory: history.length > 0 ? history : local.workoutHistory,
                            exerciseConfig: config || local.exerciseConfig,
                        }));
                    }
                    return { workoutHistory: history, exerciseConfig: config };
                }).catch((e) => {
                    console.warn('[repo] Firestore load failed, using local mirror:', e);
                    return mirror.loadAll();
                }),

                saveHistory: (history) => {
                    ensureEntryIds(history);
                    const seen = new Set();
                    history.forEach((w) => {
                        seen.add(w.entryId);
                        const serialized = JSON.stringify(w);
                        if (lastSaved.get(w.entryId) !== serialized) {
                            lastSaved.set(w.entryId, serialized);
                            track(workoutsCol.doc(w.entryId).set(sanitize(w)), 'workout');
                        }
                    });
                    Array.from(lastSaved.keys()).forEach((entryId) => {
                        if (!seen.has(entryId)) {
                            lastSaved.delete(entryId);
                            track(workoutsCol.doc(entryId).delete(), 'workout delete');
                        }
                    });
                    mirror.saveHistory(history);
                },

                saveExerciseConfig: (config) => {
                    track(configDoc.set(sanitize(config)), 'config');
                    mirror.saveExerciseConfig(config);
                },

                clearAll: () => {
                    const batch = db.batch();
                    lastSaved.forEach((_, entryId) => batch.delete(workoutsCol.doc(entryId)));
                    batch.delete(configDoc);
                    lastSaved.clear();
                    return batch.commit()
                        .catch((e) => console.warn('[repo] cloud clear failed:', e))
                        .then(() => mirror.clearAll());
                },

                status: () => ({
                    mode: 'firestore',
                    signedIn: true,
                    email: user.email,
                    pendingWrites,
                }),
            };
        }

        // Sign-in/out actions for the Settings UI and sync banner. Popup, not
        // redirect: signInWithRedirect breaks on browsers that partition
        // third-party storage when authDomain differs from the app's domain
        // (github.io). A reload after either action re-runs repo selection.
        function repoSignIn() {
            return firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider())
                .then(() => window.location.reload())
                .catch((e) => {
                    if (e && e.code === 'auth/popup-closed-by-user') return;
                    console.warn('[repo] sign-in failed:', e && e.code);
                    alert('Sign-in failed: ' + ((e && e.message) || 'unknown error'));
                });
        }
        function repoSignOut() {
            return firebase.auth().signOut().then(() => window.location.reload());
        }
        window.repoSignIn = repoSignIn;
        window.repoSignOut = repoSignOut;

        // Repo selection, decided once per page load:
        // - gym-local namespace / no config / SDK load failure -> localStorage.
        // - otherwise the first auth-state callback decides: signed in ->
        //   Firestore, signed out -> localStorage. onAuthStateChanged fires
        //   from IndexedDB-cached credentials, so this works offline too.
        const repoReady = window.FIREBASE_INIT.then((firebaseReady) => {
            if (!firebaseReady) {
                return createLocalStorageRepo();
            }
            return new Promise((resolve) => {
                const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
                    unsubscribe();
                    resolve(user ? createFirestoreRepo(user) : createLocalStorageRepo());
                });
            });
        }).then((repo) => {
            window.repo = repo;
            return repo;
        });
        window.repoReady = repoReady;
