// What this test covers
// ----------------------
// The one-time cleanup that discards the assault bike's abandoned `rounds`
// metric. The bike is now tracked by `intensity` (work/rest seconds, 20/40 ->
// 40/20) plus a `watts` effort level. An old backup / localStorage entry may
// still carry `rounds`; on load the app must strip it, reset the entry to a
// clean no-data state (intensity 'NA', no rounds), persist the change, and show
// it as NA in the Weekly view so progression restarts fresh at 20/40.

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

        // Pre-cleanup data: an assault bike entry still using the old `rounds` field.
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        const workoutHistory = [
            workoutEntry({
                date: today.toISOString(), day: 'cardio', submitted: true,
                exercises: [
                    { id: 'assault-bike', name: 'Assault Bike', type: 'assault-bike', intensity: '20/40', rounds: '7' },
                ],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.evaluate(() => localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // The persisted history should drop `rounds` and reset to a clean NA entry.
        const saved = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]'), NS);
        const bike = saved[0].exercises.find(e => e.id === 'assault-bike');
        ok(bike.rounds === undefined, 'old rounds field removed after cleanup');
        eq(bike.intensity, 'NA', 'entry reset to NA so progression restarts fresh');

        // And it renders as NA (not a stale rounds value) in the Weekly view.
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('.nav-btn')).find(b => b.textContent.trim() === 'Weekly');
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 200));
        const weeklyText = await page.evaluate(() => document.querySelector('.content')?.textContent || '');
        ok(!/\d+ rounds/.test(weeklyText), 'weekly no longer shows a rounds value');

        eq(errors, [], 'no console errors during cleanup');
        console.log('PASS: assault bike rounds cleanup discards old metric and restarts fresh.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
