// What this test covers
// ----------------------
// That `startedAt` and `loggedAt` survive the trip to Firestore and back.
//
// Every other case in this suite runs in local mode. That is deliberate —
// `gym-local:` never initialises Firebase, which is what keeps the suite
// offline and silent (cases 36 and 38 pin exactly that) — but it means the
// entire cloud path is untested, and the cloud path is where the data lives
// whenever Josh is signed in. Two new per-exercise fields shipped without
// anything proving they reach it. If they did not, the phone would show
// timings, the synced copy would quietly not have them, and the loss would
// only surface on a new device.
//
// No network and no emulator: `createFirestoreRepo` reads `firebase` off the
// global and is itself global, so it can be handed a recording stub and driven
// directly. That tests the thing actually at risk — whether OUR code carries
// the fields through — rather than testing Firestore, which is not our code.
//
// Three paths write workouts, and all three are covered because they serialise
// separately:
//
//   1. saveHistory              — every log tap, once signed in.
//   2. loadAll                  — reading it back on the next device.
//   3. migrateLocalToFirestore  — the ONE-TIME import on first sign-in, which
//      carries the history already on the phone. It has its own copy of
//      `sanitize` and its own batched writes, so path 1 passing says nothing
//      about it.
//
// The undefined check is not incidental. Firestore rejects `undefined` values
// outright, so a movement logged without its panel opened must arrive with NO
// `startedAt` key rather than an explicit undefined — that is what the JSON
// round-trip inside `sanitize` is for. It is asserted INSIDE the page, on a
// fixture that deliberately sets `startedAt: undefined`: an undefined property
// does not survive being returned across the puppeteer boundary, so checking it
// out here would silently pass no matter what.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const ANCHORED_START = '2026-08-28T16:00:00.000Z';
const ANCHORED_LOG = '2026-08-28T16:06:00.000Z';
const UNANCHORED_LOG = '2026-08-28T16:14:00.000Z';
const UNDEFINED_LOG = '2026-08-28T16:22:00.000Z';

