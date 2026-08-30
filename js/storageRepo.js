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
        // Device-local keys (firstWorkoutMonday, migration
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

        // One-time import of this device's local data into Firestore, run
        // during repo selection on the FIRST sign-in for this account (the
        // settings/meta doc is the "already done" marker). Cloud entries win
        // for any calendar day they already cover; local entries fill the
        // gaps. A JSON backup auto-downloads before anything is uploaded.
        // Failures are non-fatal: the app proceeds on the Firestore repo
        // (mirror fallback covers display) and the import retries next load
        // because meta was never written.
        function migrateLocalToFirestore(user) {
            const db = firebase.firestore();
            const userDoc = db.collection('users').doc(user.uid);
            const workoutsCol = userDoc.collection('workouts');
            const configDoc = userDoc.collection('settings').doc('exerciseConfig');
            const metaDoc = userDoc.collection('settings').doc('meta');
            const local = createLocalStorageRepo();
            const sanitize = (obj) => JSON.parse(JSON.stringify(obj));

            const downloadPreSyncBackup = (localData) => {
                try {
                    const dataStr = JSON.stringify({
                        workoutHistory: localData.workoutHistory || [],
                        exerciseConfig: localData.exerciseConfig,
                        exportDate: new Date().toISOString(),
                    }, null, 2);
                    const url = URL.createObjectURL(new Blob([dataStr], { type: 'application/json' }));
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'gym-tracker-PRE-SYNC-BACKUP-' +
                        new Date().toISOString().replace(/[:.]/g, '-') + '.json';
                    link.click();
                    URL.revokeObjectURL(url);
                } catch (e) {
                    console.warn('[repo] pre-sync backup download failed:', e);
                }
            };

            return metaDoc.get().then((meta) => {
                if (meta.exists && meta.data().importedFromLocalAt) {
                    return; // import already happened (this or another device)
                }
                return Promise.all([local.loadAll(), workoutsCol.get(), configDoc.get()])
                    .then(([localData, cloudSnap, cloudCfg]) => {
                        const localHistory = localData.workoutHistory || [];
                        const dayOf = (w) => String(w.date || '').slice(0, 10);
                        const cloudDays = new Set(cloudSnap.docs.map((d) => dayOf(d.data())));

                        // Local entries for days the cloud doesn't have; if the
                        // same local day has duplicates, prefer the submitted one.
                        const toUpload = [];
                        const pickedByDay = new Map();
                        localHistory.forEach((w) => {
                            if (cloudDays.has(dayOf(w))) return;
                            const existing = pickedByDay.get(dayOf(w));
                            if (!existing || (w.submitted && !existing.submitted)) {
                                pickedByDay.set(dayOf(w), w);
                            }
                        });
                        pickedByDay.forEach((w) => {
                            if (!w.entryId) {
                                w.entryId = 'w-' + dayOf(w) + '-' + Math.random().toString(36).slice(2, 7);
                            }
                            toUpload.push(w);
                        });

                        if (toUpload.length > 0) {
                            downloadPreSyncBackup(localData);
                        }

                        // Chunked batches (Firestore caps a batch at 500 ops).
                        let chain = Promise.resolve();
                        for (let i = 0; i < toUpload.length; i += 400) {
                            const chunk = toUpload.slice(i, i + 400);
                            chain = chain.then(() => {
                                const batch = db.batch();
                                chunk.forEach((w) => batch.set(workoutsCol.doc(w.entryId), sanitize(w)));
                                return batch.commit();
                            });
                        }

                        return chain.then(() => {
                            const writes = [];
                            if (!cloudCfg.exists && localData.exerciseConfig) {
                                writes.push(configDoc.set(sanitize(localData.exerciseConfig)));
                            }
                            writes.push(metaDoc.set({
                                importedFromLocalAt: new Date().toISOString(),
                                importedCount: toUpload.length,
                                schemaVersion: 1,
                            }));
                            return Promise.all(writes);
                        }).then(() => {
                            console.log('[repo] imported ' + toUpload.length + ' local workouts to Firestore');
                        });
                    });
            });
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
                    if (!user) {
                        resolve(createLocalStorageRepo());
                        return;
                    }
                    resolve(
                        migrateLocalToFirestore(user)
                            .catch((e) => console.warn('[repo] local import failed (will retry next load):', e))
                            .then(() => createFirestoreRepo(user))
                    );
                });
            });
        }).then((repo) => {
            window.repo = repo;
            return repo;
        });
        window.repoReady = repoReady;
