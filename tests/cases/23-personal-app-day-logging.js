// What this test covers
// ----------------------
// Logging a whole day through the UI (not by seeding history): a typed weight
// and a no-interaction one-tap card each get their own LOG, then "Submit Day".
// Run once per program day, Anterior and then Posterior, each from an empty
// history.
//
// The two runs are the mirror pair this case used to have with test 53 until
// the Sep 2026 Full Body switch left one day to log. Running both is what stops
// logExercise hardcoding the day stamp, or writing the other day's rows, and
// staying green: each run checks the saved workout carries its own day and
// exactly that day's movements.
//
// The day was mixed-type until August 2026, when Stairmaster was retired and
// left it all standard weight/reps cards. logExercise still branches on `type`
// to decide which fields to capture, so what this also pins is that the
// standard arm is the one every row takes: a regression that falls into a
// cardio branch writes a time instead of a weight and the Weekly view silently
// shows NA. The stairmaster arm itself is exercised by tests 21/22, which edit
// and round-trip real cardio-era history.
//
// To verify this test is real: stamp every workout `day: PROGRAM_DAYS[0].id`
// in logExercise. The Posterior run fails on the day stamp.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { logCardById, goToCardById, ACTIVE, revealCard, submitDay } = require('../lib/deck');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

// Retired movements must never be written, whichever day is logged.
const RETIRED = [
    'reverse-wrist-curls', 'cable-wrist-curls', 'stairmaster',
    'lats-sagittal-shoulder-extension-above-120-degrees',   // Dumbbell Lat Pullover, v28
    'delts-transverse-shoulder-abduction-with-elbow-flexion', // Transverse Rows, v28
    'adductors-transverse-hip-adduction',                    // Hip Adduction, v28
];

const DAYS = [
    { day: 'anterior-2', label: 'Anterior',
      typed: { id: 'quads-knee-extension', name: 'Leg Extensions' },
      oneTap: { id: 'quads-knee-extension-during-hip-flexion', name: 'Squats' } },
    { day: 'posterior-2', label: 'Posterior',
      typed: { id: 'abs-spinal-flexion', name: 'Ab Crunches' },
      oneTap: { id: 'calves-ankle-extension', name: 'Calf Raises' } },
];

async function logDay(page, { day, label, typed, oneTap }) {
    await seedPersonalApp(page, { workoutHistory: [] });
    await page.evaluate((ns) => {
        localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        localStorage.removeItem(ns + 'dayPick');
    }, NS);
    await page.reload({ waitUntil: 'networkidle0' });
    await waitForApp(page);
    await selectDayType(page, day);

    // A typed weight, reps dropdown pre-fills 4. The card must be opened
    // before it has a weight input to type into.
    await goToCardById(page, typed.id);
    await revealCard(page);
    await page.evaluate((sel) => {
        const input = document.querySelector(sel + ' input[type="number"]');
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, '145');
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, ACTIVE);
    await logCardById(page, typed.id);

    // Logged with no interaction at all, to cover the one-tap path.
    await logCardById(page, oneTap.id);

    // The button lives on the finish card at the end of the deck, so this
    // walks there first.
    await submitDay(page);

    const saved = await page.evaluate((ns) =>
        JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]'), NS);
    ok(saved.length === 1, `${label}: one workout saved (got ${saved.length})`);
    const w = saved[0];
    eq(w.day, day, `${label}: the workout is stamped with its day`);
    ok(w.submitted, `${label}: workout is submitted`);
    // Derived: the roster has changed size several times, and a literal here
    // goes stale. Compared as sets of ids, which is what catches the other
    // day's rows leaking in.
    const dayIds = await page.evaluate((d) =>
        DEFAULT_EXERCISES.filter((e) => e.day === d).map((e) => e.id).sort(), day);
    eq(w.exercises.map((e) => e.id).sort(), dayIds,
        `${label}: the workout carries exactly the ${dayIds.length} ${label} movements`);
    eq(w.exercises.filter((e) => RETIRED.includes(e.id)).map((e) => e.id), [],
        `${label}: no retired movement is written`);

    const t = w.exercises.find((e) => e.id === typed.id);
    const one = w.exercises.find((e) => e.id === oneTap.id);
    eq(t.weight, '145', `${label}: ${typed.name} logged the typed weight`);
    eq(t.reps, '4', `${label}: ${typed.name} logged the pre-filled reps (not NA/empty)`);
    // No starting weights since v25, so a never-logged card has none to capture.
    eq(one.weight, '', `${label}: one-tap LOG on a never-logged card saves a blank weight`);
    eq(one.reps, '4', `${label}: one-tap LOG captures the pre-filled reps`);

    // Every row took the standard arm: no cardio field leaked onto any of them.
    ok(!w.exercises.some((e) => e.time !== undefined || e.level !== undefined),
        `${label}: no row carries a cardio time/level field`);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        for (const d of DAYS) await logDay(page, d);

        eq(errors, [], 'no console errors during logging');
        console.log('PASS: an Anterior day and a Posterior day each log and persist their own rows.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
