// What this test covers
// ----------------------
// That a session's timing is still reachable AFTER the day it was logged.
//
// The stamps were never the problem: logExercise writes `startedAt`/`loggedAt`
// into the workout record at LOG time, so they are in localStorage and in
// Firestore before Complete Day is ever tapped (65 and 69 pin that). What was
// missing was any way to read them back. DayBreakdownModal finds the workout
// whose date is today and returns null for anything else, so the moment the day
// rolled over the numbers were invisible — saved, and unreadable. Each History
// card is the second reader: the session's total sits after its day label and
// each movement's time under its weight and reps. This case is what says a
// card reads ITS OWN session rather than today's.
//
// Three things, none of which the other timing cases can catch:
//
//   1. A card shows the timing of its own session. Both fixtures below are
//      submitted and neither is today, so a card that reached for today's
//      workout — the way the Day Breakdown does — shows no times at all here.
//      That is the regression this case exists for.
//
//   2. A workout with no timestamps shows NO total and NO row times. Every one
//      of the ~124 real pre-August-2026 workouts is in that state; history is
//      never migrated, so they will be forever. Filling the overwhelming
//      majority of the user's history with "0m" or NA times is the wrong
//      failure.
//
//   3. The Edit gear still opens the Edit modal from a card carrying times.
//
// The rows themselves are asserted against exact seeded timestamps, as in 66,
// not a wall clock. Every movement here is anchored or measured from the
// previous log, so `foregroundAt` is never consulted and the expected strings
// do not depend on the hour the suite runs at.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, tap, waitFor } = require('../lib/browser');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { HISTORY_SESSION, HISTORY_EDIT, dateKey, historyGoTo } = require('../lib/history');
const { waitForDeckToSettle } = require('../lib/deck');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// A past date at a given hour: the timed workout two days ago, the untimed one
// three days ago. Each gets its own History card (one session per date), and
// neither can be a future date whenever the suite runs.
function daysAgoAt(daysAgo, hour, min = 0) {
    const d = new Date();
    d.setHours(hour, min, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return d;
}
const base = daysAgoAt(2, 9);
const at = (min, sec = 0) => new Date(base.getTime() + min * 60000 + sec * 1000).toISOString();

const TIMED = [
    // Anchored: 09:00 -> 09:06 = 6:00.
    { id: 'pecs-transverse-shoulder-adduction-with-elbow-extension', name: 'Chest Press', weight: '200', reps: '6',
      startedAt: at(0), loggedAt: at(6) },
    // Un-anchored, and not first: measured back to the previous log less the
    // two-minute allowance, 09:08 -> 09:14 = 6:00, and marked with an asterisk.
    // Its presence is also what renders the footnote.
    { id: 'pecs-shoulder-flexion', name: 'Low to High Flies', weight: '110', reps: '6',
      loggedAt: at(14) },
    // Anchored: 09:20 -> 09:25:30 = 5:30.
    { id: 'pecs-transverse-shoulder-adduction', name: 'Chest Flies', weight: '165', reps: '6',
      startedAt: at(20), loggedAt: at(25, 30) },
];

// Keyed by id: the card lists rows in the day's order, not the logged order.
const EXPECTED_ROWS = {
    'pecs-transverse-shoulder-adduction-with-elbow-extension': '6:00',
    'pecs-shoulder-flexion': '6:00 *',
    'pecs-transverse-shoulder-adduction': '5:30',
};

// 09:00 -> 09:25:30. formatDuration floors to whole minutes under the hour.
const EXPECTED_TOTAL = '25m';

// The pre-August-2026 shape: logged, submitted, and carrying no stamps at all.
const UNTIMED = [
    { id: 'pecs-transverse-shoulder-adduction-with-elbow-extension', name: 'Chest Press', weight: '190', reps: '5' },
    { id: 'pecs-transverse-shoulder-adduction', name: 'Chest Flies', weight: '160', reps: '5' },
];

// What the session on the shown History card says about its time: the day
// label, the total after it, each row's M:SS, the footnote, and whether the
// Edit gear is there.
async function readCardTiming(page) {
    return page.evaluate((session) => {
        const item = document.querySelector(session);
        if (!item) return null;
        const label = item.querySelector('.history-day-label');
        const total = item.querySelector('[data-history-total]');
        const note = item.querySelector('.history-time-note');
        return {
            label: label ? label.firstChild.textContent.trim() : null,
            total: total ? total.textContent.replace(/^\s*·\s*/, '').trim() : null,
            rows: Object.fromEntries(Array.from(item.querySelectorAll('[data-history-time]')).map(r => [
                r.getAttribute('data-history-time'),
                r.textContent.trim(),
            ])),
            note: note ? note.textContent.trim() : null,
            edit: !!item.querySelector('[aria-label="Edit workout"]'),
        };
    }, HISTORY_SESSION);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        await seedPersonalApp(page, {
            workoutHistory: [
                workoutEntry({ date: at(25, 30), day: 'anterior', exercises: TIMED }),
                workoutEntry({ date: daysAgoAt(3, 7).toISOString(), day: 'anterior', exercises: UNTIMED }),
            ],
        });
        await page.evaluate(() =>
            localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        await tap(page, '.bottom-nav-btn', { text: /History/ });

        // History opens on today; visit each seeded session's date.
        const TIMED_DATE = dateKey(base);
        const UNTIMED_DATE = dateKey(daysAgoAt(3, 7));

        // === 1. The card reports its own session's timing ================
        await historyGoTo(page, TIMED_DATE);
        const timed = await readCardTiming(page);
        eq(timed.label, 'Anterior',
            'the total sits after the day label of the workout on the card');
        eq(timed.total, EXPECTED_TOTAL,
            'the total runs from the first Weight Breakdown tap to the last log');
        eq(timed.rows, EXPECTED_ROWS,
            'every movement shows its time under its weight and reps, with the estimate marked');
        ok(timed.note && /estimated/.test(timed.note),
            'the asterisk footnote renders alongside an estimated row');

        // === 2. An untimed workout shows no times at all =================
        await historyGoTo(page, UNTIMED_DATE);
        const untimed = await readCardTiming(page);
        eq(untimed.total, null,
            'a workout with no timestamps shows no total after its day label');
        eq(untimed.rows, {}, 'and no row times');
        eq(untimed.note, null, 'and no footnote');
        ok(untimed.edit, 'it still offers the Edit gear');

        // === 3. The gear opens Edit on the timed card ===================
        await historyGoTo(page, TIMED_DATE);
        await waitForDeckToSettle(page); // a tap during the slide misses
        await tap(page, HISTORY_EDIT);
        await waitFor(page, 'the edit modal', () =>
            !!document.querySelector('.modal input[data-field], .modal select[data-field]'));
        ok(await page.evaluate(() =>
            /Edit/i.test(document.querySelector('.modal-title').textContent)),
            'the gear opens the Edit modal from a card carrying times');

        eq(errors.length, 0, `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: History cards show a past session timing, and only where there is timing to show.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
