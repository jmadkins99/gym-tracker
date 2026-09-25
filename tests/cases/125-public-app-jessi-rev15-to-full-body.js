// What this test covers
// ----------------------
// Jessi's phone crossing from revision 15 (Anterior/Posterior) to his Sep 2026
// Full Body program, through the real app — the browser half of test 126.
//
// The seed is his device as it stands: his real exercise ids, his 9/21
// Anterior session with its real weights, a Posterior session after it, the
// revision-14 weekday map, a load type he chose himself (Chest Flies), and a
// movement he added himself. The legacy one-shot flags are set, which is what
// his signed-in phone looks like to them (they never ran there at all).
//
// Pinned, on the first load of the new build:
//   1. One day, "Full Body", holding the 19 movements in the personal app's
//      order, then an invented self-added Face Pulls. Every id is his, unchanged, so every
//      "Last:" and PR streak follows; his load type and PR steps ride through.
//   2. The weekday map sends all seven days to day 1, so exactly ONE day pill
//      renders. Without the schedule rewrite the app would draw a phantom
//      "Day 2" pill from the old totalWorkoutDays.
//   3. "Last:" carries over from BOTH old days: Tricep Extensions shows 30
//      from the 9/21 Anterior session, Recline Curls 40 from the Posterior one.
//   4. History is never rewritten — the stored sessions are byte-identical.
//   5. A second load changes nothing.
//
// To verify this test is real: leave JESSI_SPLIT_REVISION at 15. Nothing
// migrates and (1) fails on the day count.

