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

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readCards, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

// The order shipped before the July 2026 reorder.
const OLD_ORDER_IDS = [
    'curls-shoulder-extension', 'overhead-tricep-extensions', 'lateral-raises',
    'reverse-wrist-curls', 'cable-wrist-curls', 'preacher-curls',
    'tricep-pushdown', 'chest-flies', 'incline-chest-press', 'hammer-row',
    'frontal-pulldowns', 'upper-back-row', 'kelso-shrugs', 'ab-crunch',
    'shoulder-press', 'calf-raise', 'leg-extensions', 'leg-curls',
    'hip-adduction',
];

const EXPECTED_NEW_ORDER = [
    'Preacher Curls',
    'Overhead Tricep Extensions',
    'Lateral Raises',
    'Reverse Wrist Curls',
    'Cable Wrist Curls',
    'Unilateral Chest Flies',
    'Recline Curls',
    'My Renamed Pulldowns',   // frontal-pulldowns, renamed by the user below
    'Incline Chest Press',
    'Transverse Plane Rows',
    'Kelso Shrugs',
    'Sagittal Plane Pulldowns',
    'Tricep Extensions',
    'Ab Crunches',
    'Shoulder Press',
    'Calf Raises',
    'Hip Adduction',
    'Back Extensions',
    'Leg Press',
];

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
                return id === 'frontal-pulldowns'
                    ? { ...base, name: 'My Renamed Pulldowns' }
                    : base;
            });
            // No `version` key: this is what every pre-July-2026 config looks like.
            localStorage.setItem(ns + 'gymExerciseConfig', JSON.stringify({ exercises }));
            localStorage.setItem(ns + 'migratedToFullBody2', 'true');
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS, OLD_ORDER_IDS);

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'fullbody');

        const names = (await readCards(page)).map(c => c.name);
        eq(names, EXPECTED_NEW_ORDER,
            'stale config is reordered to the canonical layout, renames preserved');

        const stamped = await page.evaluate((ns) => {
            const raw = localStorage.getItem(ns + 'gymExerciseConfig');
            return raw ? JSON.parse(raw).version : null;
        }, NS);
        eq(stamped, 2, 'reconciled config is persisted with the current version');

        // --- 2. An in-app reorder survives a reload -------------------------
        // Driven through the real Settings UI rather than a seeded config, so
        // this also covers App.jsx stamping EXERCISE_CONFIG_VERSION on save.
        // Drop that stamp and the migration reads the config as stale and
        // resets the user's arrangement on the next load.
        await page.click('.settings-btn');
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('.modal-btn'))
                .find(b => b.textContent.includes('Manage Exercises'));
            btn.click();
        });
        // Move "Ab Crunches" (index 13) up one slot, above "Tricep Extensions".
        const moved = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.modal > div > div'));
            const row = rows.find(r => r.textContent.trim().startsWith('Ab Crunches'));
            const up = Array.from(row.querySelectorAll('button'))
                .find(b => b.textContent.trim() === '↑');
            if (!up) return false;
            up.click();
            return true;
        });
        ok(moved, 'clicked the up arrow on Ab Crunches in Manage Exercises');

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'fullbody');

        const afterReorder = (await readCards(page)).map(c => c.name);
        const expectedAfter = [...EXPECTED_NEW_ORDER];
        expectedAfter.splice(12, 0, expectedAfter.splice(13, 1)[0]); // Ab Crunches up one
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
