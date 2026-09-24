// What this test covers
// ----------------------
// Logging a full Full Body day through the UI (not by seeding history): a
// typed weight and a no-interaction one-tap card each get their own LOG, then
// "Submit Day".
//
// This was the Anterior half of a pair until the Sep 2026 Full Body switch;
// test 53 was its Posterior mirror, there so logExercise could not hardcode
// the day stamp and stay green. With one program day there is no other day to
// mirror on, so 53 was retired. Bring a mirror back whenever PROGRAM_DAYS next
// has two entries.
//
// The day was mixed-type until August 2026, when Stairmaster was retired and
// left it all standard weight/reps cards. logExercise still branches on `type`
// to decide which fields to capture, so what this now pins is that the
// standard arm is the one every row takes: a regression that falls into a
// cardio branch writes a time instead of a weight and the Weekly view silently
// shows NA. The stairmaster arm itself is exercised by tests 21/22, which edit
// and round-trip real cardio-era history.
//
// Also pins that the new workout is stamped `day: 'full-body'`, which is what
// Weekly and the Edit modal key off to choose the right exercise list.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { logCardById, goToCardById, ACTIVE, revealCard, submitDay } = require('../lib/deck');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

// One card at a time now: navigate to it by id, open it, and log it. The
// reveal is not ceremony — it is what stamps the exercise's start time, and
// LOG only exists on the revealed face.
async function logCard(page, exerciseId) {
    await logCardById(page, exerciseId);
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
        await selectDayType(page, 'full-body');

        // Ab Crunches: Week 1 default weight 140, reps dropdown pre-fills 4.
        // The card must be opened before it has a weight input to type into.
        await goToCardById(page, 'ab-crunch');
        await revealCard(page);
        await page.evaluate((sel) => {
            const input = document.querySelector(sel + ' input[type="number"]');
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, '145');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }, ACTIVE);
        await logCard(page, 'ab-crunch');

        // Leg Press: logged with no interaction at all, to cover the one-tap path.
        await logCard(page, 'hip-adduction');

        // Submit the day. The button lives on the finish card at the end of
        // the deck, so this walks there first.
        await submitDay(page);

        const saved = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]'), NS);
        ok(saved.length === 1, `one workout saved (got ${saved.length})`);
        const w = saved[0];
        eq(w.day, 'full-body', 'workout recorded as a full-body day');
        ok(w.submitted, 'workout is submitted');
        // Derived: the roster has changed size several times, and a literal
        // here goes stale.
        const dayCount = await page.evaluate(() =>
            DEFAULT_EXERCISES.filter((e) => e.day === 'full-body').length);
        eq(w.exercises.length, dayCount,
            `the workout carries all ${dayCount} Full Body movements`);
        // Retired movements must not be written. (The Posterior leak probe
        // that sat here went with the split.)
        ok(!w.exercises.some(e => e.id === 'reverse-wrist-curls' || e.id === 'cable-wrist-curls'),
            'no retired wrist-curl rows are written');
        ok(!w.exercises.some(e => e.id === 'stairmaster'),
            'no stairmaster row is written now that it is retired');

        const crunch = w.exercises.find(e => e.id === 'ab-crunch');
        const legPress = w.exercises.find(e => e.id === 'hip-adduction');

        eq(crunch.weight, '145', 'ab crunches logged the typed weight');
        eq(crunch.reps, '4', 'ab crunches logged the pre-filled reps (not NA/empty)');
        eq(legPress.weight, '240', 'one-tap LOG captures the pre-filled Week 1 weight');
        eq(legPress.reps, '4', 'one-tap LOG captures the pre-filled reps');

        // Every row took the standard arm: no cardio field leaked onto any of
        // them, and the two logged rows are weight/reps shaped.
        ok(!w.exercises.some(e => e.time !== undefined || e.level !== undefined),
            'no row carries a cardio time/level field');

        eq(errors, [], 'no console errors during logging');
        console.log('PASS: an all-weighted Full Body day logs and persists real values.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
