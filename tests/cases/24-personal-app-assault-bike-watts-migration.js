// What this test covers
// ----------------------
// The one-time migration that renames the assault bike's tracked field from
// `watts` to `rounds` (the metric changed from +25 watts/session to +1
// round/session). An old backup / localStorage entry may still carry `watts`;
// on load the app must rename it to `rounds` (preserving the number), persist
// the change, and render it as rounds in the Weekly view.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Pre-rename data: an assault bike entry still using the old `watts` field.
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        const workoutHistory = [
            workoutEntry({
                date: today.toISOString(), day: 'cardio', submitted: true,
                exercises: [
                    { id: 'assault-bike', name: 'Assault Bike', type: 'assault-bike', intensity: '20/40', watts: '7' },
                ],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.evaluate(() => localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // The persisted history should now use `rounds` (value preserved), no `watts`.
        const saved = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]'), NS);
        const bike = saved[0].exercises.find(e => e.id === 'assault-bike');
        eq(bike.rounds, '7', 'watts value (7) migrated into rounds');
        ok(bike.watts === undefined, 'old watts field removed after migration');

        // And it renders as rounds in the Weekly view.
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('.nav-btn')).find(b => b.textContent.trim() === 'Weekly');
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 200));
        const weeklyText = await page.evaluate(() => document.querySelector('.content')?.textContent || '');
        contains(weeklyText, '7 rounds', 'weekly shows migrated assault bike value as rounds');

        eq(errors, [], 'no console errors during migration');
        console.log('PASS: assault bike watts->rounds migration preserves value and renders as rounds.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
