// What this test covers
// ----------------------
// That EXERCISE_CONFIG_VERSION 13 -> 14 is what actually delivers the
// Anterior/Posterior reassignment to a device that already has a saved config.
//
// This is the one case in the suite that pins the version bump itself, and it
// exists because nothing else can. migrateExerciseConfig short-circuits when
// BOTH the version matches AND the saved id set equals the default id set:
//
//     if (config.version === EXERCISE_CONFIG_VERSION && setsEqual(savedIds, defaultIds))
//         return null;
//
// The Anterior/Posterior switch moved 21 exercises between days and reordered
// them, but added and removed NOTHING. So the id-set half of that guard is
// true, and the version is the entire trigger. Revert the bump and every
// existing device — including the signed-in phone — keeps rendering Upper and
// Lower forever, with no error and nothing on screen to suggest anything is
// wrong.
//
// Test 43 cannot catch that: it seeds a 19-id Full Body config, so its id set
// differs from defaults and its migration re-runs on the id-set check alone.
// It passes with the bump reverted. This one does not.
//
// The seed below is therefore the exact live v13 shape: all 21 ids, the v13
// Upper/Lower day assignment, the v13 order, version 13, plus one user rename
// so the reassignment cannot quietly wipe display names on its way through.
//
// To verify this test is real: set EXERCISE_CONFIG_VERSION back to 13 in
// js/config.js. This case fails on the first day assertion; tests 42 and 43
// both stay green. That asymmetry is the whole point of the case.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readCards, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

