// What this test covers
// ----------------------
// Revision 14: Jessi's weekday map moves with the personal app's, from 18 Sep
// 2026. The two train together, so her "today" card has to be his.
//
//   Mon Anterior · Tue Posterior · Wed Anterior · Thu Posterior
//   Fri rest (falls through to Posterior) · Sat Anterior · Sun Posterior
//
// Until now a revision bump never touched the schedule — only the first split
// wrote one — so this is the first that does. It does it the way revision 13
// did its machine settings: once, on the way past 14, and never again. Pinned:
//
//   1. A device on revision 13 holding the old map gets the new one, and its
//      roster is otherwise untouched. Its order is not: revision 15 reorders
//      both days, and a device seeded at 13 crosses 14 and 15 on the one load,
//      so it takes the schedule and the reorder together.
//   2. A change the client makes to the schedule afterwards survives the next
//      load, so a later bump will not undo it either.
//
// To verify this test is real: drop the schedule from the crossing-14 branch
// of migrateJessiSplit. (1) fails with the Sep 11 map still in place.

const { start } = require('../lib/server');
const { launch, waitForApp, attachConsole } = require('../lib/browser');
const { seedPublicApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { PUBLIC_APP_ROOT, publicAppSource } = require('../lib/paths');

const NS = 'gym-local:';

const NEW_MAP = [
    ['Monday', 1], ['Tuesday', 2], ['Wednesday', 1], ['Thursday', 2],
    ['Friday', 2], ['Saturday', 1], ['Sunday', 2],
];
// What every Jessi device held before revision 14.
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

// Revision 15's order: Overhead Tricep Extensions and Ab Crunches up two on
// Anterior with the shoulder pair behind them, reversed; Kelso Shrugs and
// Transverse Plane Rows swapped on Posterior. Same movements throughout.
const ANTERIOR = ['Tricep Extensions', 'Chest Press', 'Incline Chest Press', 'Chest Flies',
    'Overhead Tricep Extensions', 'Ab Crunches', 'Lateral Raises', 'Shoulder Press',
    'Leg Press', 'Leg Extensions'];
const POSTERIOR = ['Recline Curls', 'Shoulder Flexion Curls', 'Sagittal Plane Pullovers',
    'Kelso Shrugs', 'Transverse Plane Rows', 'Frontal Plane Pulldowns', 'Back Extensions',
    'Hip Adduction', 'Calf Raises'];

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
        days: [cfg.days[1].map(e => e.name), cfg.days[2].map(e => e.name)],
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

        // --- 1. The new map lands, and nothing else moves -------------------
        const saved = await readSaved(page);
        const m = publicAppSource().match(/const JESSI_SPLIT_REVISION\s*=\s*(\d+)/);
        ok(m && Number(m[1]) >= 14, 'the current revision is at least 14');
        eq(saved.splitRevision, Number(m[1]), 'stamped with the current revision');
        eq(saved.schedule, NEW_MAP, 'the device now holds the Sep 18 weekday map');
        eq([saved.total, saved.explicit], [2, true], 'two days, explicit, so the app opens on today\'s day');
        // The roster is untouched — same movements, same days, nobody gains or
        // loses one. The ORDER is not: revision 15 reorders both days, and a
        // device seeded at 13 crosses 14 and 15 on the one load, so it takes
        // the schedule and the reorder together.
        eq(saved.days, [ANTERIOR, POSTERIOR],
            "the roster is untouched and both days take revision 15's order");
        eq([[...saved.days[0]].sort(), [...saved.days[1]].sort()],
            [[...REV13_ANTERIOR].sort(), [...REV13_POSTERIOR].sort()],
            'and no movement was added, dropped, or moved between days');

        const pill = await page.evaluate(() => {
            const p = document.querySelector('.day-pill.active');
            return p ? p.textContent.trim() : null;
        });
        const todayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];
        const expectedDay = NEW_MAP.find(([d]) => d === todayName)[1] === 1 ? 'Anterior' : 'Posterior';
        eq(pill, expectedDay, `and today (${todayName}) opens on ${expectedDay}`);

        // --- 2. The client's own change afterwards sticks -------------------
        await page.evaluate((ns) => {
            const s = JSON.parse(localStorage.getItem(ns + 'gymScheduleConfig'));
            s.workoutDays.find(d => d.dayOfWeek === 'Friday').workoutDayNumber = 1;
            localStorage.setItem(ns + 'gymScheduleConfig', JSON.stringify(s));
        }, NS);
        await reload(page);
        const after = await readSaved(page);
        eq(after.schedule.find(([d]) => d === 'Friday'), ['Friday', 1],
            'a day the client moves after revision 14 stays moved');

        eq(errors, [], 'no console errors');
        console.log('PASS: revision 14 moves Jessi to the Sep 18 weekday map, once.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
