// What this test covers
// ----------------------
// Jessi's phone taking revision 13 of her program: the Sep 2026 catch-up to
// the personal app's config version 20. A device already on revision 12 is
// the real case — she is signed in, so migrateJessiSplit's re-run branch is
// the only thing that can reach her.
//
// Revision 13 is the first bump that does more than reorder. It also:
//
//   1. Renames two movements, keeping their ids so history follows:
//        Preacher Curls           -> Shoulder Flexion Curls
//        Sagittal Plane Pulldowns -> Sagittal Plane Pullovers
//   2. Retires the wrist pair. Unlike anything the split has done before,
//      they are removed rather than kept as client extras, and their logged
//      sessions stay in history untouched.
//   3. Sets how four machines are loaded, because the name guesses are wrong
//      for this gym: Shoulder Flexion Curls, Sagittal Plane Pullovers and
//      Back Extensions are pin stacks, Frontal Plane Pulldowns is one-sided
//      plates. Sagittal is seeded with an explicit one-sided choice here, so
//      this proves the revision overrides a saved value for these four.
//   4. Gives Leg Press and Back Extensions a 5 lb PR step.
//
// And, because a revision is a one-time push rather than a standing rule:
//
//   5. A load type the client set on any OTHER movement survives it.
//   6. A client-added movement survives it, at the bottom of Posterior.
//   7. The schedule is left alone.
//   8. Once on 13, the client's own later changes to those same fields stick.
//      A migration that re-applied its load types on every load would quietly
//      undo the Settings dropdown.
//
// To verify this test is real: drop the rename step from migrateJessiSplit.
// The order assertion fails with "Preacher Curls" still in it, and Shoulder
// Flexion Curls is re-added as a second card under the stable id.

const { start } = require('../lib/server');
const { launch, waitForApp, attachConsole } = require('../lib/browser');
const { seedPublicApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { PUBLIC_APP_ROOT, publicAppSource } = require('../lib/paths');
const { selectDeckDay, readDeckCard } = require('../lib/deck');

const NS = 'gym-local:';

function currentSplitRevision() {
    const m = publicAppSource().match(/const JESSI_SPLIT_REVISION\s*=\s*(\d+)/);
    if (!m) throw new Error('could not find JESSI_SPLIT_REVISION in the public app source');
    return Number(m[1]);
}

function daysAgo(n) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.toISOString();
}

// Revision 12 exactly as case 33 used to pin it, with an id per movement.
const REV12_ANTERIOR = [
    ['Chest Press', 'chest-press'],
    ['Incline Chest Press', 'j-incline'],
    ['Chest Flies', 'j-flies'],
    ['Shoulder Press', 'j-shoulder'],
    ['Lateral Raises', 'j-lateral'],
    ['Overhead Tricep Extensions', 'j-oh-tricep'],
    ['Ab Crunches', 'j-abs'],
    ['Leg Extensions', 'actual-leg-extensions'],
    ['Tricep Extensions', 'j-tricep'],
    ['Leg Press', 'j-legpress'],
];
const REV12_POSTERIOR = [
    ['Recline Curls', 'j-recline'],
    ['Frontal Plane Pulldowns', 'j-frontal'],
    ['Sagittal Plane Pulldowns', 'j-sagittal'],
    ['Transverse Plane Rows', 'j-transverse'],
    ['Kelso Shrugs', 'j-kelso'],
    ['Preacher Curls', 'actual-preacher-curls'],
    ['Reverse Wrist Curls', 'j-rev-wrist'],
    ['Cable Wrist Curls', 'j-cable-wrist'],
    ['Back Extensions', 'j-backext'],
    ['Hip Adduction', 'j-hipadd'],
    ['Calf Raises', 'j-calf'],
    // Added by the client, not part of any preset.
    ['Farmer Carries', 'client-added-1'],
];

const EXPECTED_ANTERIOR = [
    ['Tricep Extensions', 'j-tricep'],
    ['Chest Press', 'chest-press'],
    ['Incline Chest Press', 'j-incline'],
    ['Chest Flies', 'j-flies'],
    ['Shoulder Press', 'j-shoulder'],
    ['Lateral Raises', 'j-lateral'],
    ['Overhead Tricep Extensions', 'j-oh-tricep'],
    ['Ab Crunches', 'j-abs'],
    ['Leg Press', 'j-legpress'],
    ['Leg Extensions', 'actual-leg-extensions'],
];
const EXPECTED_POSTERIOR = [
    ['Recline Curls', 'j-recline'],
    ['Shoulder Flexion Curls', 'actual-preacher-curls'],
    ['Sagittal Plane Pullovers', 'j-sagittal'],
    ['Transverse Plane Rows', 'j-transverse'],
    ['Kelso Shrugs', 'j-kelso'],
    ['Frontal Plane Pulldowns', 'j-frontal'],
    ['Back Extensions', 'j-backext'],
    ['Hip Adduction', 'j-hipadd'],
    ['Calf Raises', 'j-calf'],
    ['Farmer Carries', 'client-added-1'],
];

function rev12Config() {
    const mk = (category) => ([name, id], order) => ({
        id, name, category, order, typeId: 'standard', sets: 1, minReps: 6, maxReps: 8,
    });
    const cfg = {
        version: 2,
        categories: ['Anterior', 'Posterior'],
        minimalistPrTracking: true,
        repsDropdown: { min: 5, max: 8 },
        coachPreset: 'jessi',
        splitRevision: 12,
        days: {
            1: REV12_ANTERIOR.map(mk('Anterior')),
            2: REV12_POSTERIOR.map(mk('Posterior')),
        },
    };
    // Two saved choices from the Settings dropdown, one on each side of the
    // line revision 13 draws.
    cfg.days[1].find(e => e.name === 'Chest Press').loadType = 'plate-two-sided';
    cfg.days[2].find(e => e.name === 'Sagittal Plane Pulldowns').loadType = 'plate-one-sided';
    return cfg;
}

