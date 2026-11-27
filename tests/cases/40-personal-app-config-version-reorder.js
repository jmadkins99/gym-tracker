// What this test covers
// ----------------------
// EXERCISE_CONFIG_VERSION — how a code-side reorder reaches a device that
// already has a saved exerciseConfig.
//
// migrateExerciseConfig used to short-circuit whenever the saved id set
// matched DEFAULT_EXERCISES, which meant a *pure* reorder (same 19 ids, new
// order) silently never reached anyone. Every historical reorder happened to
// also add or drop an exercise, so the gap went unnoticed. The version field
// closes it. Two directions matter, and they pull against each other:
//
//   1. Stale config (no version, old order) -> reordered to the canonical
//      DEFAULT_EXERCISES layout, with the user's renames preserved by id.
//   2. Current config (version stamped, custom order) -> left alone, so an
//      in-app reorder via Settings stays put across reloads.
//
// Break either and the other looks fine, so both are asserted here.
//
// This case stays scoped to the version mechanism itself. Test 43 covers a
// layout change as a whole — the `day` assignments and retired ids being
// dropped — and tests 54 and 124 cover the case this one cannot: a saved
// config whose id set already matches defaults, where the version bump is the
// only thing that can trigger a migration.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType, tap, waitFor } = require('../lib/browser');
const { readDeckNames } = require('../lib/deck');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

