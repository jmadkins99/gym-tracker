// What this test covers
// ----------------------
// Editing a past check-in from the weight page's History tab, added September
// 2026. The first case in the suite to exercise the weight app at all — the
// two commits that built it noted that tests/cases covered none of it.
//
// The rule the page is built around is that no raw daily reading is scrollable
// after the day it was taken, and the edit affordance is a deliberate narrowing
// of it rather than a hole in it. So this case pins BOTH halves:
//
//   - History still opens with nothing raw on it. A week row is an average, a
//     delta and a count; the dailies exist only inside a week that has been
//     deliberately opened.
//   - Once opened, a reading can be corrected and deleted, and the aggregates
//     above it move to match.
//
// The fixture is three days of one fixed past week — 180.0 / 182.0 / 184.0,
// average 182.0 — chosen because every step's expected average is exact:
// correcting the 184.0 to 178.0 gives 180.0, and deleting it gives 181.0. A
// fixture whose averages carry a rounding error would make a real arithmetic
// regression indistinguishable from the last decimal place.
//
// It also pins the timestamps, which is the part most likely to be quietly
// broken by a later refactor that routes the edit through upsertEntry: the
// correction must KEEP the original `loggedAt` — when the scale was actually
// stood on is a fact a correction does not get to rewrite — and add `editedAt`
// beside it.
//
// Mutation checks: make WeekEntries render unconditionally and the "nothing
// raw on arrival" assertion fails; point onEditEntry at upsertEntry and the
// loggedAt assertion fails; drop the setLog inside persist and the weekly
// average stops moving.

const { start } = require('../lib/server');
const { launch, attachConsole, waitFor } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';

// A Monday and the two days after it, well in the past so nothing here depends
// on what today happens to be.
const LOGGED_AT = '2026-01-07T14:30:00.000Z';
const SEED_LOG = [
    { date: '2026-01-05', weight: 180.0, loggedAt: '2026-01-05T14:30:00.000Z' },
    { date: '2026-01-06', weight: 182.0, loggedAt: '2026-01-06T14:30:00.000Z' },
    { date: '2026-01-07', weight: 184.0, loggedAt: LOGGED_AT },
];

const readLog = (page) => page.evaluate((ns) =>
    JSON.parse(localStorage.getItem(ns + 'gymWeightLog') || '[]'), NS);

const weekAverage = (page) => page.evaluate(() =>
    parseFloat(document.querySelector('.weigh-week-avg').textContent));

const dayRows = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('.weigh-day')).map((row) => ({
        date: row.querySelector('.weigh-day-date').textContent.trim(),
        weight: row.querySelector('.weigh-day-value')
            ? parseFloat(row.querySelector('.weigh-day-value').textContent)
            : null,
    })));

// React's onChange listens for the native input event, and setting .value
// directly does not fire one — the same setter dance the workout cases use.
async function typeWeight(page, value) {
    await page.evaluate((v) => {
        const input = document.querySelector('.weigh-day-input');
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, v);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
}

const clickIn = (page, selector, text) => page.evaluate((sel, t) => {
    const btn = Array.from(document.querySelectorAll(sel))
        .find((b) => b.textContent.trim() === t);
    if (!btn) throw new Error('no ' + sel + ' reading "' + t + '"');
    btn.click();
}, selector, text);

// The value button carries a unit and a pencil glyph alongside the number, so
// it is matched on the reading it opens rather than on its whole label.
const openEditor = (page, weight) => page.evaluate((w) => {
    const btn = Array.from(document.querySelectorAll('.weigh-day-value'))
        .find((b) => parseFloat(b.textContent) === w);
    if (!btn) throw new Error('no day row showing ' + w);
    btn.click();
}, weight);

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);

        await page.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        await page.evaluate((ns, log) => {
            localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
            // The workbook seed would fold 918 days in on top of the fixture;
            // the sentinel is how a device says it has already been offered it.
            localStorage.setItem(ns + 'weightHistorySeeded', 'true');
            // A deliberately cleared plan, stored as literal null. Keeps the
            // plan dashboard out of the way of the ledger under test.
            localStorage.setItem(ns + 'gymWeightPlan', 'null');
        }, NS, SEED_LOG);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitFor(page, 'the check-in card to render',
            () => !!document.querySelector('.weigh-card'));

        // === 1. History arrives with nothing raw on it ===================
        await page.evaluate(() => {
            Array.from(document.querySelectorAll('.bottom-nav-btn'))
                .find((b) => b.textContent.includes('History')).click();
        });
        await waitFor(page, 'the weekly ledger to render',
            () => !!document.querySelector('.weigh-week'));

        eq(await weekAverage(page), 182.0, 'week row should average the three seeded readings');
        eq((await dayRows(page)).length, 0, 'no daily reading may be on screen before a week is opened');

        // === 2. Opening one week reveals its readings ====================
        await page.evaluate(() => document.querySelector('.weigh-week-head').click());
        await waitFor(page, 'the opened week to list its days',
            () => document.querySelectorAll('.weigh-day').length > 0);

        const rows = await dayRows(page);
        eq(rows.map((r) => r.weight), [184.0, 182.0, 180.0], 'days newest first');
        ok(rows[0].date.includes('Jan 7'), 'day rows carry their date, got: ' + rows[0].date);

        // === 3. Correcting a reading ====================================
        await openEditor(page, 184.0);
        await waitFor(page, 'the inline editor to open',
            () => !!document.querySelector('.weigh-day-input'));
        eq(await page.evaluate(() => document.querySelector('.weigh-day-input').value), '184.0',
           'the editor opens on the reading being corrected, not empty');

        await typeWeight(page, '178.0');
        await clickIn(page, '.weigh-day-btn', 'Save');
        await waitFor(page, 'the corrected reading to reach localStorage',
            (ns) => (JSON.parse(localStorage.getItem(ns + 'gymWeightLog') || '[]')
                .find((e) => e.date === '2026-01-07') || {}).weight === 178.0, NS);

        const corrected = (await readLog(page)).find((e) => e.date === '2026-01-07');
        eq(corrected.loggedAt, LOGGED_AT, 'a correction must not restamp when the scale was stood on');
        ok(corrected.editedAt, 'a correction stamps editedAt');
        eq(await weekAverage(page), 180.0, 'the weekly average follows the correction');
        eq((await dayRows(page)).map((r) => r.weight), [178.0, 182.0, 180.0],
           'the row shows the corrected number, and the week stays open around it');

        // === 4. Deleting a reading ======================================
        await page.evaluate(() => { window.confirm = () => true; });
        await openEditor(page, 178.0);
        await waitFor(page, 'the inline editor to open',
            () => !!document.querySelector('.weigh-day-input'));
        await clickIn(page, '.weigh-day-btn', 'Delete');
        await waitFor(page, 'the deleted day to leave localStorage',
            (ns) => JSON.parse(localStorage.getItem(ns + 'gymWeightLog') || '[]').length === 2, NS);

        eq((await readLog(page)).map((e) => e.date), ['2026-01-05', '2026-01-06'],
           'delete removes exactly the one day');
        eq(await weekAverage(page), 181.0, 'the weekly average follows the deletion');
        eq((await dayRows(page)).map((r) => r.weight), [182.0, 180.0], 'and so does the day list');

        // === 5. It survives a reload ====================================
        await page.reload({ waitUntil: 'networkidle0' });
        await waitFor(page, 'the check-in card to render after reload',
            () => !!document.querySelector('.weigh-card'));
        eq((await readLog(page)).map((e) => e.weight), [180.0, 182.0],
           'the edited log is what a reload loads');

        eq(errors, [], 'no console errors');
        console.log('PASS');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
