// What this test covers
// ----------------------
// How the Lower/Upper split reaches a device that already has a saved
// exerciseConfig — which is every real device, including the signed-in phone.
// A fresh install gets the split straight from DEFAULT_EXERCISES (test 42);
// this is the other half.
//
// The seed here is deliberately the exact shape of the live config on the day
// of the switch: version 2, the 19 Full Body ids in the July 2026 order, with
// the real user renames applied. So this is the actual migration that runs on
// the user's phone, not a synthetic one.
//
// What must happen on the next load:
//   1. A bumped EXERCISE_CONFIG_VERSION makes migrateExerciseConfig re-run
//      even though 19 of the 20 ids were already there.
//   2. Every exercise picks up a `day` of 'lower' or 'upper'.
//   3. Stairmaster is ADDED — it moves out of the retired CARDIO_EXERCISES
//      constant and into the user-configurable list, on Lower.
//   4. User renames survive by id (they are never overwritten by defaults).
//   5. The reconciled config is persisted with version 3, and a second load
//      is a no-op — otherwise every reload would fight an in-app reorder.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readCards, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

// Read from config.js so a future version bump doesn't rot this assertion.
function currentConfigVersion() {
    const src = fs.readFileSync(path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const m = src.match(/const EXERCISE_CONFIG_VERSION\s*=\s*(\d+)/);
    if (!m) throw new Error('could not find EXERCISE_CONFIG_VERSION in config.js');
    return Number(m[1]);
}

// The live Full Body layout immediately before the split: 19 ids in the July
// 2026 order with their July display names, and no stairmaster. Names are
// seeded explicitly rather than pulled from DEFAULT_EXERCISES because the
// migration preserves whatever the saved config holds — seeding from defaults
// would make the rename assertions vacuous.
const FULL_BODY = [
    ['preacher-curls', 'Preacher Curls'],
    ['overhead-tricep-extensions', 'Overhead Tricep Extensions'],
    ['lateral-raises', 'Lateral Raises'],
    ['reverse-wrist-curls', 'Reverse Wrist Curls'],
    ['cable-wrist-curls', 'Cable Wrist Curls'],
    ['chest-flies', 'Unilateral Chest Flies'],
    ['curls-shoulder-extension', 'Recline Curls'],
    ['frontal-pulldowns', 'My Renamed Pulldowns'],
    ['incline-chest-press', 'Incline Chest Press'],
    ['upper-back-row', 'Transverse Plane Rows'],
    ['kelso-shrugs', 'Kelso Shrugs'],
    ['hammer-row', 'Sagittal Plane Pulldowns'],
    ['tricep-pushdown', 'Tricep Extensions'],
    ['ab-crunch', 'Ab Crunches'],
    ['shoulder-press', 'Shoulder Press'],
    ['calf-raise', 'Calf Raises'],
    ['leg-extensions', 'Hip Adduction'],
    ['leg-curls', 'Back Extensions'],
    ['hip-adduction', 'My Renamed Leg Press'],
];

const EXPECTED_LOWER = [
    'Reverse Wrist Curls',
    'Cable Wrist Curls',
    'Ab Crunches',
    'Calf Raises',
    'Hip Adduction',
    'Back Extensions',
    'My Renamed Leg Press',   // hip-adduction, renamed by the user below
    'Stairmaster',
];

const EXPECTED_UPPER = [
    // The saved config below says "Unilateral Chest Flies" while the current
    // DEFAULT_EXERCISES says "Chest Flies". The saved name has to win — the
    // migration takes order/day/category from defaults but never the name, so
    // changing a default label can't silently rewrite what a device displays.
    'Unilateral Chest Flies',
    'Recline Curls',
    'Overhead Tricep Extensions',
    'Lateral Raises',
    'My Renamed Pulldowns',   // frontal-pulldowns, renamed by the user below
    'Incline Chest Press',
    'Shoulder Press',
    'Transverse Plane Rows',
    'Kelso Shrugs',
    'Sagittal Plane Pulldowns',
    'Tricep Extensions',
    'Preacher Curls',
];

async function readSavedConfig(page) {
    return page.evaluate((ns) => {
        const raw = localStorage.getItem(ns + 'gymExerciseConfig');
        if (!raw) return null;
        const cfg = JSON.parse(raw);
        return {
            version: cfg.version,
            byId: Object.fromEntries((cfg.exercises || []).map(e => [e.id, { day: e.day, name: e.name, order: e.order }])),
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
        await page.evaluate((ns, fullBody) => {
            const exercises = fullBody.map(([id, name], idx) => ({
                id,
                name,
                category: 'Full Body',
                type: 'standard',
                order: idx,
            }));
            // version 2 = the last Full Body revision. The id set is otherwise
            // 19/20 correct, so without the version bump migrateExerciseConfig
            // would still re-run here (stairmaster is new) — but it would NOT
            // on a config that somehow already had it. The version is what
            // makes this deterministic.
            localStorage.setItem(ns + 'gymExerciseConfig', JSON.stringify({ exercises, version: 2 }));
            localStorage.setItem(ns + 'migratedToFullBody2', 'true');
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS, FULL_BODY);

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // 1 + 3 + 4. The split applied, stairmaster arrived, renames survived.
        ok(await selectDayType(page, 'lower'), 'Lower toggle present');
        eq((await readCards(page)).map(c => c.name), EXPECTED_LOWER,
            'saved config is split onto Lower in canonical order, renames preserved');

        ok(await selectDayType(page, 'upper'), 'Upper toggle present');
        eq((await readCards(page)).map(c => c.name), EXPECTED_UPPER,
            'saved config is split onto Upper in canonical order, renames preserved');

        // 2 + 5. What actually got persisted.
        const saved = await readSavedConfig(page);
        eq(saved.version, currentConfigVersion(),
            'reconciled config is persisted with the current EXERCISE_CONFIG_VERSION');
        eq(saved.ids.length, 20, 'stairmaster brings the saved config to 20 exercises');
        ok(saved.byId['stairmaster'], 'stairmaster was added to the saved config');
        eq(saved.byId['stairmaster'].day, 'lower', 'stairmaster lives on Lower');
        eq(saved.byId['frontal-pulldowns'].name, 'My Renamed Pulldowns',
            'rename survives the migration in storage, not just on screen');
        eq(saved.byId['chest-flies'].name, 'Unilateral Chest Flies',
            'a changed DEFAULT_EXERCISES label does not overwrite the saved name');
        eq(saved.byId['hip-adduction'].day, 'lower', 'Leg Press is a Lower movement');
        eq(saved.byId['chest-flies'].day, 'upper', 'Chest Flies is an Upper movement');

        // Every exercise is assigned to exactly one of the two days.
        const days = Object.values(saved.byId).map(e => e.day);
        eq(days.filter(d => d === 'lower').length, 8, '8 exercises on Lower');
        eq(days.filter(d => d === 'upper').length, 12, '12 exercises on Upper');
        eq(days.filter(d => d !== 'lower' && d !== 'upper'), [],
            'no exercise is left without a day');

        // `order` must stay a dense 0..19 run, since moveExercise and the
        // load-time sort both index off it.
        eq(saved.orders, Array.from({ length: 20 }, (_, i) => i),
            'order is a dense 0..19 sequence across both days');

        // 5. Second load changes nothing.
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        const secondLoad = await readSavedConfig(page);
        eq(secondLoad, saved, 'a second load is a no-op — the migration is idempotent');

        await selectDayType(page, 'lower');
        eq((await readCards(page)).map(c => c.name), EXPECTED_LOWER,
            'Lower is stable across the reload');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: version 3 splits an existing Full Body config into Lower/Upper, idempotently.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
