// What this test covers
// ----------------------
// Jessi's weekday map, and the rule for when a revision may rewrite it.
//
// Since revision 16 (Sep 2026) his program is one Full Body day and every
// weekday opens it. A device still holding a two-day map — here a revision-13
// device, which carries the pre-14 map — must get the new map on the load that
// crosses 16, because its old map points weekdays at a day 2 that no longer
// exists. That is the rule: migrateJessiSplit rewrites the schedule only when
// it no longer fits the program (missing, the wrong number of days, or a
// weekday pointing past the last day). Pinned:
//
//   1. The revision-13 device lands on one Full Body day with every weekday
//      pointing at it, and exactly one day pill renders.
//   2. A change he makes afterwards — taking Friday off — survives the next
//      load, and would survive a later revision too, because the map still
//      fits the program. (Until revision 16 this was "written once, on the way
//      past 14"; the shape rule replaces that per-revision special case.)
//
// To verify this test is real: make migrateJessiSplit always return a
// schedule. (2) fails with Friday back.

const { start } = require('../lib/server');
const { launch, waitForApp, attachConsole } = require('../lib/browser');
const { seedPublicApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { PUBLIC_APP_ROOT, publicAppSource } = require('../lib/paths');

const NS = 'gym-local:';

const FULL_BODY_MAP = [
    ['Monday', 1], ['Tuesday', 1], ['Wednesday', 1], ['Thursday', 1],
    ['Friday', 1], ['Saturday', 1], ['Sunday', 1],
];
// What every Jessi device held before revision 14 — the state it migrates FROM.
const OLD_MAP = [
    ['Monday', 2], ['Tuesday', 1], ['Wednesday', 2], ['Thursday', 1],
    ['Friday', 2], ['Saturday', 1], ['Sunday', 1],
];

// The seeded device's program, at revision 13's order. This used to be one
// pair of constants serving as both the seed and the expectation, which held
// only while 14 was schedule-only. Revision 15 reorders both days, so the
// device crossing from 13 lands on a different order than it was seeded with
// and the two have to be spelled out separately.
const REV13_ANTERIOR = ['Tricep Extensions', 'Chest Press', 'Incline Chest Press', 'Chest Flies',
    'Shoulder Press', 'Lateral Raises', 'Overhead Tricep Extensions', 'Ab Crunches',
    'Leg Press', 'Leg Extensions'];
const REV13_POSTERIOR = ['Recline Curls', 'Shoulder Flexion Curls', 'Sagittal Plane Pullovers',
    'Transverse Plane Rows', 'Kelso Shrugs', 'Frontal Plane Pulldowns', 'Back Extensions',
    'Hip Adduction', 'Calf Raises'];

// Revision 16's one day. Same movements as the seed, nothing added or dropped.
const FULL_BODY = ['Tricep Extensions', 'Lateral Raises', 'Recline Curls', 'Shoulder Flexion Curls',
    'Chest Flies', 'Chest Press', 'Incline Chest Press', 'Overhead Tricep Extensions',
    'Ab Crunches', 'Sagittal Plane Pullovers', 'Kelso Shrugs', 'Transverse Plane Rows',
    'Frontal Plane Pulldowns', 'Shoulder Press', 'Back Extensions', 'Leg Press',
    'Hip Adduction', 'Calf Raises', 'Leg Extensions'];

function rev13Config() {
    const mk = (category) => (name, order) => ({
        id: 'j-' + name.toLowerCase().replace(/\s+/g, '-'), name, category, order,
        typeId: 'standard', sets: 1, minReps: 6, maxReps: 8,
    });
    return {
        version: 2,
        categories: ['Anterior', 'Posterior'],
        minimalistPrTracking: true,
        repsDropdown: { min: 5, max: 8 },
        coachPreset: 'jessi',
        splitRevision: 13,
        days: { 1: REV13_ANTERIOR.map(mk('Anterior')), 2: REV13_POSTERIOR.map(mk('Posterior')) },
    };
}

const scheduleFrom = (map) => ({
    version: 2,
    workoutDays: map.map(([dayOfWeek, workoutDayNumber]) => ({ dayOfWeek, workoutDayNumber })),
    totalWorkoutDays: 2,
    scheduleIsExplicit: true,
});

const readSaved = (page) => page.evaluate((ns) => {
    const cfg = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig'));
    const sched = JSON.parse(localStorage.getItem(ns + 'gymScheduleConfig'));
    return {
        splitRevision: cfg.splitRevision,
        days: Object.keys(cfg.days).map(k => cfg.days[k].map(e => e.name)),
        schedule: sched.workoutDays.map(d => [d.dayOfWeek, d.workoutDayNumber]),
        total: sched.totalWorkoutDays,
        explicit: sched.scheduleIsExplicit,
    };
}, NS);

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

        await seedPublicApp(page, {
            exerciseConfig: rev13Config(), workoutHistory: [], schedule: scheduleFrom(OLD_MAP),
        });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'jessiFullBodyMigrationApplied5', 'true');
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
            localStorage.setItem(ns + 'hasSeenTutorial', 'true');
        }, NS);
        await reload(page);

        // --- 1. The one-day map lands ----------------------------------------
        const saved = await readSaved(page);
        const m = publicAppSource().match(/const JESSI_SPLIT_REVISION\s*=\s*(\d+)/);
        ok(m && Number(m[1]) >= 16, 'the current revision is at least 16');
        eq(saved.splitRevision, Number(m[1]), 'stamped with the current revision');
        eq(saved.days, [FULL_BODY], 'one Full Body day, in order');
        eq([...saved.days[0]].sort(), [...REV13_ANTERIOR, ...REV13_POSTERIOR].sort(),
            'and no movement was added or dropped');
        eq(saved.schedule, FULL_BODY_MAP, 'every weekday now opens the Full Body day');
        eq([saved.total, saved.explicit], [1, true], 'one day, explicit');
        const pills = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.day-pill')).map(p => p.textContent.trim()));
        eq(pills, ['Full Body'], 'exactly one day pill — no phantom Day 2 from the old map');

        // --- 2. His own change afterwards sticks ------------------------------
        await page.evaluate((ns) => {
            const s = JSON.parse(localStorage.getItem(ns + 'gymScheduleConfig'));
            s.workoutDays = s.workoutDays.filter(d => d.dayOfWeek !== 'Friday');
            localStorage.setItem(ns + 'gymScheduleConfig', JSON.stringify(s));
        }, NS);
        await reload(page);
        const after = await readSaved(page);
        eq(after.schedule.map(([d]) => d).includes('Friday'), false,
            'a day he takes off after the switch stays off — the map still fits the program');

        eq(errors, [], 'no console errors');
        console.log("PASS: Jessi's weekday map is rewritten only when it no longer fits his program.");
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
