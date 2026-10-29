// What this test covers
// ----------------------
// The seed's ids were translated to v25's when every movement took a new id
// (Oct 2026), keeping it what this header says it is: a constructed config
// with today's id set.
//
// What a device that was running Anterior / Posterior becomes when it loads
// the Full Body build — the upgrade half of test 123.
//
// The switch ships with NO migration of its own. History is looked up by
// exercise id, never by day, and `day` / `category` / `order` are code-owned,
// so an EXERCISE_CONFIG_VERSION bump through the existing
// migrateExerciseConfig is the whole delivery mechanism. This case pins that
// claim end to end:
//
//   1. The saved v21 config is rebuilt: every id on 'full-body', in the new
//      order, version stamped past 21.
//   2. The user's rename and load-type choice survive the rebuild.
//   3. Nothing wipes the saved config first. The seed deliberately does NOT
//      plant the old `migratedToFullBody2` sentinel — the one-shot wipe that
//      used to key off it is gone. If it came back, the rename in (2) would be
//      lost, because a wiped config reseeds from defaults.
//   4. Last session's weight carries over onto the Full Body cards, from both
//      former days.
//   5. The past sessions keep their own labels and the rows they were
//      actually performed with — history is never migrated.
//   6. A second load is a no-op.
//
// The seed is a CONSTRUCTED v21 config with today's id set, so the id-set
// half of migrateExerciseConfig's guard is true and only the version can
// trigger the rebuild — the same trick as test 54.
//
// To verify this test is real: set EXERCISE_CONFIG_VERSION back to 21. The
// day assertion fails and the deck still shows a toggle.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { readDeckNames, readDeckCard } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

// The v21 layout: 10 Anterior then 9 Posterior, order 0..18.
const V21_LAYOUT = [
    ['triceps-elbow-extension', 'Tricep Extensions', 'anterior'],
    ['pecs-transverse-shoulder-adduction-with-elbow-extension', 'Chest Press', 'anterior'],
    ['pecs-shoulder-flexion', 'Incline Chest Press', 'anterior'],
    ['pecs-transverse-shoulder-adduction', 'Chest Flies', 'anterior'],
    ['triceps-elbow-extension-with-shoulder-flexion', 'Overhead Tricep Extensions', 'anterior'],
    ['abs-spinal-flexion', 'Ab Crunches', 'anterior'],
    ['delts-shoulder-abduction-stop-at-90-degrees', 'Lateral Raises', 'anterior'],
    ['delts-shoulder-abduction-above-90-degrees', 'Shoulder Press', 'anterior'],
    ['quads-knee-extension-during-hip-flexion', 'Leg Press', 'anterior'],
    ['quads-knee-extension', 'Leg Extensions', 'anterior'],
    ['biceps-elbow-flexion-with-shoulder-extension', 'Recline Curls', 'posterior'],
    ['biceps-elbow-flexion-with-shoulder-flexion', 'Shoulder Flexion Curls', 'posterior'],
    // Still on the old name. The rename to Pullovers reached fresh installs
    // only, so a real device may well carry this.
    ['lats-sagittal-shoulder-extension', 'Sagittal Plane Pulldowns', 'posterior'],
    ['traps-scapular-retraction', 'Kelso Shrugs', 'posterior'],
    ['delts-transverse-shoulder-abduction-with-elbow-flexion', 'Transverse Plane Rows', 'posterior'],
    // Renamed by the user.
    ['lats-frontal-shoulder-adduction', 'My Renamed Pulldowns', 'posterior'],
    ['erectors-spinal-extension', 'Back Extensions', 'posterior'],
    ['adductors-transverse-hip-adduction', 'Hip Adduction', 'posterior'],
    ['calves-ankle-extension', 'Calf Raises', 'posterior'],
];

// The user switched Kelso Shrugs to a pin stack in Settings.
// Kelso seeds 'pin' since v25, so the user's choice has to be something else.
const LOAD_TYPE_OVERRIDE = { id: 'traps-scapular-retraction', loadType: 'plate-one-sided' };

const EXPECTED_ORDER = [
    'pecs-transverse-shoulder-adduction', 'pecs-transverse-shoulder-adduction-with-elbow-extension', 'pecs-shoulder-flexion', 'biceps-elbow-flexion-with-shoulder-extension',
    'biceps-elbow-flexion-with-shoulder-flexion', 'triceps-elbow-extension-with-shoulder-flexion', 'abs-spinal-flexion', 'lats-sagittal-shoulder-extension',
    'delts-shoulder-abduction-stop-at-90-degrees', 'lats-frontal-shoulder-adduction', 'triceps-elbow-extension', 'traps-scapular-retraction',
    'delts-transverse-shoulder-abduction-with-elbow-flexion', 'delts-shoulder-abduction-above-90-degrees', 'erectors-spinal-extension', 'quads-knee-extension-during-hip-flexion', 'adductors-transverse-hip-adduction',
    'calves-ankle-extension', 'quads-knee-extension',
];