const { start } = require('../lib/server');
const { launch, waitForApp, attachConsole } = require('../lib/browser');
const { readDeckCard, readDeckNames } = require('../lib/deck');
const { seedPublicApp, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');
const { PUBLIC_APP_ROOT, publicAppSource } = require('../lib/paths');

const NS = 'gym-local:';

const EXPECTED_FULL_BODY = [
    'Tricep Extensions', 'Lateral Raises', 'Recline Curls', 'Shoulder Flexion Curls',
    'Chest Flies', 'Chest Press', 'Incline Chest Press', 'Overhead Tricep Extensions',
    'Ab Crunches', 'Sagittal Plane Pullovers', 'Kelso Shrugs', 'Transverse Plane Rows',
    'Frontal Plane Pulldowns', 'Shoulder Press', 'Back Extensions', 'Leg Press',
    'Hip Adduction', 'Calf Raises', 'Leg Extensions',
];

// Real ids from his Firestore config and his 9/21 session.
const ID = {
    tricepExt: '676b6dcc-4d13-4cd3-8fb4-6987788ceabd',
    inclinePress: '93de12cc-1835-4d83-bf75-b4335a4ff35a',
    chestFlies: '8acc159e-fc2a-4d5a-9c61-e75908ca1928',
    overheadTricep: 'ab490c47-37fb-436d-aaa9-998fd39887bb',
    abCrunches: '770cfe8d-e09c-40c7-b6c8-1676d9c64a02',
    lateralRaises: 'c6625761-50e1-41ef-8070-567228e1de4f',
    shoulderPress: '1c627b58-1227-46bb-9daf-9fe78e6b95f5',
    legPress: 'f6dde47c-e085-485a-b446-a4d1cfd566f1',
    reclineCurls: 'd989eb9d-921d-4135-8e72-57006d76e3e3',
    sagittal: '9df5161d-45c8-4435-8bef-0875a94dc41c',
    kelsoShrugs: '6f1a174a-9892-4a7f-ba94-f9278df18fc3',
    transverseRows: 'db4fb026-d3f0-4653-b4e9-4968d52df293',
    frontalPulldowns: '121551d4-91ae-440f-9f22-266039ea5e20',
    backExtensions: 'e6d80fad-07d0-464b-90bc-ab4d7e059b86',
    hipAdduction: 'c65da494-c391-47b3-a742-e6ca5184d60d',
    calfRaises: '107ecf47-ae8c-4b68-90da-f2b930118983',
};

// His revision-15 device — the state it migrates FROM. [id, name, loadType, increment?]
const REV15_ANTERIOR = [
    [ID.tricepExt, 'Tricep Extensions', 'pin'],
    ['chest-press', 'Chest Press', 'pin'],
    [ID.inclinePress, 'Incline Chest Press', 'pin'],
    // His own choice; the seed was pin.
    [ID.chestFlies, 'Chest Flies', 'plate-two-sided'],
    [ID.overheadTricep, 'Overhead Tricep Extensions', 'pin'],
    [ID.abCrunches, 'Ab Crunches', 'pin'],
    [ID.lateralRaises, 'Lateral Raises', 'pin'],
    [ID.shoulderPress, 'Shoulder Press', 'pin'],
    [ID.legPress, 'Leg Press', 'plate-two-sided', 5],
    ['actual-leg-extensions', 'Leg Extensions', 'pin'],
];
const REV15_POSTERIOR = [
    [ID.reclineCurls, 'Recline Curls', 'pin'],
    ['actual-preacher-curls', 'Shoulder Flexion Curls', 'pin'],
    [ID.sagittal, 'Sagittal Plane Pullovers', 'pin'],
    [ID.kelsoShrugs, 'Kelso Shrugs', 'plate-one-sided'],
    [ID.transverseRows, 'Transverse Plane Rows', 'plate-one-sided'],
    [ID.frontalPulldowns, 'Frontal Plane Pulldowns', 'plate-one-sided'],
    [ID.backExtensions, 'Back Extensions', 'pin', 5],
    [ID.hipAdduction, 'Hip Adduction', 'pin'],
    [ID.calfRaises, 'Calf Raises', 'pin'],
    // INVENTED for this test — Jessi has no Face Pulls. It stands in for a
    // movement a client adds himself in Settings, to prove the switch keeps
    // anything outside the program (it lands at the end of the day).
    ['his-face-pulls', 'Face Pulls', undefined],
];

function rev15Config() {
    const row = (category) => ([id, name, loadType, increment], order) => ({
        id, name, category, typeId: 'standard', sets: 1, minReps: 6, maxReps: 8,
        ...(loadType ? { loadType } : {}), ...(increment ? { increment } : {}), order });
    return {
        version: 2,
        days: { 1: REV15_ANTERIOR.map(row('Anterior')), 2: REV15_POSTERIOR.map(row('Posterior')) },
        categories: ['Anterior', 'Posterior'],
        prTracking: false, advancedPrTracking: false, minimalistPrTracking: true,
        repsDropdown: { min: 5, max: 8 },
        splitRevision: 15,
    };
}

const REV14_SCHEDULE = {
    version: 2, totalWorkoutDays: 2, scheduleIsExplicit: true,
    workoutDays: [['Monday', 1], ['Tuesday', 2], ['Wednesday', 1], ['Thursday', 2],
        ['Friday', 2], ['Saturday', 1], ['Sunday', 2]].map(([dayOfWeek, workoutDayNumber]) =>
        ({ dayOfWeek, workoutDayNumber })),
};

// His 9/21 Anterior session, weights exactly as logged.
const SEP21 = [
    [ID.tricepExt, 'Tricep Extensions', '30', '5'],
    ['chest-press', 'Chest Press', '95', '8'],
    [ID.inclinePress, 'Incline Chest Press', '100', '6'],
    [ID.chestFlies, 'Chest Flies', '77.5', '6'],
    [ID.overheadTricep, 'Overhead Tricep Extensions', '60', '8'],
    [ID.abCrunches, 'Ab Crunches', '80', '8'],
    [ID.lateralRaises, 'Lateral Raises', '65', '6'],
    [ID.shoulderPress, 'Shoulder Press', '50', '6'],
    [ID.legPress, 'Leg Press', '90', '7'],
    ['actual-leg-extensions', 'Leg Extensions', '105', '8'],
];
// INVENTED: a Posterior session after it. His real one wasn't to hand, so
// these weights are made up; only SEP21 above is his actual data.
const SEP22 = [
    [ID.reclineCurls, 'Recline Curls', '40', '7'],
    [ID.kelsoShrugs, 'Kelso Shrugs', '100', '6'],
    [ID.calfRaises, 'Calf Raises', '90', '8'],
];

const session = (date, day, category, rows) => ({
    ...workoutEntry({ date, day, exercises: rows.map(([id, name, weight, reps]) =>
        ({ id, name, category, weight, reps, loggedAt: date })) }),
    week: 29,
    entryId: 'w-' + date.slice(0, 10),
});

const HISTORY = [
    session('2026-09-21T14:57:01.132Z', 1, 'Anterior', SEP21),
    session('2026-09-22T14:30:00.000Z', 2, 'Posterior', SEP22),
];

const readSaved = (page) => page.evaluate((ns) => ({
    config: localStorage.getItem(ns + 'gymExerciseConfig'),
    schedule: localStorage.getItem(ns + 'gymScheduleConfig'),
    history: localStorage.getItem(ns + 'gymWorkoutHistory'),
}), NS);

async function reload(page) {
    await page.reload({ waitUntil: 'networkidle0' });
    await waitForApp(page);
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        await seedPublicApp(page, { exerciseConfig: rev15Config(), workoutHistory: HISTORY, schedule: REV14_SCHEDULE });
        await page.evaluate((ns) => {
            for (const f of ['jessiAPMigrationApplied', 'jessiFullBodyMigrationApplied5', 'jessiRepsDropdownEnabled']) {
                localStorage.setItem(ns + f, 'true');
            }
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
            localStorage.setItem(ns + 'hasSeenTutorial', 'true');
        }, NS);
        const seededHistory = (await readSaved(page)).history;
        await reload(page);

        // --- 1. The program ---------------------------------------------------
        const first = await readSaved(page);
        const cfg = JSON.parse(first.config);
        const m = publicAppSource().match(/const JESSI_SPLIT_REVISION\s*=\s*(\d+)/);
        ok(m && Number(m[1]) > 15, 'the current revision is past 15');
        eq(cfg.splitRevision, Number(m[1]), 'stamped with the current revision');
        eq(Object.keys(cfg.days), ['1'], 'one day');
        eq(cfg.categories, ['Full Body'], 'named Full Body');
        const day = cfg.days[1];
        eq(day.map(e => e.name), [...EXPECTED_FULL_BODY, 'Face Pulls'],
            'the 19 in the Full Body order, then his own Face Pulls');
        const seeded = [...REV15_ANTERIOR, ...REV15_POSTERIOR];
        eq([...day.map(e => e.id)].sort(), seeded.map(([id]) => id).sort(), 'every id is his, unchanged');
        const byId = Object.fromEntries(day.map(e => [e.id, e]));
        for (const [id, name, loadType, increment] of seeded) {
            eq([byId[id].name, byId[id].loadType, byId[id].increment], [name, loadType, increment],
                `${name} keeps its name, load type and PR step`);
        }
        eq(cfg.repsDropdown, { min: 5, max: 8 }, 'his 5-8 reps dropdown rides through');

        // --- 2. The schedule and the one pill ----------------------------------
        const sched = JSON.parse(first.schedule);
        eq(sched.totalWorkoutDays, 1, 'the schedule is one day');
        eq([...new Set(sched.workoutDays.map(d => d.workoutDayNumber))], [1], 'every weekday goes to it');
        eq(sched.workoutDays.length, 7, 'all seven weekdays');
        const pills = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.day-pill')).map(p => p.textContent.trim()));
        eq(pills, ['Full Body'], 'exactly one day pill, Full Body — no phantom Day 2');

        eq(await readDeckNames(page), [...EXPECTED_FULL_BODY, 'Face Pulls'], 'the deck walks the day in order');

        // --- 3. Last session from both old days ----------------------------------
        contains((await readDeckCard(page, 'Tricep Extensions')).last, '30', 'Tricep Extensions: Last 30 from 9/21');
        contains((await readDeckCard(page, 'Chest Flies')).last, '77.5', 'Chest Flies: Last 77.5 from 9/21');
        contains((await readDeckCard(page, 'Leg Extensions')).last, '105', 'Leg Extensions: Last 105 from 9/21');
        contains((await readDeckCard(page, 'Recline Curls')).last, '40', 'Recline Curls: Last 40 from the Posterior day');
        contains((await readDeckCard(page, 'Calf Raises')).last, '90', 'Calf Raises: Last 90 from the Posterior day');

        // --- 4. History untouched -------------------------------------------------
        // `week` aside: the app renumbers weeks from the first logged Monday on
        // every load (hasMigratedWeeks in App.jsx), which has nothing to do with
        // his program and predates this switch.
        const noWeek = (raw) => JSON.stringify(JSON.parse(raw).map(({ week, ...w }) => w));
        eq(noWeek(first.history), noWeek(seededHistory),
            'stored sessions are otherwise byte-identical — history is never migrated');

        // --- 5. Idempotent ---------------------------------------------------------
        await reload(page);
        const second = await readSaved(page);
        eq([second.config, second.schedule], [first.config, first.schedule], 'a second load changes nothing');

        eq(errors, [], 'no console errors');
        console.log('PASS: Jessi\'s revision-15 device lands on Full Body with every id, weight and setting intact.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
