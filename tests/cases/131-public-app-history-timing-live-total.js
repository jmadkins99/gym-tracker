// What this test covers
// ----------------------
// Case 130 for the PUBLIC app: the History ⏱️ on TODAY'S UNSUBMITTED day
// reports time at the gym so far — first Weight Breakdown tap to now, ticking
// while the modal is open — until 30 minutes pass with no log, and every other
// day, including a submitted one from today, still ends at its last log.
//
// The two apps carry their own copies of getSessionTiming and
// TimeDetailsModal, so the personal app's case says nothing about this one.
// The page's clock is frozen at noon today and moved only by the test, so the
// expected strings do not depend on the hour the suite runs at.
//
//   1. Unsubmitted, today: 11:00 -> tapped at 12:00 = "1h 0m 0s", titled
//      "So Far". Breaking the live branch reads "40m" (the last log, 11:40).
//   2. Five seconds later it reads "1h 0m 5s" without reopening — it ticks.
//   3. Past 30 minutes since the last log (12:10:06) it falls back to the
//      last log, "40m", titled plainly. Dropping the cutoff reads "1h 10m 6s".
//   4. Submitted, today: 07:00 -> 07:30 = "30m", titled plainly. Dropping the
//      `submitted` check reads a live figure.
//   5. The per-movement rows are the same either way — the live end moves the
//      total only.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPublicApp, jessiDefaultSchedule, DEFAULT_NS } = require('../lib/state');
const { eq } = require('../lib/assert');
const { PUBLIC_APP_ROOT } = require('../lib/paths');
const { bottomNav } = require('../lib/deck');

function todayAt(hour, min = 0) {
    const d = new Date();
    d.setHours(hour, min, 0, 0);
    return d;
}
const NOW = todayAt(12).getTime();
const iso = (hour, min) => todayAt(hour, min).toISOString();

const IN_PROGRESS = [
    { id: 'ex-a', name: 'Chest Press', category: 'Push', type: 'standard',
      weight: '200', reps: '6', startedAt: iso(11, 0), loggedAt: iso(11, 20) },
    { id: 'ex-b', name: 'Chest Flies', category: 'Push', type: 'standard',
      weight: '165', reps: '6', startedAt: iso(11, 35), loggedAt: iso(11, 40) },
];

const SUBMITTED = [
    { id: 'ex-a', name: 'Chest Press', category: 'Push', type: 'standard',
      weight: '195', reps: '6', startedAt: iso(7, 0), loggedAt: iso(7, 10) },
    { id: 'ex-b', name: 'Chest Flies', category: 'Push', type: 'standard',
      weight: '160', reps: '6', startedAt: iso(7, 25), loggedAt: iso(7, 30) },
];

function config() {
    return {
        version: 2,
        days: {
            1: [
                { id: 'ex-a', name: 'Chest Press', category: 'Push', typeId: 'standard',
                  sets: 1, minReps: 6, maxReps: 8, order: 0, loadType: 'plate-two-sided' },
                { id: 'ex-b', name: 'Chest Flies', category: 'Push', typeId: 'standard',
                  sets: 1, minReps: 6, maxReps: 8, order: 1, loadType: 'pin' },
            ],
        },
        categories: ['Push'],
    };
}

function readTiming(page) {
    return page.evaluate(() => ({
        label: document.querySelector('[data-timing-total]').previousElementSibling.textContent.trim(),
        total: document.querySelector('[data-timing-total]').textContent.trim(),
        rows: Array.from(document.querySelectorAll('[data-timing-row]')).map(r => [
            r.getAttribute('data-timing-row'),
            r.children[1].textContent.trim(),
        ]),
    }));
}

async function openTiming(page, itemIndex) {
    await page.evaluate((i) => {
        const item = document.querySelectorAll('.history-item')[i];
        const btn = Array.from(item.querySelectorAll('.history-date button'))
            .find(b => b.textContent.includes('⏱️'));
        btn.click();
    }, itemIndex);
    await page.waitForSelector('[data-timing-total]', { timeout: 8000 });
    return readTiming(page);
}

// Move the page's clock on, then wait for the modal's next tick to show it.
async function advanceTo(page, ms, expectedTotal) {
    await page.evaluate((ms) => window.__advanceClock(ms), ms);
    await page.waitForFunction((t) =>
        document.querySelector('[data-timing-total]').textContent.trim() === t,
        { timeout: 8000 }, expectedTotal)
        .catch(async () => {
            const got = await readTiming(page);
            throw new Error(`total never reached ${JSON.stringify(expectedTotal)}; ` +
                `last read ${JSON.stringify(got.total)}`);
        });
    return readTiming(page);
}

async function closeTiming(page) {
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('.modal-btn'))
            .find(b => b.textContent.trim() === 'Close');
        btn.click();
    });
    await page.waitForFunction(() => !document.querySelector('[data-timing-total]'),
        { timeout: 8000 });
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
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

        await seedPublicApp(page, {
            exerciseConfig: config(),
            schedule: jessiDefaultSchedule(),
            workoutHistory: [
                { date: iso(11, 0), day: 1, week: 1, submitted: false,
                  plateauBusters: [], exercises: IN_PROGRESS },
                { date: iso(7, 0), day: 1, week: 1, submitted: true,
                  plateauBusters: [], exercises: SUBMITTED },
            ],
        });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), DEFAULT_NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        await bottomNav(page, 'History');
        await page.waitForSelector('.history-item', { timeout: 8000 });

        const headings = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.history-item .history-date'))
                .map(h => h.textContent));
        eq(headings.length, 2, 'both of today\'s workouts render');

        // === 1. Today, unsubmitted: runs to now ==========================
        const live = await openTiming(page, 0);
        eq(live.total, '1h 0m 0s',
            'an unsubmitted day today runs from the first tap to now');
        eq(live.label, 'Time at the Gym So Far',
            'the live total says it is a running figure');
        eq(live.rows, [['ex-a', '20:00'], ['ex-b', '5:00']],
            'the per-movement rows are unchanged by the live end');

        // === 2. It ticks while open ======================================
        const ticked = await advanceTo(page, 5000, '1h 0m 5s');
        eq(ticked.label, 'Time at the Gym So Far', 'still live five seconds on');

        // === 3. 30 minutes with no log: back to the last log =============
        // 12:00:05 + 10m01s = 12:10:06, which is 30m06s after the 11:40 log.
        const stale = await advanceTo(page, 10 * 60000 + 1000, '40m');
        eq(stale.label, 'Time at the Gym',
            'past 30 minutes with no log the total is the finished session again');
        await closeTiming(page);

        // === 4. Today, submitted: ends at the last log ===================
        const done = await openTiming(page, 1);
        eq(done.total, '30m',
            'a submitted day ends at its last log, whatever the time now');
        eq(done.label, 'Time at the Gym',
            'a finished session is titled plainly');
        eq(done.rows, [['ex-a', '10:00'], ['ex-b', '5:00']],
            'the submitted day\'s rows are as logged');
        await closeTiming(page);

        eq(errors.length, 0, `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: public-app History ⏱️ reads time so far mid-workout and the last log once submitted.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