// Read the expected version out of config.js rather than hardcoding it. What
// matters here is that the app stamps *whatever the current version is*, not
// which number that happens to be — and a hardcoded copy silently rots on the
// next bump, which is exactly how this test broke once already.
function currentConfigVersion() {
    const src = fs.readFileSync(path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const m = src.match(/const EXERCISE_CONFIG_VERSION\s*=\s*(\d+)/);
    if (!m) throw new Error('could not find EXERCISE_CONFIG_VERSION in config.js');
    return Number(m[1]);
}

// The order shipped before the July 2026 reorder.
// The ids were translated to v25's when every movement took a new id (Oct
// 2026): this case is about the ORDER and the version stamp, and on the old
// ids it would only re-test the retirement case 135 already covers. The wrist
// pair is still retired and still has to drop.
const OLD_ORDER_IDS = [
    'biceps-elbow-flexion-with-shoulder-extension',
    'triceps-elbow-extension-with-shoulder-flexion',
    'delts-shoulder-abduction-stop-at-90-degrees',
    'reverse-wrist-curls',
    'cable-wrist-curls',
    'biceps-elbow-flexion-with-shoulder-flexion',
    'triceps-elbow-extension',
    'pecs-transverse-shoulder-adduction',
    'pecs-shoulder-flexion',
    'lats-sagittal-shoulder-extension',
    'lats-frontal-shoulder-adduction',
    'delts-transverse-shoulder-abduction-with-elbow-flexion',
    'traps-scapular-retraction',
    'abs-spinal-flexion',
    'delts-shoulder-abduction-above-90-degrees',
    'calves-ankle-extension',
    'adductors-transverse-hip-adduction',
    'erectors-spinal-extension',
    'quads-knee-extension-during-hip-flexion',
];

// The canonical v28 days, Anterior then Posterior. Names are the
// fresh-install ones because the seed below builds each entry from
// DEFAULT_EXERCISES — except Chest Flies, renamed by the user.
const EXPECTED_ANTERIOR = [
    'My Renamed Flies',       // pecs-transverse-shoulder-adduction, renamed by the user below
    'Low to High Flies',
    'High to Low Flies',      // v28, arrives via the migration
    'Chest Press',            // not in the seed; arrives via the migration
    'Tricep Extensions',
    'Lateral Raises',
    'Overhead Tricep Extensions',
    'Lu Raises',
    'JM Press',               // v26, arrives via the migration
    'Leg Extensions',         // not in the seed; arrives via the migration
    'Squats',
];
const EXPECTED_POSTERIOR = [
    'Recline Curls',
    'Preacher Curls',
    'Supinations',            // v26, arrives via the migration
    'Sagittal Pulldowns',
    'Frontal Pulldowns',
    'Ab Crunches',
    'Kelso Shrugs',
    'Reverse Wrist Curls',    // v26, a new id: NOT the seed's retired reverse-wrist-curls
    'Wrist Curls',            // v26, arrives via the migration
    'Calf Raises',
    'Stiff Legged Deadlift',
];
// The seed's Transverse Rows and Hip Adduction are retired in v28 and drop,
// like the wrist pair.

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // --- 1. Stale config (no version, old order) gets reordered ---------
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate((ns, oldIds) => {
            const byId = new Map(DEFAULT_EXERCISES.map(e => [e.id, e]));
            const exercises = oldIds.map((id, idx) => {
                const base = { ...byId.get(id), order: idx };
                return id === 'pecs-transverse-shoulder-adduction'
                    ? { ...base, name: 'My Renamed Flies' }
                    : base;
            });
            // No `version` key: this is what every pre-July-2026 config looks like.
            localStorage.setItem(ns + 'gymExerciseConfig', JSON.stringify({ exercises }));
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS, OLD_ORDER_IDS);

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior-2');
        eq(await readDeckNames(page), EXPECTED_ANTERIOR,
            'stale config is reordered to the canonical Anterior layout, renames preserved');
        await selectDayType(page, 'posterior-2');
        eq(await readDeckNames(page), EXPECTED_POSTERIOR,
            'and to the canonical Posterior layout');

        const stamped = await page.evaluate((ns) => {
            const raw = localStorage.getItem(ns + 'gymExerciseConfig');
            return raw ? JSON.parse(raw).version : null;
        }, NS);
        eq(stamped, currentConfigVersion(),
            'reconciled config is persisted with the current EXERCISE_CONFIG_VERSION');

        // --- 2. An in-app reorder survives a reload -------------------------
        // Driven through the real Settings UI rather than a seeded config, so
        // this also covers App.jsx stamping EXERCISE_CONFIG_VERSION on save.
        // Drop that stamp and the migration reads the config as stale and
        // resets the user's arrangement on the next load.
        await tap(page, '.settings-btn');
        await tap(page, '.modal-btn', { text: /Manage Exercises/ });
        await waitFor(page, 'the Manage Exercises rows to render',
            () => document.querySelectorAll('.exercise-row').length > 0);
        // Move the last Posterior row up one. The probe has to be a row with
        // something above it on its own day (the arrows stop at a day's
        // boundary), and the tail of a day is the stable place to find one.
        // It was Hip Adduction at the end of Full Body until v28 (Nov 2026).
        // Match on the name element, not the row's textContent: the row also
        // holds a <select> whose textContent is every option label.
        const rowIndex = () => page.evaluate(() => Array.from(document.querySelectorAll('.exercise-row'))
            .findIndex(r => r.querySelector('.exercise-row-name')?.textContent.trim() === 'Stiff Legged Deadlift'));
        const before = await rowIndex();
        const up = (await page.evaluateHandle((i) => Array.from(document.querySelectorAll('.exercise-row')[i]
            .querySelectorAll('button')).find(b => b.textContent.trim() === '↑') || null, before)).asElement();
        ok(up, 'Stiff Legged Deadlift has an up arrow in Manage Exercises');
        await tap(page, up);
        await waitFor(page, 'Stiff Legged Deadlift to move up a row', (i) =>
            Array.from(document.querySelectorAll('.exercise-row')).findIndex(r =>
                r.querySelector('.exercise-row-name')?.textContent.trim() === 'Stiff Legged Deadlift') === i - 1, before);

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'posterior-2');

        const afterReorder = await readDeckNames(page);
        const expectedAfter = [...EXPECTED_POSTERIOR];
        const last = expectedAfter.length - 1;
        expectedAfter.splice(last - 1, 0, expectedAfter.splice(last, 1)[0]); // the last row up one
        eq(afterReorder, expectedAfter,
            'an in-app reorder survives reload (App.jsx stamps the version on save)');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: config version pushes code-side reorders without clobbering in-app ones.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
