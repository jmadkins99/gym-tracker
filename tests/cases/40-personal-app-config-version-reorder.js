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
// This case stays scoped to the Upper day and to the version mechanism itself.
// Test 43 covers the Aug 2026 Lower/Upper split as a whole — both days, the
// `day` assignments, and Stairmaster arriving as a new id.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readCards, selectDayType } = require('../lib/browser');
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
const OLD_ORDER_IDS = [
    'curls-shoulder-extension', 'overhead-tricep-extensions', 'lateral-raises',
    'reverse-wrist-curls', 'cable-wrist-curls', 'preacher-curls',
    'tricep-pushdown', 'chest-flies', 'incline-chest-press', 'hammer-row',
    'frontal-pulldowns', 'upper-back-row', 'kelso-shrugs', 'ab-crunch',
    'shoulder-press', 'calf-raise', 'leg-extensions', 'leg-curls',
    'hip-adduction',
];

// The canonical Upper day, which is where the renamed exercise below lands.
const EXPECTED_NEW_ORDER = [
    'Chest Flies',
    'Chest Press',            // added Aug 2026; arrives via the migration
    'Recline Curls',
    'Overhead Tricep Extensions',
    'Incline Chest Press',
    'Lateral Raises',
    'Shoulder Press',
    'My Renamed Pulldowns',   // frontal-pulldowns, renamed by the user below
    'Transverse Plane Rows',
    'Kelso Shrugs',
    'Sagittal Plane Pulldowns',
    'Tricep Extensions',
    'Preacher Curls',
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
        await selectDayType(page, 'upper');

        const names = (await readCards(page)).map(c => c.name);
        eq(names, EXPECTED_NEW_ORDER,
            'stale config is reordered to the canonical layout, renames preserved');

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
        await page.click('.settings-btn');
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('.modal-btn'))
                .find(b => b.textContent.includes('Manage Exercises'));
            btn.click();
        });
        // Move "Tricep Extensions" (Upper index 11) up one, above "Sagittal Plane Pulldowns".
        const moved = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.modal > div > div'));
            const row = rows.find(r => r.textContent.trim().startsWith('Tricep Extensions'));
            const up = Array.from(row.querySelectorAll('button'))
                .find(b => b.textContent.trim() === '↑');
            if (!up) return false;
            up.click();
            return true;
        });
        ok(moved, 'clicked the up arrow on Tricep Extensions in Manage Exercises');

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'upper');

        const afterReorder = (await readCards(page)).map(c => c.name);
        const expectedAfter = [...EXPECTED_NEW_ORDER];
        expectedAfter.splice(10, 0, expectedAfter.splice(11, 1)[0]); // Tricep Extensions up one
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
