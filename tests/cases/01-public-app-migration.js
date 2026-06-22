// What this test covers
// ----------------------
// Jessi's public_gym_app holds her exercise list entirely in localStorage.
// When we change her split, the `migrateJessiToFullBody` migration is the
// thing that actually reshuffles her saved data into the new canonical
// single-day layout.
//
// Without this test, a future revision could leave the migration out of
// sync with the personal-app program — Jessi's app would silently
// disagree.
//
// What we assert:
//   - exerciseConfig collapses to a single day (days[1]) in canonical
//     Full Body order.
//   - Categories array becomes ['Full Body'].
//   - The 3 dropped exercises (Lateral Raises, Reverse Wrist Curls,
//     Cable Wrist Curls) are removed.
//   - Schedule.workoutDays all remap to dayNumber 1, totalWorkoutDays=1.
//   - jessiFullBodyMigrationApplied1 flag is set so migration won't re-run.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiPreMigrationConfig, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PUBLIC_APP_ROOT = path.resolve(__dirname, '..', '..', '..', 'public_gym_app');

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);

        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPublicApp(page, {
            exerciseConfig: jessiPreMigrationConfig(),
            schedule: jessiDefaultSchedule(),
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1500));

        const after = await page.evaluate(() => {
            const cfg = JSON.parse(localStorage.getItem('gym-local:gymExerciseConfig'));
            const sched = JSON.parse(localStorage.getItem('gym-local:gymScheduleConfig'));
            const flag = localStorage.getItem('gym-local:jessiFullBodyMigrationApplied1');
            return {
                day1: (cfg.days[1] || []).map(e => e.name),
                day2Exists: !!cfg.days[2],
                categories: cfg.categories,
                scheduleDays: sched.workoutDays.map(d => d.workoutDayNumber),
                scheduleTotal: sched.totalWorkoutDays,
                flagSet: flag === 'true',
            };
        });

        // Canonical Full Body order for Jessi (mirrors personal-app minus the
        // 3 dropped exercises plus retained pre-existing names like "Seated
        // Row" rather than "Sagittal Plane Pulldowns" because the fixture
        // uses Seated Row as its display name).
        const expectedOrder = [
            'Preacher Curls',
            'Tricep Pushdown',
            'Chest Flies',
            'Incline Chest Press',
            'Seated Row',
            'Frontal Plane Pulldowns',
            'Upper Back Row',
            'Kelso Shrugs',
            'Shoulder Press',
            'Ab Crunch',
            'Seated Calf Raise',
            'Hip Adduction',
            'Stiff Legged Deadlifts',
            'Pendulum Squats',
            'Weighted Dips',
        ];

        eq(after.day1, expectedOrder, 'Full Body day exercise order after migration');
        eq(after.day2Exists, false, 'no day 2 — single Full Body day only');
        eq(after.categories, ['Full Body'], 'categories collapsed to ["Full Body"]');
        eq(after.scheduleDays, [1, 1, 1, 1], 'all schedule weekdays remapped to dayNumber 1');
        eq(after.scheduleTotal, 1, 'totalWorkoutDays = 1');
        ok(after.flagSet, 'jessiFullBodyMigrationApplied1 flag is set so migration does not re-run');
        eq(errors, [], 'no console errors during load');

        console.log('PASS: Jessi migration collapsed exercises into single Full Body day.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
