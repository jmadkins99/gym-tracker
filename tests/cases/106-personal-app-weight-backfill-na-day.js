// What this test covers
// ----------------------
// Filling in a morning that was never weighed, from the History ledger. Added
// Sep 2026, after a recovery in which a single missing day had to be patched
// into a JSON file by hand because the app offered no way to enter one: the
// week row showed "4/7 logged" and the three missing days simply were not on
// screen. Now every past day the week covers has a row, and a day without a
// reading shows NA and opens the same inline editor.
//
// Case 95 pins the correction path (edit and delete an existing reading). This
// is the third act on a day and it is deliberately not either of the other two,
// so the assertions are mostly about keeping them apart:
//
//   - A backfilled entry carries `addedAt` and NO `loggedAt`. loggedAt means
//     "when the scale was stood on", which for a morning already past is a fact
//     nobody has; stamping it with `now` would be exactly the lie that
//     editEntry refuses to tell when it leaves loggedAt alone on a correction.
//   - Filling a day in does NOT celebrate. The gold aura is for standing on the
//     scale, and this is the one case where that definitely did not happen.
//   - The aggregates move. A backfilled reading is a real member of the weekly
//     average — it is typed rather than witnessed, not fictional.
//
// Two days are deliberately NOT offered, and both are asserted here because
// both are easy to regress into an invitation to enter nonsense:
//   - days after today, which have not happened;
//   - days before the log's first reading, which predate the record.
//
// The fixture is Mon 2026-01-05 through Wed 2026-01-07 at 180/182/184, the same
// three days case 95 uses, inside a week whose remaining days are all in the
// past. That gives a week with three readings and four NA rows, and the
// arithmetic stays exact: adding 178 on the Thursday makes the average
// (180+182+184+178)/4 = 181.0.
//
// Mutation checks: have addEntry stamp loggedAt and the provenance assertion
// fails; route the NA row's Save through onEditEntry and nothing is written at
// all, because editEntry refuses to create a day; drop the todayKey filter in
// weekDaySlots and the future-day assertion fails.

const { start } = require('../lib/server');
const { launch, attachConsole, waitFor } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';

// A Monday and the two days after it, well in the past so nothing here depends
// on what today happens to be.
const SEED_LOG = [
    { date: '2026-01-05', weight: 180.0, loggedAt: '2026-01-05T14:30:00.000Z' },
    { date: '2026-01-06', weight: 182.0, loggedAt: '2026-01-06T14:30:00.000Z' },
    { date: '2026-01-07', weight: 184.0, loggedAt: '2026-01-07T14:30:00.000Z' },
];

const readLog = (page) => page.evaluate((ns) =>
    JSON.parse(localStorage.getItem(ns + 'gymWeightLog') || '[]'), NS);

const weekAverage = (page) => page.evaluate(() =>
    parseFloat(document.querySelector('.weigh-week-avg').textContent));

// Every row in the opened week, in render order, with what its value control
// reads. `na` is the distinguishing bit — a row with no reading.
const dayRows = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('.weigh-day')).map((row) => {
        const val = row.querySelector('.weigh-day-value');
        return {
            date: row.querySelector('.weigh-day-date').textContent.trim(),
            text: val ? val.textContent.trim() : null,
            na: !!(val && val.classList.contains('na')),
            badges: Array.from(row.querySelectorAll('.weigh-day-edited'))
                .map((b) => b.textContent.trim()),
        };
    }));

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

