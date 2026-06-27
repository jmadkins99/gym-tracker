// What this test covers
// ----------------------
// Backup compatibility for cardio-day workouts. A backup is just
// { workoutHistory, exerciseConfig: { exercises }, exportDate }; importing it
// calls setWorkoutHistory(imported.workoutHistory) and writes gymWorkoutHistory
// — exactly the state seedPersonalApp produces. So seeding a cardio workout
// reproduces the post-restore state.
//
// Cardio exercises live in a code constant (CARDIO_EXERCISES), not in the
// exported exerciseConfig, so the only cardio data that must survive a
// round-trip is the workout rows themselves. This test confirms a restored
// cardio workout renders correctly in the Weekly view AND opens cleanly in the
// Edit modal (which previously would have shown full-body cards instead).

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

async function clickNav(page, label) {
    await page.evaluate((l) => {
        const btn = Array.from(document.querySelectorAll('.nav-btn')).find(b => b.textContent.trim() === l);
        if (btn) btn.click();
    }, label);
    await new Promise(r => setTimeout(r, 200));
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // A restored backup containing one completed cardio workout (today).
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        const workoutHistory = [
            workoutEntry({
                date: today.toISOString(), day: 'cardio', submitted: true,
                exercises: [
                    { id: 'body-weight-squats', name: 'Body Weight Squats', type: 'bodyweight', weight: 'Body Weight', reps: '50' },
                    { id: 'stairmaster', name: 'Stairmaster', type: 'stairmaster', level: 'Level 9', time: '12:00' },
                    { id: 'assault-bike', name: 'Assault Bike', type: 'assault-bike', intensity: '10/20', watts: '300' },
                ],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        // Suppress the monthly backup-reminder modal so it doesn't sit over the UI.
        await page.evaluate(() => {
            localStorage.setItem('gym-local:lastBackupReminder', String(Date.now()));
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // Weekly view: the cardio workout renders its own exercises + values.
        await clickNav(page, 'Weekly');
        const weeklyText = await page.evaluate(() =>
            document.querySelector('.content')?.textContent || '');
        contains(weeklyText, 'Body Weight Squats', 'weekly shows squats');
        contains(weeklyText, 'BW × 50', 'weekly shows squats as "BW × 50"');
        contains(weeklyText, 'Stairmaster', 'weekly shows stairmaster');
        contains(weeklyText, '12:00 / Level 9', 'weekly shows stairmaster time + actual level (not hardcoded Level 10)');
        contains(weeklyText, 'Assault Bike', 'weekly shows assault bike');
        contains(weeklyText, '300 watts', 'weekly shows assault bike watts');

        // Edit modal: opens on the cardio workout and renders its own cards.
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('✏️'));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 200));
        const modalText = await page.evaluate(() =>
            document.querySelector('.modal')?.textContent || '');
        ok(modalText, 'edit modal opened');
        contains(modalText, 'Cardio Day', 'edit modal titled "Cardio Day"');
        contains(modalText, 'Body Weight Squats', 'edit modal shows squats card');
        contains(modalText, 'Stairmaster', 'edit modal shows stairmaster card');
        contains(modalText, 'Assault Bike', 'edit modal shows assault bike card');
        // Full-body exercises must NOT leak into a cardio workout's edit modal.
        ok(!/Shoulder Press|Kelso Shrugs|Pendulum Squats/.test(modalText),
            'edit modal does not show full-body exercises');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: cardio workout survives backup round-trip and renders in Weekly + Edit.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