const CUSTOM_SCHEDULE = {
    version: 2,
    workoutDays: [
        { dayOfWeek: 'Tuesday', workoutDayNumber: 1 },
        { dayOfWeek: 'Wednesday', workoutDayNumber: 2 },
    ],
    totalWorkoutDays: 2,
    scheduleIsExplicit: true,
};

function history() {
    return [workoutEntry({
        date: daysAgo(3),
        day: 2,
        exercises: [
            { id: 'actual-preacher-curls', name: 'Preacher Curls', category: 'Posterior', weight: '60', reps: '6' },
            { id: 'j-sagittal', name: 'Sagittal Plane Pulldowns', category: 'Posterior', weight: '130', reps: '6' },
            { id: 'j-rev-wrist', name: 'Reverse Wrist Curls', category: 'Posterior', weight: '40', reps: '6' },
            { id: 'j-cable-wrist', name: 'Cable Wrist Curls', category: 'Posterior', weight: '85', reps: '6' },
        ],
    })];
}

const readSaved = (page) => page.evaluate((ns) => {
    const cfg = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig'));
    const sched = JSON.parse(localStorage.getItem(ns + 'gymScheduleConfig'));
    const hist = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory'));
    const all = Object.values(cfg.days).flat();
    return {
        splitRevision: cfg.splitRevision,
        anterior: cfg.days[1].map(e => [e.name, e.id]),
        posterior: cfg.days[2].map(e => [e.name, e.id]),
        loadTypes: Object.fromEntries(all.filter(e => e.loadType).map(e => [e.name, e.loadType])),
        increments: Object.fromEntries(all.filter(e => e.increment !== undefined)
            .map(e => [e.name, e.increment])),
        schedule: sched.workoutDays.map(d => [d.dayOfWeek, d.workoutDayNumber]),
        historyIds: hist.flatMap(w => w.exercises.map(e => e.id)).sort(),
    };
}, NS);

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        await seedPublicApp(page, {
            exerciseConfig: rev12Config(),
            workoutHistory: history(),
            schedule: CUSTOM_SCHEDULE,
        });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'jessiFullBodyMigrationApplied5', 'true');
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        const saved = await readSaved(page);
        eq(saved.splitRevision, currentSplitRevision(), 'stamped with the current revision');
        ok(saved.splitRevision >= 13, 'and the current revision is at least 13');

        // 1, 2, 6: order, renames under the same ids, wrist pair gone, extra kept.
        eq(saved.anterior, EXPECTED_ANTERIOR, 'Anterior matches the personal app, ids intact');
        eq(saved.posterior, EXPECTED_POSTERIOR,
            'Posterior matches the personal app, renames keep their ids, wrist pair retired, ' +
            'client-added movement kept at the bottom');

        // 2 (cont.): retiring a movement must not touch what was logged for it.
        eq(saved.historyIds,
            ['actual-preacher-curls', 'j-cable-wrist', 'j-rev-wrist', 'j-sagittal'],
            'every logged session survives, the wrist pair included');

        // 3 + 5: the four machines revision 13 sets, and the one choice it must not touch.
        eq(saved.loadTypes, {
            'Chest Press': 'plate-two-sided',
            'Shoulder Flexion Curls': 'pin',
            'Sagittal Plane Pullovers': 'pin',
            'Frontal Plane Pulldowns': 'plate-one-sided',
            'Back Extensions': 'pin',
        }, 'the four machines are set, and the client\'s own Chest Press choice survives');

        // 4: PR step.
        eq(saved.increments, { 'Leg Press': 5, 'Back Extensions': 5 },
            'Leg Press and Back Extensions step by 5; nothing else is saved');

        // 7: the calendar is not part of the program.
        eq(saved.schedule, [['Tuesday', 1], ['Wednesday', 2]], 'the schedule is left alone');

        // History follows the rename: the card reads its own last session.
        await selectDeckDay(page, 2);
        const flexion = await readDeckCard(page, 'Shoulder Flexion Curls');
        ok(flexion, 'Shoulder Flexion Curls is on the Posterior deck');
        eq(flexion.weightValue, '60', 'Shoulder Flexion Curls shows the 60 logged as Preacher Curls');
        const pullovers = await readDeckCard(page, 'Sagittal Plane Pullovers');
        eq(pullovers.weightValue, '130', 'Sagittal Plane Pullovers shows the 130 logged under its old name');

        // Idempotent.
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        eq(await readSaved(page), saved, 'a second load changes nothing');

        // 8: the client's later choices on the same fields stick.
        await page.evaluate((ns) => {
            const cfg = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig'));
            const back = cfg.days[2].find(e => e.name === 'Back Extensions');
            back.loadType = 'plate-two-sided';
            back.increment = 10;
            localStorage.setItem(ns + 'gymExerciseConfig', JSON.stringify(cfg));
        }, NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        const after = await readSaved(page);
        eq([after.loadTypes['Back Extensions'], after.increments['Back Extensions']],
            ['plate-two-sided', 10],
            'a change made after revision 13 is not undone on the next load');

        eq(errors, [], 'no console errors');
        console.log('PASS: revision 13 reaches an existing install: renames, retirements, machines, PR steps.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
