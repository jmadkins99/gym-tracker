// What this test covers
// ----------------------
// The Day Breakdown that opens on Submit Day describes the session just
// submitted, not the day the deck moved on to.
//
// Since v28 (#24), completeDay moves the deck to the other day (showDay) and
// then opens the modal. The modal took its roster from getCurrentExercises(),
// which reads the ACTIVE day, and by then that was the next day. Submitting a
// Posterior session filtered its rows against the Anterior roster, so nothing
// matched: "0 / 11", "PRs Smashed 0", and no flame badge on the row that was a
// PR. The timing rows still listed Recline and Preacher Curls, because
// getSessionTiming reads the workout directly, which is what made the
// screenshot look half right. The 11 was Anterior's count, which happens to
// equal Posterior's.
//
// The modal now takes its roster from the session's own `day`.
//
// The session is logged through the deck, not seeded, because the bug needs
// the real Submit Day path: a seeded, already-submitted day never runs
// showDay. Recline Curls goes up in weight (a PR), and Preacher Curls drops
// reps at the same weight (not a PR), so the expected count is exactly 1. A
// count that came out as "everything" or "nothing" fails either way.
//
// Mutation check: give DayBreakdownModal's roster back to getCurrentExercises
// and this fails with 0 / 11 and 0 PRs.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { selectDeckDay, setWeightAndOpen, logCard, submitDay } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const RECLINE = 'biceps-elbow-flexion-with-shoulder-extension';
const PREACHER = 'biceps-elbow-flexion-with-shoulder-flexion';

const daysAgo = (days) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
};

// Made-up baseline: a Posterior session two days ago.
const BASELINE = workoutEntry({
    date: daysAgo(2),
    day: 'posterior-2',
    exercises: [
        { id: RECLINE, name: 'Recline Curls', weight: '50', reps: '6' },
        { id: PREACHER, name: 'Preacher Curls', weight: '40', reps: '6' },
    ],
});

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [BASELINE] });
        await page.evaluate(() =>
            localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // Posterior was the last session, so the app would open on Anterior;
        // pick Posterior by hand, as Josh did.
        await selectDeckDay(page, 'posterior-2');

        // Weight up from 50: a PR.
        await setWeightAndOpen(page, 'Recline Curls', 55);
        ok(await logCard(page), 'logged Recline Curls');
        // Same 40 lbs, fewer reps than last time's 6: not a PR.
        await setWeightAndOpen(page, 'Preacher Curls', 40);
        ok(await logCard(page), 'logged Preacher Curls');

        const logged = await page.evaluate((r, p) => {
            const today = JSON.parse(localStorage.getItem('gym-local:gymWorkoutHistory'))[0];
            const find = (id) => today.exercises.find((e) => e.id === id);
            return { day: today.day, recline: find(r), preacher: find(p) };
        }, RECLINE, PREACHER);
        eq(logged.day, 'posterior-2', "today's session is a Posterior session");
        eq(logged.recline.weight, '55', 'Recline Curls logged at 55');
        eq(logged.preacher.weight, '40', 'Preacher Curls logged at 40');
        ok(parseInt(logged.preacher.reps, 10) < 6,
            'Preacher Curls logged under 6 reps, so it is not a PR (fixture sanity)');

        ok(await submitDay(page), 'pressed Submit Day');
        await page.waitForSelector('[data-pr-count]', { timeout: 8000 });

        const modal = await page.evaluate(() => {
            const m = document.querySelector('[data-pr-count]').closest('.modal');
            const text = m.innerText;
            const completed = /Exercises Completed\s*(\d+)\s*\/\s*(\d+)/.exec(text);
            return {
                title: m.querySelector('.modal-title').textContent.trim(),
                completed: completed ? completed[1] : null,
                total: completed ? completed[2] : null,
                prs: m.querySelector('[data-pr-count]').textContent.trim(),
                badgeRows: Array.from(m.querySelectorAll('[data-day-breakdown-pr-badge]'))
                    .map((b) => b.closest('[data-timing-row]').getAttribute('data-timing-row')),
            };
        });

        eq(modal.title, 'Posterior Day Breakdown', 'the modal is about the Posterior session');
        eq(modal.completed, '2', 'both logged exercises count as completed');
        eq(modal.total, '11', 'out of the Posterior roster of 11');
        eq(modal.prs, '1', 'Recline Curls is a PR; Preacher Curls is not');
        eq(modal.badgeRows, [RECLINE], 'the flame badge sits on Recline Curls, and only there');

        eq(errors, [], 'no console errors');
        console.log('PASS: the Day Breakdown reads the submitted day, not the day the deck moved on to.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