// Opens the NA row whose date label contains `label` (e.g. "Jan 8").
const openNa = (page, label) => page.evaluate((l) => {
    const row = Array.from(document.querySelectorAll('.weigh-day'))
        .find((r) => r.querySelector('.weigh-day-date').textContent.includes(l));
    if (!row) throw new Error('no day row for ' + l);
    const btn = row.querySelector('.weigh-day-value.na');
    if (!btn) throw new Error('row for ' + l + ' is not an NA row');
    btn.click();
}, label);

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
            localStorage.setItem(ns + 'weightHistorySeeded', 'true');
            localStorage.setItem(ns + 'gymWeightPlan', 'null');
        }, NS, SEED_LOG);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitFor(page, 'the check-in card to render',
            () => !!document.querySelector('.weigh-card'));

        await page.evaluate(() => {
            Array.from(document.querySelectorAll('.bottom-nav-btn'))
                .find((b) => b.textContent.includes('History')).click();
        });
        await waitFor(page, 'the weekly ledger to render',
            () => !!document.querySelector('.weigh-week'));
        await page.evaluate(() => document.querySelector('.weigh-week-head').click());
        await waitFor(page, 'the opened week to list its days',
            () => document.querySelectorAll('.weigh-day').length > 0);

        // === 1. The week shows all seven days, four of them NA ==========
        const rows = await dayRows(page);
        eq(rows.length, 7, 'the opened week lists every day it covers, not just its readings');
        eq(rows.filter((r) => r.na).length, 4, 'the four unweighed days show as NA');
        eq(rows.filter((r) => !r.na).map((r) => parseFloat(r.text)), [184, 182, 180],
           'the readings still render newest first, unchanged');
        ok(rows[0].date.includes('Jan 11'), 'newest first puts Sunday at the top, got: ' + rows[0].date);
        ok(rows[0].na, 'and Sunday is one of the NA rows');
        eq(await weekAverage(page), 182.0, 'NA rows do not touch the weekly average');

        // === 2. An NA row opens the same editor, but empty ==============
        await openNa(page, 'Jan 8');
        await waitFor(page, 'the inline editor to open on the NA row',
            () => !!document.querySelector('.weigh-day-input'));
        eq(await page.evaluate(() => document.querySelector('.weigh-day-input').value), '',
           'the editor opens empty — there is no prior reading to type over');
        eq(await page.evaluate(() =>
            Array.from(document.querySelectorAll('.weigh-day-btn')).map((b) => b.textContent.trim())),
           ['Save', 'Cancel'],
           'and offers no Delete: there is nothing yet to delete');

        // === 3. Saving writes a backfilled entry ========================
        await typeWeight(page, '178.0');
        await clickIn(page, '.weigh-day-btn', 'Save');
        await waitFor(page, 'the filled-in day to reach localStorage',
            (ns) => JSON.parse(localStorage.getItem(ns + 'gymWeightLog') || '[]').length === 4, NS);

        const added = (await readLog(page)).find((e) => e.date === '2026-01-08');
        ok(added, 'the day is created, which editEntry alone would never do');
        eq(added.weight, 178.0, 'with the weight that was typed');
        ok(added.addedAt, 'stamped addedAt — when it was filled in');
        eq(added.loggedAt, undefined,
           'and NO loggedAt: nobody knows when that morning was weighed, because it was not');
        eq(added.editedAt, undefined, 'nor editedAt — it was not a correction');

        // The other three are untouched, which is the half of the merge that a
        // careless implementation breaks.
        const untouched = (await readLog(page)).filter((e) => e.date !== '2026-01-08');
        eq(untouched.map((e) => e.loggedAt), SEED_LOG.map((e) => e.loggedAt),
           'the readings that were already there keep their own stamps');

        // === 4. The aggregates take it, and the row says how it got there
        eq(await weekAverage(page), 181.0,
           'a filled-in reading counts toward the weekly average: (180+182+184+178)/4');

        const afterRows = await dayRows(page);
        eq(afterRows.filter((r) => r.na).length, 3, 'one fewer NA row');
        const jan8 = afterRows.find((r) => r.date.includes('Jan 8'));
        eq(jan8.na, false, 'the filled day is a reading now');
        eq(jan8.badges, ['added'],
           'and is badged "added", so a typed weight is never passed off as a witnessed one');

        // === 5. It survives a reload ====================================
        await page.reload({ waitUntil: 'networkidle0' });
        await waitFor(page, 'the check-in card to render after reload',
            () => !!document.querySelector('.weigh-card'));
        const reloaded = (await readLog(page)).find((e) => e.date === '2026-01-08');
        eq(reloaded.weight, 178.0, 'the filled-in day is what a reload loads');

        // === 6. Days that could not have been weighed are not offered ===
        //
        // Both directions, in one probe: a log whose first reading is a
        // Wednesday must not offer the Monday and Tuesday before it, and the
        // week containing today must not offer tomorrow.
        const bounds = await page.evaluate(() => {
            const today = localDayKey(new Date());
            const d = parseDayKey(today);
            // Wednesday of a week is far enough in that both edges are testable.
            d.setDate(d.getDate() - ((d.getDay() + 4) % 7));
            const wed = localDayKey(d);
            const log = [{ date: wed, weight: 170 }];
            const weekStart = localDayKey(getMondayOfWeek(parseDayKey(wed)));
            const slots = weekDaySlots(log, weekStart, today);
            return { today, wed, weekStart, dates: slots.map((s) => s.date) };
        });
        ok(bounds.dates.every((d) => d <= bounds.today),
           'no slot is offered for a day after today, got: ' + bounds.dates.join(','));
        ok(bounds.dates.every((d) => d >= bounds.wed),
           'no slot is offered for a day before the log began, got: ' + bounds.dates.join(','));
        ok(bounds.dates.includes(bounds.wed), 'the first reading itself still gets a slot');

        eq(errors, [], 'no console errors');
        console.log('PASS');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
