// What this test covers
// ----------------------
// "PRs Smashed" in the Day Breakdown modal, and specifically that it no longer
// congratulates the user for going backwards.
//
// The modal used to carry its own PR rule:
//
//     (currentWeight > previousWeight || currentReps > previousReps) && currentReps >= 4
//
// The `||` is the bug. A session at a LOWER weight scored a PR as long as the
// reps went up — and that is not a corner case anyone has to contrive. It is
// what the app's own plateau buster produces: after a sub-4-rep session,
// getPlateauBusterDecrement drops the weight by one increment, so the next
// session comes back lighter and, with the load reduced, at more reps. The
// modal then reported a PR for the session the app had just told the user to
// back off on.
//
// The fix is not a better rule here; it is deleting this rule. isImprovement in
// plateauLogic.js is the definition the flame streak badge already used, so the
// two could — and did — disagree about the same session. Both call it now.
//
// The fixture is built so the old and new rules give DIFFERENT counts (4 vs 3),
// because a fixture where both agree proves nothing. Chest Press is the
// plateau-buster recovery that used to count and must not; the other four rows
// pin that the count did not simply become zero.
//
// Lateral Raises covers the second half of the fix. Its most recent prior
// appearance is in an ABANDONED, never-submitted session at an absurd 999 lbs.
// The modal's baseline search had no `submitted` filter, so it compared against
// a day that never happened. With the filter it compares against the real 55 lb
// session and correctly reports a PR at 60.
//
// Mutation check: restore the `||` rule in DayBreakdownModal and this case
// fails with 4 instead of 3, and nothing else in the suite moves. Drop the
// `submitted` filter and it fails with 2.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { submitDay } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const dayOffset = (days, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};

// Two days ago, submitted: the real baseline for everything below.
const BASELINE = workoutEntry({
    date: dayOffset(-2, 9),
    day: 'anterior',
    submitted: true,
    // Chest Press was flagged a plateau buster here — 3 reps is a true failure,
    // which is exactly what makes the next session a deliberate weight drop.
    plateauBusters: ['chest-press'],
    exercises: [
        { id: 'chest-press', name: 'Chest Press', weight: '200', reps: '3' },
        { id: 'shoulder-press', name: 'Shoulder Press', weight: '120', reps: '4' },
        { id: 'chest-flies', name: 'Chest Flies', weight: '165', reps: '4' },
        { id: 'incline-chest-press', name: 'Incline Chest Press', weight: '110', reps: '5' },
        { id: 'lateral-raises', name: 'Lateral Raises', weight: '55', reps: '6' },
    ],
});

// Yesterday, NEVER SUBMITTED: a day that was started and walked away from. It
// is more recent than the baseline, so a search that ignores `submitted` picks
// this up as "last time" for Lateral Raises.
const ABANDONED = workoutEntry({
    date: dayOffset(-1, 9),
    day: 'anterior',
    submitted: false,
    exercises: [
        { id: 'lateral-raises', name: 'Lateral Raises', weight: '999', reps: '3' },
    ],
});

const TODAY = workoutEntry({
    date: dayOffset(0, 9),
    day: 'anterior',
    submitted: false,
    exercises: [
        // The plateau-buster recovery: lighter, at more reps. NOT a PR.
        { id: 'chest-press', name: 'Chest Press', weight: '195', reps: '6' },
        // Weight up. A PR under both rules.
        { id: 'shoulder-press', name: 'Shoulder Press', weight: '125', reps: '4' },
        // Same weight, more reps. A PR under both rules.
        { id: 'chest-flies', name: 'Chest Flies', weight: '165', reps: '5' },
        // Identical session. Not a PR under either rule.
        { id: 'incline-chest-press', name: 'Incline Chest Press', weight: '110', reps: '5' },
        // A PR against the real baseline (55), not against the abandoned 999.
        { id: 'lateral-raises', name: 'Lateral Raises', weight: '60', reps: '6' },
    ],
});

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [TODAY, ABANDONED, BASELINE] });
        await page.evaluate(() =>
            localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior');

        // Submit Day lives on the finish card at the end of the deck now, so
        // this walks there rather than searching the page for the button.
        await submitDay(page);
        await page.waitForSelector('[data-pr-count]', { timeout: 8000 });

        const prCount = await page.evaluate(() =>
            document.querySelector('[data-pr-count]').textContent.trim());
        eq(prCount, '3',
            'three PRs: weight up, reps up at the same weight, and one measured ' +
            'against the last REAL session — but not the plateau-buster recovery');

        // Name the rows individually, so a failure says which one moved rather
        // than only that the total is wrong.
        const verdicts = await page.evaluate(() => {
            const prev = {
                'chest-press': { weight: '200', reps: '3' },
                'shoulder-press': { weight: '120', reps: '4' },
                'chest-flies': { weight: '165', reps: '4' },
                'incline-chest-press': { weight: '110', reps: '5' },
                'lateral-raises': { weight: '55', reps: '6' },
            };
            const now = {
                'chest-press': { weight: '195', reps: '6' },
                'shoulder-press': { weight: '125', reps: '4' },
                'chest-flies': { weight: '165', reps: '5' },
                'incline-chest-press': { weight: '110', reps: '5' },
                'lateral-raises': { weight: '60', reps: '6' },
            };
            const out = {};
            for (const id of Object.keys(prev)) out[id] = isImprovement(now[id], prev[id]);
            return out;
        });

        eq(verdicts['chest-press'], false,
            'a weight DROP is not a PR, however many more reps came with it');
        eq(verdicts['shoulder-press'], true, 'a weight increase is a PR');
        eq(verdicts['chest-flies'], true, 'same weight with more reps is a PR');
        eq(verdicts['incline-chest-press'], false, 'an identical session is not a PR');
        eq(verdicts['lateral-raises'], true, 'a weight increase over the real baseline is a PR');

        // The badge and the count are now the same function. Chest Press has a
        // weight drop as its most recent move, so its streak must be absent —
        // if the modal ever counted it a PR again, these two would be saying
        // opposite things about one session.
        const streaks = await page.evaluate(() => {
            const history = JSON.parse(localStorage.getItem('gym-local:gymWorkoutHistory') || '[]');
            return {
                chestPress: getPRStreak('chest-press', history),
                shoulderPress: getPRStreak('shoulder-press', history),
            };
        });
        eq(streaks.chestPress, null,
            'no flame badge for the plateau-buster recovery — the badge agrees with the count');
        ok(streaks.shoulderPress >= 1,
            'the genuine PR does earn a flame badge, so the probe is not vacuous');

        eq(errors, [], 'no console errors');
        console.log('PASS: a weight drop is no longer scored as a PR, and the badge agrees.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