const HISTORY = [
    workoutEntry({
        date: '2026-09-19T15:00:00.000Z', day: 'anterior',
        exercises: [
            { id: 'pecs-transverse-shoulder-adduction-with-elbow-extension', name: 'Chest Press', weight: 150, reps: 8 },
            { id: 'delts-shoulder-abduction-stop-at-90-degrees', name: 'Lateral Raises', weight: 45, reps: 7 },
        ],
    }),
    workoutEntry({
        date: '2026-09-20T15:00:00.000Z', day: 'posterior',
        exercises: [
            { id: 'lats-frontal-shoulder-adduction', name: 'Frontal Plane Pulldowns', weight: 160, reps: 7 },
            { id: 'calves-ankle-extension', name: 'Calf Raises', weight: 205, reps: 8 },
        ],
    }),
];

function currentConfigVersion() {
    const src = fs.readFileSync(path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const m = src.match(/const EXERCISE_CONFIG_VERSION\s*=\s*(\d+)/);
    if (!m) throw new Error('could not find EXERCISE_CONFIG_VERSION in config.js');
    return Number(m[1]);
}

async function readSavedConfig(page) {
    return page.evaluate((ns) => {
        const raw = localStorage.getItem(ns + 'gymExerciseConfig');
        return raw ? JSON.parse(raw) : null;
    }, NS);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: HISTORY });

        await page.evaluate((ns, layout, override) => {
            const exercises = layout.map(([id, name, day], i) => ({
                id, name, day,
                category: day === 'anterior' ? 'Anterior' : 'Posterior',
                type: 'standard',
                order: i,
                ...(id === override.id ? { loadType: override.loadType } : {}),
            }));
            localStorage.setItem(ns + 'gymExerciseConfig', JSON.stringify({ exercises, version: 21 }));
            localStorage.removeItem(ns + 'migratedToFullBody2');
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS, V21_LAYOUT, LOAD_TYPE_OVERRIDE);

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // 1. Rebuilt onto one day, in the new order.
        const saved = await readSavedConfig(page);
        ok(saved, 'the saved config still exists after load');
        eq(saved.version, currentConfigVersion(), 'stamped with the current version');
        ok(saved.version > 21, 'past 21, so the Anterior/Posterior layout really was stale');
        eq(saved.exercises.map(e => e.id), EXPECTED_ORDER, 'ids are in the Full Body order');
        eq([...new Set(saved.exercises.map(e => e.day))], ['full-body'], "every id is on 'full-body'");
        eq([...new Set(saved.exercises.map(e => e.category))], ['Full Body'], 'every category is Full Body');
        eq(saved.exercises.map(e => e.order), Array.from({ length: 19 }, (_, i) => i), 'order is dense 0..18');

        // 2 + 3. User-owned fields survived, which also proves no wipe ran.
        const byId = Object.fromEntries(saved.exercises.map(e => [e.id, e]));
        eq(byId['lats-frontal-shoulder-adduction'].name, 'My Renamed Pulldowns', 'the rename survives (no config wipe)');
        eq(byId['lats-sagittal-shoulder-extension'].name, 'Sagittal Plane Pulldowns', "the device's own name for lats-sagittal-shoulder-extension survives");
        eq(byId['traps-scapular-retraction'].loadType, 'plate-one-sided', 'the load-type choice survives');

        // It reaches the screen: one day, no toggle.
        const toggles = await page.evaluate(() => document.querySelectorAll('[data-day-type]').length);
        eq(toggles, 0, 'no day toggle after the upgrade');
        const names = await readDeckNames(page);
        eq(names.length, 19, 'the deck holds all 19 movements');
        eq(names[EXPECTED_ORDER.indexOf('lats-frontal-shoulder-adduction')], 'My Renamed Pulldowns', 'the renamed card sits at its Full Body position');

        // 4. Last session's weight, from both former days.
        contains((await readDeckCard(page, 'Chest Press')).last, '150', 'Chest Press keeps its Anterior last weight');
        contains((await readDeckCard(page, 'Lateral Raises')).last, '45', 'Lateral Raises keeps its Anterior last weight');
        contains((await readDeckCard(page, 'My Renamed Pulldowns')).last, '160', 'Pulldowns keep their Posterior last weight');
        contains((await readDeckCard(page, 'Calf Raises')).last, '205', 'Calf Raises keep their Posterior last weight');

        // 5. History is untouched and still renders as it was performed.
        const past = await page.evaluate((ns) => {
            const hist = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory'));
            const cfg = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig'));
            return hist.map(w => ({
                day: w.day,
                label: getWorkoutDayLabel(w),
                rows: getWorkoutExerciseList(w, cfg.exercises).map(e => e.name),
            }));
        }, NS);
        eq(past, [
            { day: 'anterior', label: 'Anterior', rows: ['Chest Press', 'Lateral Raises'] },
            { day: 'posterior', label: 'Posterior', rows: ['My Renamed Pulldowns', 'Calf Raises'] },
        ], 'past sessions keep their day, label and performed rows (names still follow renames)');

        // 6. Idempotent.
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        eq(await readSavedConfig(page), saved, 'a second load is a no-op');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: an Anterior/Posterior device lands on Full Body with its history intact.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