function currentConfigVersion() {
    const src = fs.readFileSync(path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const m = src.match(/const EXERCISE_CONFIG_VERSION\s*=\s*(\d+)/);
    if (!m) throw new Error('could not find EXERCISE_CONFIG_VERSION in config.js');
    return Number(m[1]);
}

// The v13 layout, exactly as it shipped: 13 Upper then 8 Lower, order 0..20.
// Same 21 ids as v14 — that is the point.
const V13_LAYOUT = [
    ['chest-flies', 'Chest Flies', 'upper'],
    ['incline-chest-press', 'Incline Chest Press', 'upper'],
    ['curls-shoulder-extension', 'Recline Curls', 'upper'],
    ['overhead-tricep-extensions', 'Overhead Tricep Extensions', 'upper'],
    ['chest-press', 'Chest Press', 'upper'],
    ['lateral-raises', 'Lateral Raises', 'upper'],
    ['shoulder-press', 'Shoulder Press', 'upper'],
    // Renamed by the user. Lands on Posterior in v14, so this also proves a
    // rename survives a move across days.
    ['frontal-pulldowns', 'My Renamed Pulldowns', 'upper'],
    ['upper-back-row', 'Transverse Plane Rows', 'upper'],
    ['kelso-shrugs', 'Kelso Shrugs', 'upper'],
    ['hammer-row', 'Sagittal Plane Pulldowns', 'upper'],
    ['tricep-pushdown', 'Tricep Extensions', 'upper'],
    ['preacher-curls', 'Preacher Curls', 'upper'],
    ['leg-curls', 'Back Extensions', 'lower'],
    ['reverse-wrist-curls', 'Reverse Wrist Curls', 'lower'],
    ['cable-wrist-curls', 'Cable Wrist Curls', 'lower'],
    ['ab-crunch', 'Ab Crunches', 'lower'],
    ['actual-leg-extensions', 'Leg Extensions', 'lower'],
    ['leg-extensions', 'Hip Adduction', 'lower'],
    ['calf-raise', 'Calf Raises', 'lower'],
    ['hip-adduction', 'Leg Press', 'lower'],
];

// Where each id must end up after the migration.
const EXPECTED_DAY_BY_ID = {
    'chest-press': 'anterior',
    'incline-chest-press': 'anterior',
    'chest-flies': 'anterior',
    'shoulder-press': 'anterior',
    'lateral-raises': 'anterior',
    'overhead-tricep-extensions': 'anterior',
    'tricep-pushdown': 'anterior',
    'reverse-wrist-curls': 'anterior',
    'cable-wrist-curls': 'anterior',
    'ab-crunch': 'anterior',
    'actual-leg-extensions': 'anterior',
    'hip-adduction': 'anterior',
    'curls-shoulder-extension': 'posterior',
    'frontal-pulldowns': 'posterior',
    'hammer-row': 'posterior',
    'upper-back-row': 'posterior',
    'kelso-shrugs': 'posterior',
    'preacher-curls': 'posterior',
    'leg-curls': 'posterior',
    'leg-extensions': 'posterior',
    'calf-raise': 'posterior',
};

async function readSavedConfig(page) {
    return page.evaluate((ns) => {
        const raw = localStorage.getItem(ns + 'gymExerciseConfig');
        if (!raw) return null;
        const cfg = JSON.parse(raw);
        return {
            version: cfg.version,
            dayById: Object.fromEntries((cfg.exercises || []).map(e => [e.id, e.day])),
            nameById: Object.fromEntries((cfg.exercises || []).map(e => [e.id, e.name])),
            ids: (cfg.exercises || []).map(e => e.id),
            orders: (cfg.exercises || []).map(e => e.order),
        };
    }, NS);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });

        await page.evaluate((ns, layout) => {
            const exercises = layout.map(([id, name, day], i) => ({
                id, name, day,
                category: day === 'upper' ? 'Upper' : 'Lower',
                type: 'standard',
                order: i,
            }));
            localStorage.setItem(ns + 'gymExerciseConfig',
                JSON.stringify({ exercises, version: 13 }));
            // Without this sentinel App.jsx's one-shot Full Body cleanup fires
            // on load and deletes gymExerciseConfig before the migration ever
            // sees it — seedPersonalApp clears the sentinel, so it has to be
            // put back. A real v13 device always has it.
            localStorage.setItem(ns + 'migratedToFullBody2', 'true');
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS, V13_LAYOUT);

        // Sanity-check the premise: the seed must have the same id SET as
        // defaults, or this case is not testing the version bump at all.
        const configSrc = fs.readFileSync(path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
        const defaultIds = [...configSrc.matchAll(/\{\s*id:\s*'([^']+)'/g)].map(m => m[1]);
        eq([...new Set(V13_LAYOUT.map(([id]) => id))].sort(), [...new Set(defaultIds)].sort(),
            'the seeded v13 config has exactly the default id set, so only the version can trigger the migration');

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        const saved = await readSavedConfig(page);

        // 1. The migration ran and stamped the new version.
        eq(saved.version, currentConfigVersion(),
            'the reconciled config is persisted with the current EXERCISE_CONFIG_VERSION');
        // Deliberately not `eq(saved.version, 14)`. What this case is about is
        // that the v13 seed was stale and the bump is what moved it — pinning
        // the exact number just makes this line rot on the next bump, which is
        // how it broke once already.
        ok(saved.version > 13, 'that version is past 13, so the v13 layout really was stale');

        // 2. Every one of the 21 ids moved to its v14 day.
        eq(saved.dayById, EXPECTED_DAY_BY_ID,
            'all 21 ids are reassigned to their Anterior/Posterior day');

        // 3. Nothing was added or dropped on the way through.
        eq(saved.ids.length, 21, 'the saved config still holds exactly 21 ids');

        // 4. The user's rename survived a move across days.
        eq(saved.nameById['frontal-pulldowns'], 'My Renamed Pulldowns',
            'a user rename survives the reassignment, including across a day change');

        // 5. order is re-densified 0..20 in the new layout.
        eq(saved.orders, Array.from({ length: 21 }, (_, i) => i),
            'order is a dense 0..20 run in the new layout');

        // 6. It reaches the screen, not just storage.
        ok(await selectDayType(page, 'posterior'), 'Posterior toggle present after the migration');
        const posterior = (await readCards(page)).map(c => c.name);
        eq(posterior.length, 9, 'Posterior renders 9 cards');
        ok(posterior.includes('My Renamed Pulldowns'),
            'the renamed pulldowns card renders on its new day');

        // 7. A second load must not fight the migration.
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        eq(await readSavedConfig(page), saved,
            'a second load is a no-op — the migration is idempotent');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: the v14 bump carries the day reassignment to a saved v13 config.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
