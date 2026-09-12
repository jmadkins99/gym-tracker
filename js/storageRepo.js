        // Storage repository seam. All persistence for workout history,
        // exercise config and the weight log goes through `repo`, an async
        // interface with two implementations: localStorage (tests, signed-out,
        // local dev) and Firestore (signed in, non-local namespace). Selection
        // happens once at startup; the components only ever see the interface.
        //
        // NOTE: written in Promise/.then style on purpose — @babel/standalone
        // lowers async/await to regenerator form, which crashes at runtime
        // without a regeneratorRuntime polyfill.
        //
        // Device-local keys (firstWorkoutMonday, migration
        // sentinels) intentionally bypass the repo: they describe this device,
        // not the training data, and are never synced.
        //
        // The weight page is the third data kind, added September 2026. Its
        // storage keys live here rather than in WeightApp.jsx because both
        // implementations below need them and these files share one global
        // scope — a second `const WEIGHT_LOG_KEY` in WeightApp would be a
        // redeclaration error, not a shadow.
        const WEIGHT_LOG_KEY = 'gymWeightLog';
        const WEIGHT_PLAN_KEY = 'gymWeightPlan';
        const WEIGHT_SEED_KEY = 'weightHistorySeeded';

        // Which page booted the repo, read from the path the way APP_NAMESPACE
        // is. It gates one thing only: which first-sign-in local import runs.
        // Both pages get every method — but the workout page must not haul the
        // weight log up to the cloud (or spring a pre-sync backup download) on
        // a visit that never opened the weight app, and vice versa.
        const REPO_SCOPE = window.location.pathname.includes('/weight/') ? 'weight' : 'workout';

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

                // Resolves { weightLog, weightPlan, weightSeeded }.
                //
                // `weightPlan` carries three states, not two, and the
                // difference is load-bearing: undefined means this account has
                // never had a plan and should get the workbook default, null
                // means one was deliberately cleared and the default must not
                // spring back. An absent key is the first; the literal string
                // 'null' is the second.
                loadWeight: () => Promise.resolve({
                    weightLog: parse(storage.getItem(WEIGHT_LOG_KEY)),
                    weightPlan: storage.getItem(WEIGHT_PLAN_KEY) === null
                        ? undefined
                        : parse(storage.getItem(WEIGHT_PLAN_KEY)),
                    weightSeeded: storage.getItem(WEIGHT_SEED_KEY) === 'true',
                }),

                saveWeightLog: (log) => {
                    storage.setItem(WEIGHT_LOG_KEY, JSON.stringify(log));
                },

                saveWeightPlan: (plan) => {
                    storage.setItem(WEIGHT_PLAN_KEY, JSON.stringify(plan || null));
                },

                markWeightSeeded: () => {
                    storage.setItem(WEIGHT_SEED_KEY, 'true');
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
            // Weight readings are one per calendar day and the day key never
            // moves, so the day IS the document id — no invented entryId like
            // workouts need, and a correction rewrites the same document the
            // original reading wrote.
            const weightCol = userDoc.collection('weightLog');
            const weightPlanDoc = userDoc.collection('settings').doc('weightPlan');
            const weightMetaDoc = userDoc.collection('settings').doc('weightMeta');

            // entryId -> serialized entry, for diffing saves down to the
            // documents that actually changed.
            const lastSaved = new Map();
            // dayKey -> serialized entry, the same diff for the weight log.
            const lastSavedWeight = new Map();
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

                // orderBy('date') ascending to match sortedLog, so the array
                // handed to the page is in the order the page already assumes.
                loadWeight: () => Promise.all([
                    weightCol.orderBy('date').get(),
                    weightPlanDoc.get(),
                    weightMetaDoc.get(),
                ]).then(([logSnap, planSnap, metaSnap]) => {
                    const log = logSnap.docs.map((d) => d.data());
                    log.forEach((e) => lastSavedWeight.set(e.date, JSON.stringify(e)));

                    // The plan doc wraps the plan rather than being it, because
                    // Firestore cannot store a null document — and "cleared" has
                    // to be distinguishable from "never set", which here is the
                    // document not existing at all.
                    const plan = planSnap.exists ? (planSnap.data().plan || null) : undefined;
                    const seeded = !!(metaSnap.exists && metaSnap.data().seededAt);

                    // An EMPTY cloud log is authoritative as long as the meta
                    // doc exists, and this is the one place that matters: meta
                    // existing means this account has been through the weight
                    // import, so an empty log is a Reset somebody actually
                    // performed, not a cold cache. Falling back to the local
                    // mirror here is exactly how a reset on the phone would
                    // undo itself the next time the laptop loaded.
                    if (!metaSnap.exists) {
                        return mirror.loadWeight().then((local) => ({
                            weightLog: log.length > 0 ? log : local.weightLog,
                            weightPlan: plan === undefined ? local.weightPlan : plan,
                            weightSeeded: seeded || local.weightSeeded,
                        }));
                    }

                    mirror.saveWeightLog(log);
                    if (plan !== undefined) mirror.saveWeightPlan(plan);
                    if (seeded) mirror.markWeightSeeded();
                    return { weightLog: log, weightPlan: plan, weightSeeded: seeded };
                }).catch((e) => {
                    console.warn('[repo] Firestore weight load failed, using local mirror:', e);
                    return mirror.loadWeight();
                }),

                // Batched rather than per-document like saveHistory, because
                // this one has a mass-write case the workout log does not: the
                // first load on a fresh device folds in ~900 days of workbook
                // history in a single call, and Reset deletes them all again.
                // A batch of one is a single round trip either way, so the
                // ordinary one-reading-changed save costs nothing for it.
                saveWeightLog: (log) => {
                    const seen = new Set();
                    const ops = [];
                    (log || []).forEach((e) => {
                        seen.add(e.date);
                        const serialized = JSON.stringify(e);
                        if (lastSavedWeight.get(e.date) !== serialized) {
                            lastSavedWeight.set(e.date, serialized);
                            ops.push({ set: e });
                        }
                    });
                    Array.from(lastSavedWeight.keys()).forEach((dayKey) => {
                        if (!seen.has(dayKey)) {
                            lastSavedWeight.delete(dayKey);
                            ops.push({ del: dayKey });
                        }
                    });

                    // Firestore caps a batch at 500 operations.
                    for (let i = 0; i < ops.length; i += 400) {
                        const batch = db.batch();
                        ops.slice(i, i + 400).forEach((op) => {
                            if (op.del) batch.delete(weightCol.doc(op.del));
                            else batch.set(weightCol.doc(op.set.date), sanitize(op.set));
                        });
                        track(batch.commit(), 'weight log');
                    }
                    mirror.saveWeightLog(log);
                },

                saveWeightPlan: (plan) => {
                    track(weightPlanDoc.set({ plan: plan ? sanitize(plan) : null }), 'weight plan');
                    mirror.saveWeightPlan(plan);
                },

                // Merged, not set: the same doc carries importedFromLocalAt.
                markWeightSeeded: () => {
                    track(weightMetaDoc.set({ seededAt: new Date().toISOString() }, { merge: true }),
                          'weight meta');
                    mirror.markWeightSeeded();
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

        // The weight page's equivalent of the import above, run on the FIRST
        // sign-in for this account from the weight page. Same contract: cloud
        // days win, local days fill the gaps, a JSON backup downloads before
        // anything is uploaded, and settings/weightMeta is the "already done"
        // marker so a failure simply retries next load.
        //
        // The one extra thing it carries up is the seed sentinel. That flag is
        // device-local by design — it records that this device has already been
        // offered the workbook history — but once an account syncs it has to
        // become account-wide, or Reset stops working: clear the log on the
        // phone, and the laptop, whose own sentinel the reset never touched,
        // folds all ~900 workbook days straight back into the shared log.
        function migrateLocalWeightToFirestore(user) {
            const db = firebase.firestore();
            const userDoc = db.collection('users').doc(user.uid);
            const weightCol = userDoc.collection('weightLog');
            const weightPlanDoc = userDoc.collection('settings').doc('weightPlan');
            const weightMetaDoc = userDoc.collection('settings').doc('weightMeta');
            const local = createLocalStorageRepo();
            const sanitize = (obj) => JSON.parse(JSON.stringify(obj));

            const downloadPreSyncBackup = (localData) => {
                try {
                    const dataStr = JSON.stringify({
                        weightLog: localData.weightLog || [],
                        weightPlan: localData.weightPlan === undefined ? null : localData.weightPlan,
                        exportDate: new Date().toISOString(),
                    }, null, 2);
                    const url = URL.createObjectURL(new Blob([dataStr], { type: 'application/json' }));
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'weight-PRE-SYNC-BACKUP-' +
                        new Date().toISOString().replace(/[:.]/g, '-') + '.json';
                    link.click();
                    URL.revokeObjectURL(url);
                } catch (e) {
                    console.warn('[repo] weight pre-sync backup download failed:', e);
                }
            };

            return weightMetaDoc.get().then((meta) => {
                if (meta.exists && meta.data().importedFromLocalAt) {
                    return; // import already happened (this or another device)
                }
                return Promise.all([local.loadWeight(), weightCol.get(), weightPlanDoc.get()])
                    .then(([localData, cloudSnap, cloudPlan]) => {
                        const localLog = localData.weightLog || [];
                        const cloudDays = new Set(cloudSnap.docs.map((d) => d.id));
                        const toUpload = localLog.filter((e) => e && e.date && !cloudDays.has(e.date));

                        if (toUpload.length > 0) {
                            downloadPreSyncBackup(localData);
                        }

                        let chain = Promise.resolve();
                        for (let i = 0; i < toUpload.length; i += 400) {
                            const chunk = toUpload.slice(i, i + 400);
                            chain = chain.then(() => {
                                const batch = db.batch();
                                chunk.forEach((e) => batch.set(weightCol.doc(e.date), sanitize(e)));
                                return batch.commit();
                            });
                        }

                        return chain.then(() => {
                            const writes = [];
                            if (!cloudPlan.exists && localData.weightPlan !== undefined) {
                                writes.push(weightPlanDoc.set({
                                    plan: localData.weightPlan ? sanitize(localData.weightPlan) : null,
                                }));
                            }
                            const meta = {
                                importedFromLocalAt: new Date().toISOString(),
                                importedCount: toUpload.length,
                                schemaVersion: 1,
                            };
                            if (localData.weightSeeded) {
                                meta.seededAt = new Date().toISOString();
                            }
                            writes.push(weightMetaDoc.set(meta, { merge: true }));
                            return Promise.all(writes);
                        }).then(() => {
                            console.log('[repo] imported ' + toUpload.length + ' local weight entries to Firestore');
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
                    const importLocal = REPO_SCOPE === 'weight'
                        ? migrateLocalWeightToFirestore
                        : migrateLocalToFirestore;
                    resolve(
                        importLocal(user)
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
