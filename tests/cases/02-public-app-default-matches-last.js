// What this test covers
// ----------------------
// THE day-filter regression.
//
// Before the fix, getMinimalistPR / getStagnationWarning etc. in the public
// app filtered workoutHistory by `w.day === currentDay`. After a split
// change, an exercise can have stale history on the same `day` slot from a
// prior split era — the buggy code would surface that stale data as the
// default weight in the input field, while "Last:" (which doesn't filter
// by day) showed the correct recent value. Default ≠ Last is the
// user-visible symptom.
//
// Setup:
//   - Frontal Plane Pulldowns (id: jfront), currently on Day 1 (Torso).
//   - Workout history: an old Day 1 session at 220 × 8 (would trigger a
//     PR bump → 222.5 with the bug), AND a recent Day 2 session at
//     160 × 4 (the real "Last:").
//
// Assertion:
//   - Rendered "Last:" displays 160 × 4.
//   - Rendered default weight input value is "160" (not "222.5").
//   - I.e. the bug is gone.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { readDeckCard } = require('../lib/deck');
const {
    seedPublicApp,
    workoutEntry,
    jessiPreMigrationConfig,
    jessiDefaultSchedule,
} = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const { PUBLIC_APP_ROOT } = require('../lib/paths');

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Stale Day 1 history from a prior split era + recent Day 2 history.
        // Frontal Plane Pulldowns id is `jfront` in our fake Jessi config; it
        // lands on Torso (Day 1) after the migration.
        const workoutHistory = [
            // newest first — this matches how the app stores it
            workoutEntry({
                date: '2026-05-30T20:00:00Z', day: 2,
                exercises: [{ id: 'jfront', name: 'Frontal Plane Pulldowns', weight: '160', reps: '4' }],
            }),
            workoutEntry({
                date: '2026-02-01T20:00:00Z', day: 1,
                exercises: [{ id: 'jfront', name: 'Frontal Plane Pulldowns', weight: '220', reps: '8' }],
            }),
        ];

        await seedPublicApp(page, {
            exerciseConfig: jessiPreMigrationConfig(),
            workoutHistory,
            schedule: jessiDefaultSchedule(),
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // One card at a time now: navigate the deck to it and swipe it open.
        // The reveal is not ceremony — the weight field does not exist until the
        // card is open, and opening it is what starts the exercise's clock.
        const frontal = await readDeckCard(page, 'Frontal Plane Pulldowns');

        ok(frontal, 'Frontal Plane Pulldowns card is rendered on the current day');
        contains(frontal.last, '160', '"Last:" should show 160 (the recent session weight)');
        contains(frontal.last, '4',   '"Last:" should show 4 reps');
        eq(frontal.weightValue, '160',
            'default Weight (lbs) field should equal the recent session weight, ' +
            'not a stale Day-1 PR bump from a prior split era');
        eq(errors, [], 'no console errors during load');

        console.log('PASS: public app default weight tracks most-recent session regardless of day slot.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