// Installs a fake `firebase` that records every document write, drives the
// three write paths, and reports what they produced. Runs entirely in the page.
const CLOUD_PROBE = (aStart, aLog, uLog, undefLog) => {
    const written = [];
    const stored = new Map();
    const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

    const makeDoc = (p) => ({
        set: (data) => { written.push({ path: p, data }); stored.set(p, data); return Promise.resolve(); },
        delete: () => Promise.resolve(),
        get: () => Promise.resolve({ exists: stored.has(p), data: () => stored.get(p) }),
        collection: (name) => makeCol(p + '/' + name),
        _path: p,
    });
    const snapshotOf = (prefix) => ({
        docs: Array.from(stored.keys())
            .filter(k => k.indexOf(prefix + '/') === 0)
            .map(k => ({ data: () => stored.get(k) })),
    });
    const makeCol = (p) => ({
        doc: (id) => makeDoc(p + '/' + id),
        get: () => Promise.resolve(snapshotOf(p)),
        orderBy: () => ({ get: () => Promise.resolve(snapshotOf(p)) }),
    });

    window.firebase = {
        firestore: () => ({
            collection: (name) => makeCol(name),
            batch: () => {
                const ops = [];
                return {
                    set: (ref, data) => { ops.push([ref._path, data]); },
                    delete: () => {},
                    commit: () => {
                        ops.forEach(([p, d]) => { written.push({ path: p, data: d }); stored.set(p, d); });
                        return Promise.resolve();
                    },
                };
            },
        }),
    };

    const workoutDocs = () => written.filter(w => w.path.indexOf('/workouts/') !== -1);

    const workout = {
        date: undefLog,
        day: 'anterior',
        week: 1,
        submitted: true,
        plateauBusters: [],
        exercises: [
            // Anchored: both stamps present.
            { id: 'chest-press', name: 'Chest Press', category: 'Anterior',
              type: 'standard', weight: '200', reps: '6',
              startedAt: aStart, loggedAt: aLog },
            // Panel never opened, so logExercise never adds the key at all.
            { id: 'incline-chest-press', name: 'Incline Chest Press', category: 'Anterior',
              type: 'standard', weight: '110', reps: '6', loggedAt: uLog },
            // The shape a careless refactor would produce: the key present and
            // explicitly undefined. Firestore rejects that, so sanitize must
            // strip it rather than pass it through.
            { id: 'chest-flies', name: 'Chest Flies', category: 'Anterior',
              type: 'standard', weight: '165', reps: '6',
              startedAt: undefined, loggedAt: undefLog },
        ],
    };

    // === 1. saveHistory — the every-log-tap path ========================
    const repo = createFirestoreRepo({ uid: 'test-uid' });
    repo.saveHistory([workout]);

    const savedDocs = workoutDocs();
    const savedDoc = savedDocs[0];
    const savedEx = (id) => savedDoc.data.exercises.find(e => e.id === id);

    // Asserted here, in the page, where `undefined` still exists.
    const keyChecks = {
        anchoredHasStartedAt: hasOwn(savedEx('chest-press'), 'startedAt'),
        noKeyHasStartedAt: hasOwn(savedEx('incline-chest-press'), 'startedAt'),
        explicitUndefinedHasStartedAt: hasOwn(savedEx('chest-flies'), 'startedAt'),
    };

    // === 2. loadAll — reading it back ===================================
    return repo.loadAll().then((loaded) => {
        const readBack = loaded.workoutHistory[0].exercises;

        // === 3. First sign-in import ====================================
        // Fresh cloud, workout only on the device, and a different uid so this
        // cannot see anything path 1 wrote.
        stored.clear();
        written.length = 0;
        localStorage.setItem('gym-local:gymWorkoutHistory', JSON.stringify([workout]));

        return migrateLocalToFirestore({ uid: 'import-uid' }).then(() => {
            const importDocs = workoutDocs();
            return {
                savedCount: savedDocs.length,
                savedPath: savedDoc.path,
                savedExercises: savedDoc.data.exercises,
                keyChecks,
                readBack,
                importCount: importDocs.length,
                importPath: importDocs.length ? importDocs[0].path : null,
                importExercises: importDocs.length ? importDocs[0].data.exercises : [],
            };
        });
    });
};

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate(() =>
            localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // Sanity: this really is a local-mode page, so nothing below is the
        // real Firebase quietly doing the work.
        eq(await page.evaluate(() => window.FIREBASE_READY), false,
            'the page is in local mode — everything below is driven by the stub');

        const r = await page.evaluate(CLOUD_PROBE,
            ANCHORED_START, ANCHORED_LOG, UNANCHORED_LOG, UNDEFINED_LOG);

        // === 1. saveHistory ============================================
        eq(r.savedCount, 1, 'saveHistory wrote exactly one workout document');
        ok(/^users\/test-uid\/workouts\/w-2026-08-28-/.test(r.savedPath),
            `the workout lands under the signed-in user's own tree (${r.savedPath})`);

        const sentAnchored = r.savedExercises.find(e => e.id === 'chest-press');
        const sentNoKey = r.savedExercises.find(e => e.id === 'incline-chest-press');

        eq(sentAnchored.startedAt, ANCHORED_START, 'startedAt is written to Firestore');
        eq(sentAnchored.loggedAt, ANCHORED_LOG, 'loggedAt is written to Firestore');
        eq(sentNoKey.loggedAt, UNANCHORED_LOG,
            'an un-anchored movement still carries its loggedAt');

        eq(r.keyChecks.anchoredHasStartedAt, true,
            'the anchored movement keeps its startedAt key');
        eq(r.keyChecks.noKeyHasStartedAt, false,
            'a movement logged without its panel carries no startedAt key');
        eq(r.keyChecks.explicitUndefinedHasStartedAt, false,
            'an explicit `startedAt: undefined` is STRIPPED before the write — ' +
            'Firestore rejects undefined values outright');

        // === 2. loadAll ================================================
        eq(r.readBack.find(e => e.id === 'chest-press').startedAt, ANCHORED_START,
            'startedAt comes back on the next device');
        eq(r.readBack.find(e => e.id === 'chest-press').loggedAt, ANCHORED_LOG,
            'loggedAt comes back on the next device');
        eq(r.readBack.find(e => e.id === 'incline-chest-press').loggedAt, UNANCHORED_LOG,
            'the un-anchored movement round-trips too');

        // === 3. First sign-in import ===================================
        eq(r.importCount, 1, 'the one-time import uploaded the local workout');
        ok(/^users\/import-uid\/workouts\//.test(r.importPath),
            `the import writes under the importing user's tree (${r.importPath})`);
        const imported = r.importExercises.find(e => e.id === 'chest-press');
        eq(imported.startedAt, ANCHORED_START,
            'history logged BEFORE signing in keeps its startedAt on import');
        eq(imported.loggedAt, ANCHORED_LOG,
            'and its loggedAt — this is the path that carries existing sessions up');

        eq(errors, [], 'no console errors');
        console.log('PASS: session timestamps survive save, load and the first-sign-in import.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
