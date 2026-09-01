// What this test covers
// ----------------------
// That a session's timing is still reachable AFTER the day it was logged.
//
// The stamps were never the problem: logExercise writes `startedAt`/`loggedAt`
// into the workout record at LOG time, so they are in localStorage and in
// Firestore before Complete Day is ever tapped (65 and 69 pin that). What was
// missing was any way to read them back. DayBreakdownModal finds the workout
// whose date is today and returns null for anything else, so the moment the day
// rolled over the numbers were invisible — saved, and unreadable. The ⏱️ beside
// each History entry's pencil is the second reader, and this case is what says
// it reads the workout that was TAPPED rather than today's.
//
// Three things, none of which the other timing cases can catch:
//
//   1. The ⏱️ opens the timing of ITS OWN entry. Both fixtures below are
//      submitted and neither is guaranteed to be today, so a modal that reached
//      for today's workout — the way the Day Breakdown does — renders nothing at
//      all here. That is the regression this case exists for.
//
//   2. A workout with no timestamps shows NO ⏱️. Every one of the ~124 real
//      pre-August-2026 workouts is in that state; history is never migrated, so
//      they will be forever. Offering a button that opens an empty modal on the
//      overwhelming majority of the user's history is the wrong failure.
//
//   3. The ✏️ still works from a header row that now holds two buttons. 21 and
//      22 find the pencil by `textContent.includes('✏️')`, which a ⏱️ sibling
//      does not disturb — but the assertion belongs somewhere explicit.
//
// The rows themselves are asserted against exact seeded timestamps, as in 66,
// not a wall clock. Every movement here is anchored or measured from the
// previous log, so `foregroundAt` is never consulted and the expected strings
// do not depend on the hour the suite runs at.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// Monday of the current week at a given hour, so both workouts land in the
// default History page (which opens on the current week) and neither can be a
// future date whenever in the week the suite runs.
function mondayAt(hour, min = 0) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    d.setHours(hour, min, 0, 0);
    return d;
}
const base = mondayAt(9);
const at = (min, sec = 0) => new Date(base.getTime() + min * 60000 + sec * 1000).toISOString();

const TIMED = [
    // Anchored: 09:00 -> 09:06 = 6:00.
    { id: 'chest-press', name: 'Chest Press', weight: '200', reps: '6',
      startedAt: at(0), loggedAt: at(6) },
    // Un-anchored, and not first: measured back to the previous log less the
    // two-minute allowance, 09:08 -> 09:14 = 6:00, and marked with an asterisk.
    // Its presence is also what renders the footnote.
    { id: 'incline-chest-press', name: 'Incline Chest Press', weight: '110', reps: '6',
      loggedAt: at(14) },
    // Anchored: 09:20 -> 09:25:30 = 5:30.
    { id: 'chest-flies', name: 'Chest Flies', weight: '165', reps: '6',
      startedAt: at(20), loggedAt: at(25, 30) },
];

const EXPECTED_ROWS = [
    ['chest-press', '6:00'],
    ['incline-chest-press', '6:00 *'],
    ['chest-flies', '5:30'],
];

// 09:00 -> 09:25:30. formatDuration floors to whole minutes under the hour.
const EXPECTED_TOTAL = '25m';

// The pre-August-2026 shape: logged, submitted, and carrying no stamps at all.
const UNTIMED = [
    { id: 'chest-press', name: 'Chest Press', weight: '190', reps: '5' },
    { id: 'chest-flies', name: 'Chest Flies', weight: '160', reps: '5' },
];

// One entry per workout, newest first, with which icon buttons its header row
// offers. The buttons are bare emoji with no class or data attribute, so they
// are read the same way cases 21 and 22 read the pencil.
async function historyItems(page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('.history-item')).map(item => ({
            heading: item.querySelector('.history-date')?.textContent?.trim() || '',
            icons: Array.from(item.querySelectorAll('.history-date button'))
                .map(b => b.textContent.trim()),
        })));
}

async function clickIcon(page, itemIndex, icon) {
    const clicked = await page.evaluate((i, ic) => {
        const item = document.querySelectorAll('.history-item')[i];
        if (!item) return false;
        const btn = Array.from(item.querySelectorAll('.history-date button'))
            .find(b => b.textContent.includes(ic));
        if (!btn) return false;
        btn.click();
        return true;
    }, itemIndex, icon);
    ok(clicked, `history item ${itemIndex} offers a ${icon} button to click`);
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
                workoutEntry({ date: mondayAt(7).toISOString(), day: 'anterior', exercises: UNTIMED }),
            ],
        });
        await page.evaluate(() =>
            localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('.bottom-nav-btn'))
                .find(b => b.textContent.indexOf('History') !== -1);
            if (btn) btn.click();
        });
        await page.waitForSelector('.history-item', { timeout: 8000 });

        // === 1. Which entries offer a stopwatch =========================
        const items = await historyItems(page);
        eq(items.length, 2, 'both workouts render in the current week');

        eq(items[0].icons, ['⏱️', '✏️'],
            'the timed workout offers a stopwatch before its pencil');
        eq(items[1].icons, ['✏️'],
            'a workout with no timestamps offers only a pencil — no stopwatch onto an empty modal');

        // === 2. The stopwatch reports the tapped workout's own session ===
        await clickIcon(page, 0, '⏱️');
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

        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('.modal-btn'))
                .find(b => b.textContent.trim() === 'Close');
            if (btn) btn.click();
        });
        await page.waitForFunction(() => !document.querySelector('[data-timing-total]'),
            { timeout: 8000 });

        // === 3. The pencil still works beside its new sibling ============
        await clickIcon(page, 0, '✏️');
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
