// What this test covers
// ----------------------
// Actually LOGGING each cardio exercise through the UI (not seeding history):
// squats, stairmaster, and assault bike each have their own LOG button, and a
// "Submit Day" at the end. This verifies all three persist real values (so the
// Weekly view shows data, not NA) — the path a user takes when logging a day.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

async function logCard(page, exerciseId) {
    await page.evaluate((id) => {
        const card = document.querySelector(`[data-exercise-id="${id}"]`);
        const btn = Array.from(card.querySelectorAll('button')).find(b => /LOG/i.test(b.textContent));
        if (btn) btn.click();
    }, exerciseId);
    await new Promise(r => setTimeout(r, 150));
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate(() => localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'cardio');

        // Squats: reps pre-fill 50 (first session) -> log as-is.
        await logCard(page, 'body-weight-squats');
        // Stairmaster: level/time pre-fill to Level 7 / 10:00 -> log as-is.
        await logCard(page, 'stairmaster');
        // Assault bike: rounds pre-fill to first-session default of 3 -> log as-is.
        await logCard(page, 'assault-bike');

        // Submit the day.
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => /Submit Day/i.test(b.textContent));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 250));

        const saved = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]'), NS);
        ok(saved.length === 1, `one workout saved (got ${saved.length})`);
        const w = saved[0];
        eq(w.day, 'cardio', 'workout recorded as cardio day');
        ok(w.submitted, 'workout is submitted');

        const squat = w.exercises.find(e => e.id === 'body-weight-squats');
        const stair = w.exercises.find(e => e.id === 'stairmaster');
        const bike = w.exercises.find(e => e.id === 'assault-bike');

        eq(squat.reps, '50', 'squats logged 50 reps (not NA/empty)');
        eq(stair.time, '10:00', 'stairmaster logged time 10:00 (not NA)');
        eq(stair.level, 'Level 7', 'stairmaster logged Level 7');
        eq(bike.rounds, '3', 'assault bike logged 3 rounds default (not NA)');

        eq(errors, [], 'no console errors during logging');
        console.log('PASS: all three cardio exercises log and persist real values.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
