// What this test covers
// ----------------------
// That a session's timing is still reachable AFTER the day it was logged.
//
// The stamps were never the problem: logExercise writes `startedAt`/`loggedAt`
// into the workout record at LOG time, so they are in localStorage and in
// Firestore before Complete Day is ever tapped (65 and 69 pin that). What was
// missing was any way to read them back. DayBreakdownModal finds the workout
// whose date is today and returns null for anything else, so the moment the day
// rolled over the numbers were invisible — saved, and unreadable. The Time button beside
// each History entry's pencil is the second reader, and this case is what says
// it reads the workout that was TAPPED rather than today's.
//
// Three things, none of which the other timing cases can catch:
//
//   1. The Time button opens the timing of ITS OWN entry. Both fixtures below are
//      submitted and neither is guaranteed to be today, so a modal that reached
//      for today's workout — the way the Day Breakdown does — renders nothing at
//      all here. That is the regression this case exists for.
//
//   2. A workout with no timestamps shows NO Time button. Every one of the ~124 real
//      pre-August-2026 workouts is in that state; history is never migrated, so
//      they will be forever. Offering a button that opens an empty modal on the
//      overwhelming majority of the user's history is the wrong failure.
//
//   3. The Edit button still works from a header row that now holds two buttons. 21 and
//      22 find the pencil by `textContent.trim() === 'Edit'`, which a Time sibling
//      does not disturb — but the assertion belongs somewhere explicit.
//
// The rows themselves are asserted against exact seeded timestamps, as in 66,
// not a wall clock. Every movement here is anchored or measured from the
// previous log, so `foregroundAt` is never consulted and the expected strings
// do not depend on the hour the suite runs at.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, tap } = require('../lib/browser');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { HISTORY_SESSION, dateKey, historyGoTo } = require('../lib/history');
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

const EXPECTED_ROWS = [
    ['pecs-transverse-shoulder-adduction-with-elbow-extension', '6:00'],
    ['pecs-shoulder-flexion', '6:00 *'],
    ['pecs-transverse-shoulder-adduction', '5:30'],
];

// 09:00 -> 09:25:30. formatDuration floors to whole minutes under the hour.
const EXPECTED_TOTAL = '25m';

// The pre-August-2026 shape: logged, submitted, and carrying no stamps at all.
const UNTIMED = [
    { id: 'pecs-transverse-shoulder-adduction-with-elbow-extension', name: 'Chest Press', weight: '190', reps: '5' },
    { id: 'pecs-transverse-shoulder-adduction', name: 'Chest Flies', weight: '160', reps: '5' },
];

// Which header buttons the session on the shown History card offers, read by
// their words (Time, Edit), the way cases 21 and 22 read Edit.
async function shownIcons(page) {
    return page.evaluate((session) => {
        const item = document.querySelector(session);
        return item ? Array.from(item.querySelectorAll('.history-date button'))
            .map(b => b.textContent.trim()) : null;
    }, HISTORY_SESSION);
}

async function clickIcon(page, icon) {
    await tap(page, HISTORY_SESSION + ' .history-date .text-btn', { text: icon });
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

        // === 1. Which entries offer a stopwatch =========================
        // History opens on today; visit each seeded session's date.
        const TIMED_DATE = dateKey(base);
        const UNTIMED_DATE = dateKey(daysAgoAt(3, 7));
        await historyGoTo(page, TIMED_DATE);
        eq(await shownIcons(page), ['Time', 'Edit'],
            'the timed workout offers a stopwatch before its pencil');
        await historyGoTo(page, UNTIMED_DATE);
        eq(await shownIcons(page), ['Edit'],
            'a workout with no timestamps offers only a pencil — no stopwatch onto an empty modal');

        // === 2. The stopwatch reports the tapped workout's own session ===
        await historyGoTo(page, TIMED_DATE);
        await waitForDeckToSettle(page); // a tap during the slide misses
        await clickIcon(page, 'Time');
        await page.waitForSelector('[data-timing-total]', { timeout: 8000 });

        eq(await page.evaluate(() =>
            document.querySelector('.modal-title').textContent.trim()),
            'Anterior Time Details',
            'the modal is titled for the workout that was tapped');

        eq(await page.evaluate(() =>
            document.querySelector('[data-timing-total]').textContent.trim()),
            EXPECTED_TOTAL,
            'the total runs from the first Weight Breakdown tap to the last log');

        // Details are expanded on open — the breakdown is the whole reason the
        // button was pressed.
        const rows = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-timing-row]')).map(r => [
                r.getAttribute('data-timing-row'),
                r.children[1].textContent.trim(),
            ]));
        eq(rows, EXPECTED_ROWS,
            'every movement is timed in logged order, with the estimate marked');

        ok(await page.evaluate(() =>
            /estimated/.test(document.querySelector('[data-timing-details]').textContent)),
            'the asterisk footnote renders alongside an estimated row');

        await tap(page, '.modal-btn', { text: 'Close' });
        await page.waitForFunction(() => !document.querySelector('[data-timing-total]'),
            { timeout: 8000 });

        // === 3. The pencil still works beside its new sibling ============
        await clickIcon(page, 'Edit');
        await page.waitForSelector('.modal input[data-field], .modal select[data-field]',
            { timeout: 8000 });
        ok(await page.evaluate(() =>
            /Edit/i.test(document.querySelector('.modal-title').textContent)),
            'the pencil still opens the Edit modal from a header row holding two buttons');

        eq(errors.length, 0, `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: History exposes a past session timing, and only where there is timing to show.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
