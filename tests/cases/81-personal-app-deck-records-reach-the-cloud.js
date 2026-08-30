// What this test covers
// ----------------------
// That what the DECK produces survives the trip to Firestore.
//
// Case 69 already covers the repo's serialisation, but it hands
// createFirestoreRepo a hand-written workout object. That is the right shape of
// test for the repo and the wrong one for this: it cannot catch a UI
// regression. If the deck ever produced a differently shaped exercise — a
// missing `startedAt` because the DOM scrape broke, a weight logged as an empty
// string because an input lost `inputmode="decimal"` — case 69 would still pass,
// because the UI is not in it.
//
// So this drives the real gestures, takes whatever the app actually wrote, and
// pushes THAT through all three cloud paths. They serialise separately, so one
// passing says nothing about the others:
//
//   1. saveHistory             — every log tap, once signed in.
//   2. loadAll                 — reading it back on the next device.
//   3. migrateLocalToFirestore — the one-time import on first sign-in, which
//      has its own copy of `sanitize` and its own batching.
//
// No network and no emulator: createFirestoreRepo reads `firebase` off the
// global and is itself global, so it can be handed a recording stub. That tests
// whether OUR code carries the fields through, rather than testing Firestore.
//
// The undefined check runs INSIDE the page. Firestore rejects undefined values
// outright, and an undefined property does not survive being returned across
// the puppeteer boundary — so asserting it out here would pass unconditionally.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { DEFAULT_NS, revealCard, logCard, selectDeckDay, todayWorkout } = require('../lib/deck');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// A Firestore stub that records writes. `users/{uid}/workouts` is nested, so a
// doc reference needs its own .collection(), and loadAll orders by date.
const INSTALL_STUB = () => {
    window.__written = [];
    window.__stored = new Map();
    const written = window.__written;
    const stored = window.__stored;
    const docsIn = (base) => Array.from(stored.entries())
        .filter(([p]) => p.indexOf(base + '/') === 0 && p.slice(base.length + 1).indexOf('/') === -1)
        .map(([p, d]) => ({ id: p.split('/').pop(), data: () => d }));
    const query = (base, field, dir) => ({
        orderBy: (f, d) => query(base, f, d),
        limit: () => query(base, field, dir),
        get: () => {
            let rows = docsIn(base);
            if (field) {
                rows = rows.slice().sort((a, b) => {
                    const av = a.data()[field], bv = b.data()[field];
                    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
                    return dir === 'desc' ? -cmp : cmp;
                });
            }
            return Promise.resolve({ docs: rows });
        },
    });
    const makeDoc = (p) => ({
        _path: p,
        collection: (sub) => makeCol(p + '/' + sub),
        set: (data) => { written.push({ path: p, data }); stored.set(p, data); return Promise.resolve(); },
        get: () => Promise.resolve({ exists: stored.has(p), data: () => stored.get(p) }),
    });
    const makeCol = (base) => Object.assign(query(base, null, null), {
        doc: (id) => makeDoc(base + '/' + id),
    });
    window.firebase = {
        firestore: () => ({
            collection: (name) => makeCol(name),
            batch: () => {
                const ops = [];
                return {
                    set: (ref, data) => ops.push([ref._path, data]),
                    delete: () => {},
                    commit: () => {
                        ops.forEach(([p, d]) => { written.push({ path: p, data: d }); stored.set(p, d); });
                        return Promise.resolve();
                    },
                };
            },
        }),
    };
};

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, {
            workoutHistory: [{
                date: new Date(Date.now() - 86400000).toISOString(),
                day: 'anterior', week: 1, submitted: true, plateauBusters: [],
                exercises: [{ id: 'chest-press', name: 'Chest Press', category: 'Anterior',
                              type: 'standard', weight: '200', reps: '6' }],
            }],
        });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), DEFAULT_NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDeckDay(page, 'anterior');

        // === 1. Log three movements through the real gestures =========
        for (let i = 0; i < 3; i++) {
            await revealCard(page);
            ok(await logCard(page), `movement ${i + 1} logged through the deck`);
        }

        const workout = await todayWorkout(page);
        ok(workout, 'the deck created today\'s workout');
        const logged = workout.exercises.filter((e) => e.loggedAt);
        eq(logged.length, 3, 'three movements are logged');
        eq(logged.every((e) => !!e.startedAt), true,
            'every one carries startedAt — the deck cannot log un-anchored');
        eq(logged.every((e) => e.weight && e.reps), true,
            'and real weight and reps, not blanks from a broken DOM scrape');

        // === 2. saveHistory ==========================================
        const saved = await page.evaluate((ns, install) => {
            eval('(' + install + ')()');
            const hist = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]');
            const repo = createFirestoreRepo({ uid: 'test-uid' });
            repo.saveHistory(hist);

            const today = new Date(); today.setHours(0, 0, 0, 0);
            const doc = window.__written
                .filter((w) => w.path.indexOf('/workouts/') !== -1)
                .map((w) => w.data)
                .find((d) => { const t = new Date(d.date); t.setHours(0, 0, 0, 0); return t.getTime() === today.getTime(); });
            const ex = doc ? doc.exercises.filter((e) => e.loggedAt) : [];
            return {
                docs: window.__written.filter((w) => w.path.indexOf('/workouts/') !== -1).length,
                logged: ex.length,
                allStarted: ex.every((e) => Object.prototype.hasOwnProperty.call(e, 'startedAt')),
                allLogged: ex.every((e) => Object.prototype.hasOwnProperty.call(e, 'loggedAt')),
                // Asserted in the page: undefined does not cross the boundary.
                noUndefined: ex.every((e) => Object.keys(e).every((k) => e[k] !== undefined)),
                sample: ex.length ? { weight: ex[0].weight, reps: ex[0].reps } : null,
            };
        }, DEFAULT_NS, INSTALL_STUB.toString());

        ok(saved.docs > 0, 'saveHistory wrote workout documents');
        eq(saved.logged, 3, 'all three deck-logged movements reached the document');
        eq(saved.allStarted, true, 'startedAt survived serialisation');
        eq(saved.allLogged, true, 'loggedAt survived serialisation');
        eq(saved.noUndefined, true,
            'no undefined value reached Firestore, which rejects them outright');
        ok(saved.sample && saved.sample.weight && saved.sample.reps,
            'and the weight and reps the deck logged came through');

        // === 3. loadAll ==============================================
        const roundTrip = await page.evaluate(() => {
            const repo = createFirestoreRepo({ uid: 'test-uid' });
            return repo.loadAll().then((loaded) => {
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const w = (loaded.workoutHistory || []).find((h) => {
                    const d = new Date(h.date); d.setHours(0, 0, 0, 0);
                    return d.getTime() === today.getTime();
                });
                const ex = w ? w.exercises.filter((e) => e.loggedAt) : [];
                return { found: !!w, logged: ex.length,
                         both: ex.every((e) => !!e.startedAt && !!e.loggedAt) };
            });
        });
        eq(roundTrip.found, true, 'the workout reads back from the cloud');
        eq(roundTrip.logged, 3, 'with all three movements');
        eq(roundTrip.both, true, 'and both stamps intact');

        // === 4. The one-time first sign-in import ====================
        const migrated = await page.evaluate((install) => {
            eval('(' + install + ')()');
            return Promise.resolve(migrateLocalToFirestore({ uid: 'test-uid' })).then(() => {
                const docs = window.__written
                    .filter((w) => w.path.indexOf('/workouts/') !== -1)
                    .map((w) => w.data);
                const all = docs.reduce((a, d) => a.concat((d.exercises || []).filter((e) => e.loggedAt)), []);
                return {
                    docs: docs.length,
                    logged: all.length,
                    both: all.every((e) => !!e.startedAt && !!e.loggedAt),
                    noUndefined: all.every((e) => Object.keys(e).every((k) => e[k] !== undefined)),
                };
            });
        }, INSTALL_STUB.toString());

        ok(migrated.docs > 0, 'the one-time import wrote workouts');
        ok(migrated.logged >= 3, 'including the deck-logged movements');
        eq(migrated.both, true, 'with both stamps');
        eq(migrated.noUndefined, true, 'and no undefined values');

        eq(errors.length, 0, `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: records the deck produced reach Firestore intact, on all three paths.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
