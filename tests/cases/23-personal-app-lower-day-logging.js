// What this test covers
// ----------------------
// Logging a full Lower day through the UI (not by seeding history): a weighted
// card and the Stairmaster card each get their own LOG tap, then "Submit Day".
//
// The mixed-type day is the point. Stairmaster used to be the only thing on
// its day and lived in a separate code constant; it now sits at the bottom of
// a day made mostly of standard weight/reps cards, all read out of one config.
// logExercise branches on `type` to decide which fields to capture, so a day
// carrying both shapes at once is what proves the branch still picks
// correctly — a regression there writes an empty time or a missing weight and
// the Weekly view silently shows NA.
//
// Also pins that the new workout is stamped `day: 'lower'`, which is what
// Weekly and the Edit modal key off to choose the right exercise list.

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
        await selectDayType(page, 'lower');

        // Ab Crunches: Week 1 default weight 140, reps dropdown pre-fills 4.
        await page.evaluate(() => {
            const card = document.querySelector('[data-exercise-id="ab-crunch"]');
            const input = card.querySelector('input[type="number"]');
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, '145');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await logCard(page, 'ab-crunch');

        // Leg Press: logged with no interaction at all, to cover the one-tap path.
        await logCard(page, 'hip-adduction');

        // Stairmaster: level/time pre-fill to Level 7 / 10:00 -> log as-is.
        await logCard(page, 'stairmaster');

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
        eq(w.day, 'lower', 'workout recorded as a lower day');
        ok(w.submitted, 'workout is submitted');
        eq(w.exercises.length, 9, 'the workout carries all 9 Lower movements');
        ok(!w.exercises.some(e => e.id === 'chest-flies'),
            'no Upper movements leaked into the Lower workout');

        const crunch = w.exercises.find(e => e.id === 'ab-crunch');
        const legPress = w.exercises.find(e => e.id === 'hip-adduction');
        const stair = w.exercises.find(e => e.id === 'stairmaster');

        eq(crunch.weight, '145', 'ab crunches logged the typed weight');
        eq(crunch.reps, '4', 'ab crunches logged the pre-filled reps (not NA/empty)');
        eq(legPress.weight, '240', 'one-tap LOG captures the pre-filled Week 1 weight');
        eq(legPress.reps, '4', 'one-tap LOG captures the pre-filled reps');
        eq(stair.time, '10:00', 'stairmaster logged time 10:00 (not NA)');
        eq(stair.level, 'Level 7', 'stairmaster logged Level 7');
        ok(stair.weight === undefined && stair.reps === undefined,
            'stairmaster is stored by time/level, never weight/reps');

        eq(errors, [], 'no console errors during logging');
        console.log('PASS: a mixed weighted + stairmaster Lower day logs and persists real values.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
