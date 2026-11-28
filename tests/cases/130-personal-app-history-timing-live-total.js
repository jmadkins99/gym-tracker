// What this test covers
// ----------------------
// That the total on TODAY'S UNSUBMITTED History card (after the day label)
// reports time at the gym so far — first Weight Breakdown tap to now, ticking
// while the card is on screen — until 30 minutes pass with no log, and that
// every other day, including a submitted one from today, still ends at its
// last log.
//
// The point of the live total is a mid-workout glance: the last log can be
// several minutes stale by the time you look, and "how long until my last set"
// is not the question being asked. Submitting is what ends the session, so a
// submitted day must read exactly what it read before this existed — nothing
// is stored at tap time for it to be overridden by.
//
// The page's clock is frozen at noon today and moved only by the test, so the
// expected strings do not depend on the hour the suite runs at (or on running
// near midnight, where "40 minutes ago" would be yesterday).
//
//   1. Unsubmitted, today: 11:00 -> shown at 12:00 = "1h 0m so far".
//      Breaking the live branch reads "40m" (the last log, 11:40).
//   2. A minute later it reads "1h 1m so far" with no tap — it ticks. (The
//      card shows whole minutes, so the step is a minute.)
//   3. Past 30 minutes since the last log (12:11) it falls back to the last
//      log, "40m", with no "so far". Dropping the cutoff reads "1h 11m".
//   4. Submitted, today (a second seed, since a History card holds one session
//      and the in-progress day is today's): 07:00 -> 07:30 = "30m", with no
//      "so far". Dropping the `submitted` check reads a live figure.
//   5. The per-movement rows are the same either way — the live end moves the
//      total only.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, tap, waitFor } = require('../lib/browser');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { waitForDeckToSettle } = require('../lib/deck');
const { HISTORY_CARD, historyGoTo } = require('../lib/history');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

function todayAt(hour, min = 0) {
    const d = new Date();
    d.setHours(hour, min, 0, 0);
    return d;
}
const NOW = todayAt(12).getTime();
const iso = (hour, min) => todayAt(hour, min).toISOString();

const IN_PROGRESS = [
    { id: 'pecs-transverse-shoulder-adduction-with-elbow-extension', name: 'Chest Press', weight: '200', reps: '6',
      startedAt: iso(11, 0), loggedAt: iso(11, 20) },
    { id: 'pecs-transverse-shoulder-adduction', name: 'Chest Flies', weight: '165', reps: '6',
      startedAt: iso(11, 35), loggedAt: iso(11, 40) },
];

const SUBMITTED = [
    { id: 'pecs-transverse-shoulder-adduction-with-elbow-extension', name: 'Chest Press', weight: '195', reps: '6',
      startedAt: iso(7, 0), loggedAt: iso(7, 10) },
    { id: 'pecs-transverse-shoulder-adduction', name: 'Chest Flies', weight: '160', reps: '6',
      startedAt: iso(7, 25), loggedAt: iso(7, 30) },
];

// What the shown History card says about its session's time: the total after
// the day label (" · 58m", plus " so far" while live) and each row's M:SS.
function readTiming(page) {
    return page.evaluate((card) => {
        const root = document.querySelector(card);
        const totalEl = root.querySelector('[data-history-total]');
        const text = totalEl ? totalEl.textContent.replace(/^\s*·\s*/, '').trim() : null;
        return {
            live: !!text && / so far$/.test(text),
            total: text ? text.replace(/ so far$/, '') : null,
            rows: Array.from(root.querySelectorAll('[data-history-time]')).map(r => [
                r.getAttribute('data-history-time'),
                r.textContent.trim(),
            ]),
        };
    }, HISTORY_CARD);
}

// Reads the shown History card once its total is on screen (a card holds one
// session, so a day that needs both an in-progress and a submitted session
// gets its own seed).
async function openTiming(page) {
    await waitForDeckToSettle(page);
    await waitFor(page, 'the card total', (card) =>
        !!document.querySelector(card + ' [data-history-total]'), HISTORY_CARD);
    return readTiming(page);
}

// Move the page's clock on, then wait for the card's next tick to show it.
async function advanceTo(page, ms, expectedTotal) {
    await page.evaluate((ms) => window.__advanceClock(ms), ms);
    await page.waitForFunction((card, t) => {
        const el = document.querySelector(card + ' [data-history-total]');
        return !!el && el.textContent.replace(/^\s*·\s*/, '').replace(/ so far$/, '').trim() === t;
    }, { timeout: 8000 }, HISTORY_CARD, expectedTotal)
        .catch(async () => {
            const got = await readTiming(page);
            throw new Error(`total never reached ${JSON.stringify(expectedTotal)}; ` +
                `last read ${JSON.stringify(got.total)}`);
        });
    return readTiming(page);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);

        // Freeze the page's "now", movable only by __advanceClock; dates built
        // from a value are untouched.
        await page.evaluateOnNewDocument((fixed) => {
            const RealDate = Date;
            let offset = 0;
            class FrozenDate extends RealDate {
                constructor(...args) {
                    if (args.length === 0) super(fixed + offset);
                    else super(...args);
                }
                static now() { return fixed + offset; }
            }
            window.Date = FrozenDate;
            window.__advanceClock = (ms) => { offset += ms; };
        }, NOW);

        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        await seedPersonalApp(page, {
            workoutHistory: [
                workoutEntry({ date: iso(11, 0), day: 'full-body', submitted: false, exercises: IN_PROGRESS }),
            ],
        });
        await page.evaluate(() =>
            localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // History opens on today's card.
        await tap(page, '.bottom-nav-btn', { text: /History/ });
        await historyGoTo(page, new Date(NOW));

        // === 1. Today, unsubmitted: runs to now ==========================
        const live = await openTiming(page);
        eq(live.total, '1h 0m',
            'an unsubmitted day today runs from the first tap to now');
        ok(live.live, 'the live total says it is a running figure (so far)');
        eq(live.rows, [['pecs-transverse-shoulder-adduction-with-elbow-extension', '20:00'], ['pecs-transverse-shoulder-adduction', '5:00']],
            'the per-movement rows are unchanged by the live end');

        // === 2. It ticks while open ======================================
        // The card shows whole minutes, so tick a full minute.
        const ticked = await advanceTo(page, 60000, '1h 1m');
        ok(ticked.live, 'still live a minute on');

        // === 3. 30 minutes with no log: back to the last log =============
        // 12:01 + 10m = 12:11, which is 31m after the 11:40 log.
        const stale = await advanceTo(page, 10 * 60000, '40m');
        ok(!stale.live,
            'past 30 minutes with no log the total is the finished session again');

        // === 4. Today, submitted: ends at the last log ===================
        await seedPersonalApp(page, {
            workoutHistory: [workoutEntry({ date: iso(7, 0), day: 'full-body', exercises: SUBMITTED })],
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await tap(page, '.bottom-nav-btn', { text: /History/ });
        await historyGoTo(page, new Date(NOW));
        const done = await openTiming(page);
        eq(done.total, '30m',
            'a submitted day ends at its last log, whatever the time now');
        ok(!done.live, 'a finished session is not marked so far');
        eq(done.rows, [['pecs-transverse-shoulder-adduction-with-elbow-extension', '10:00'], ['pecs-transverse-shoulder-adduction', '5:00']],
            'the submitted day\'s rows are as logged');

        eq(errors.length, 0, `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: History total reads time so far mid-workout and the last log once submitted.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
