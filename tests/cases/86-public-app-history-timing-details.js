// What this test covers
// ----------------------
// The ⏱️ beside a History entry's pencil in the PUBLIC app: which entries offer
// one, and that it reports its OWN entry's session rather than the newest.
//
// The Day Breakdown that pops on Submit Day only ever finds TODAY's workout, so
// without this button the per-movement numbers are visible for a few minutes on
// the day they were recorded and then invisible forever — saved, and unreadable.
//
// Two properties, and the second is the one a naive implementation gets wrong:
//
//   1. A workout with NO timestamps shows no ⏱️ at all. Every session Jessi has
//      logged to date is in that state, and history is never migrated, so this
//      is the normal case rather than an edge one. getSessionTiming returning
//      null is what hides the button — an implementation that renders it
//      unconditionally offers an empty modal.
//
//   2. The ⏱️ opens the timing of the entry it sits on. Both fixtures below are
//      in the same week and both render, so a handler that reaches for "today's
//      workout" the way the Day Breakdown does passes on entry 0 and fails on
//      entry 1.
//
// Also pins that the pencil still works. Her History entries find the edit
// button by position in `.history-date`; adding a sibling next to it is exactly
// the kind of change that breaks a selector quietly.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPublicApp, jessiDefaultSchedule, DEFAULT_NS } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { PUBLIC_APP_ROOT } = require('../lib/paths');
const { bottomNav } = require('../lib/deck');

// Two sessions in the current week: one carrying timestamps, one not.
const now = new Date();
const at = (hoursAgo, minutesAgo = 0) =>
    new Date(now.getTime() - hoursAgo * 3600000 - minutesAgo * 60000).toISOString();

const TIMED = [
    { id: 'ex-a', name: 'Chest Press', category: 'Push', type: 'standard',
      weight: '100', reps: '8',
      startedAt: at(3, 10), loggedAt: at(3, 4) },   // 6 minutes, measured
    { id: 'ex-b', name: 'Shoulder Press', category: 'Push', type: 'standard',
      weight: '60', reps: '8',
      loggedAt: at(3, 0) },                          // no anchor -> estimated
];

const UNTIMED = [
    { id: 'ex-a', name: 'Chest Press', category: 'Push', type: 'standard',
      weight: '95', reps: '7' },
    { id: 'ex-b', name: 'Shoulder Press', category: 'Push', type: 'standard',
      weight: '55', reps: '7' },
];

function config() {
    return {
        version: 2,
        days: {
            1: [
                { id: 'ex-a', name: 'Chest Press', category: 'Push', typeId: 'standard',
                  sets: 3, minReps: 5, maxReps: 8, order: 0, loadType: 'plate-two-sided' },
                { id: 'ex-b', name: 'Shoulder Press', category: 'Push', typeId: 'standard',
                  sets: 3, minReps: 5, maxReps: 8, order: 1, loadType: 'pin' },
            ],
            2: [
                { id: 'ex-c', name: 'Seated Row', category: 'Pull', typeId: 'standard',
                  sets: 3, minReps: 5, maxReps: 8, order: 0, loadType: 'pin' },
            ],
        },
        categories: ['Push', 'Pull'],
    };
}

const historyItems = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('.history-item')).map(item => ({
        icons: Array.from(item.querySelectorAll('.history-date button'))
            .map(b => b.textContent.trim()),
    })));

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
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        await seedPublicApp(page, {
            exerciseConfig: config(),
            schedule: jessiDefaultSchedule(),
            workoutHistory: [
                { date: at(3, 0), day: 1, week: 1, submitted: true,
                  plateauBusters: [], exercises: TIMED },
                { date: at(50, 0), day: 1, week: 1, submitted: true,
                  plateauBusters: [], exercises: UNTIMED },
            ],
        });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), DEFAULT_NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        await bottomNav(page, 'History');
        await page.waitForSelector('.history-item', { timeout: 8000 });

        // === 1. Which entries offer a stopwatch ========================
        const items = await historyItems(page);
        eq(items.length, 2, 'both workouts render in the current week');
        eq(items[0].icons, ['⏱️', '✏️'],
            'the timed workout offers a stopwatch before its pencil');
        eq(items[1].icons, ['✏️'],
            'a workout with no timestamps offers only a pencil — no stopwatch onto an ' +
            'empty modal, which is every session logged before this shipped');

        // === 2. It reports its own entry ===============================
        await clickIcon(page, 0, '⏱️');
        await page.waitForSelector('[data-timing-total]', { timeout: 8000 });

        const rows = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-timing-row]')).map(r => [
                r.getAttribute('data-timing-row'),
                r.textContent.trim(),
            ]));
        eq(rows.length, 2, 'both movements of that session are listed');
        eq(rows[0][0], 'ex-a', 'ordered by when they were logged');
        ok(/6:00/.test(rows[0][1]),
            `the measured movement reports its real span (got "${rows[0][1]}")`);
        ok(!/[*]/.test(rows[0][1]), 'and is not marked as an estimate');
        ok(/[*]/.test(rows[1][1]),
            `the un-anchored movement is marked with an asterisk (got "${rows[1][1]}")`);

        const footnote = await page.evaluate(() =>
            document.querySelector('[data-timing-details]').textContent);
        ok(/estimated/i.test(footnote),
            'and the asterisk is explained rather than left as a bare symbol');

        // Close it again.
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('.modal-btn'))
                .find(b => /close/i.test(b.textContent));
            if (btn) btn.click();
        });
        await page.waitForFunction(() => !document.querySelector('[data-timing-total]'),
            { timeout: 8000 });

        // === 3. The pencil still opens the editor ======================
        await clickIcon(page, 1, '✏️');
        await new Promise(r => setTimeout(r, 400));
        const editorOpen = await page.evaluate(() =>
            !!document.querySelector('.modal-overlay') &&
            !document.querySelector('[data-timing-total]'));
        ok(editorOpen,
            'the pencil still opens the edit modal — adding a sibling button next to it ' +
            'is exactly what breaks a positional selector');

        eq(errors, [], `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: History offers a stopwatch, and it reads its own entry.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
