// What this test covers
// ----------------------
// The Posterior mirror of test 23: logging a full Posterior day through the UI,
// a typed weight and a no-interaction one-tap card, then "Submit Day".
//
// This exists because test 23 alone cannot tell you the day stamp is real.
// App.jsx writes `day: activeDayType` when it creates the entry; hardcode that
// to 'anterior' and test 23 stays green forever. Running the same flow on the
// other day is what makes the stamp — and the 12/9 roster split behind it —
// actually load-bearing.
//
// Probes: Kelso Shrugs (typed weight) and Calf Raises (one-tap, Week 1 default
// 180). Both are Posterior-only, so neither can pass by accident if the day
// filter regresses.

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
        await selectDayType(page, 'posterior');

        // Kelso Shrugs: Week 1 default 190, typed up to 195.
        // The card must be opened before it has a weight input to type into.
        await goToCardById(page, 'kelso-shrugs');
        await revealCard(page);
        await page.evaluate((sel) => {
            const input = document.querySelector(sel + ' input[type="number"]');
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, '195');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }, ACTIVE);
        await logCard(page, 'kelso-shrugs');

        // Calf Raises: logged with no interaction at all (one-tap path).
        await logCard(page, 'calf-raise');

        // Submit Day lives on the finish card at the end of the deck, so this
        // walks there first.
        await submitDay(page);

        const saved = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]'), NS);
        ok(saved.length === 1, `one workout saved (got ${saved.length})`);
        const w = saved[0];

        eq(w.day, 'posterior', 'workout recorded as a posterior day');
        ok(w.submitted, 'workout is submitted');
        // Derived: Posterior gained the wrist pair in Aug 2026, and a literal
        // here goes stale.
        const posteriorCount = await page.evaluate(() =>
            DEFAULT_EXERCISES.filter((e) => e.day === 'posterior').length);
        eq(w.exercises.length, posteriorCount,
            `the workout carries all ${posteriorCount} Posterior movements`);
        // Leak probe must be an ANTERIOR id, for the same reason test 23's has
        // to be a Posterior one.
        ok(!w.exercises.some(e => e.id === 'chest-press'),
            'no Anterior movements leaked into the Posterior workout');

        const shrugs = w.exercises.find(e => e.id === 'kelso-shrugs');
        const calves = w.exercises.find(e => e.id === 'calf-raise');

        eq(shrugs.weight, '195', 'kelso shrugs logged the typed weight');
        eq(shrugs.reps, '4', 'kelso shrugs logged the pre-filled reps (not NA/empty)');
        eq(calves.weight, '180', 'one-tap LOG captures the pre-filled Week 1 weight');
        eq(calves.reps, '4', 'one-tap LOG captures the pre-filled reps');

        ok(!w.exercises.some(e => e.time !== undefined || e.level !== undefined),
            'no Posterior row carries a cardio time/level field');

        eq(errors, [], 'no console errors during logging');
        console.log('PASS: an all-weighted Posterior day logs and persists real values.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
