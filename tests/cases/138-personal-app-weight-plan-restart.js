// What this test covers
// ----------------------
// Restarting a cut plan on the weight page, Oct 2026:
//
//   1. checkInCelebrates — the gold aura fires on a reading below the previous
//      one (within the plan, once started) or at/under the week's target. The
//      worked week is the one the rule was specified with.
//   2. fillGap — fills only the days with no entry, tags them `filled`, and
//      leaves existing readings alone.
//   3. The editor end to end: the start is a list of Mondays; moving it later
//      asks to fill the gap with the new start weight, through the day before
//      the new start, future days included; and History's "By week" shows only the plan's weeks, so a
//      plan with no readings yet shows none. Clearing the plan brings the
//      whole log back.

const { start } = require('../lib/server');
const { launch, attachConsole, waitFor } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok, contains } = require('../lib/assert');

const NS = 'gym-local:';

const clickButton = (page, text) => page.evaluate((t) => {
    Array.from(document.querySelectorAll('button'))
        .find((b) => b.textContent.includes(t)).click();
}, text);

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);
        await page.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        await page.waitForFunction(() => typeof checkInCelebrates === 'function');

        // === 1. The worked week =========================================
        // Week 1 target 165.0 (167 - 2). The week before is filled at 170.
        const week = await page.evaluate(() => {
            const plan = { startDate: '2026-11-02', startWeight: 167, goalWeight: 157, ratePerWeek: 2, weeks: 5 };
            let log = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']
                .map((date) => ({ date, weight: 170, filled: true }));
            const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
            const weights = [169, 168, 168, 165, 165, 164, 165];
            return days.map((day, i) => {
                const fires = checkInCelebrates(planProgress(plan, log, day), log, day, weights[i]);
                log = upsertEntry(log, day, weights[i]);
                return fires;
            });
        });
        eq(week, [false, true, false, true, true, true, true],
           'Mon 169 first of plan: no · Tue 168 drop · Wed 168 flat: no · Thu–Sun at/under 165');

        const other = await page.evaluate(() => {
            const log = [{ date: '2026-10-30', weight: 170 }];
            const future = { startDate: '2026-11-02', startWeight: 167, goalWeight: 157, ratePerWeek: 2, weeks: 5 };
            return {
                noPlanDrop: checkInCelebrates(null, log, '2026-10-31', 169.9),
                noPlanSame: checkInCelebrates(null, log, '2026-10-31', 170),
                beforeStartDrop: checkInCelebrates(planProgress(future, log, '2026-10-31'), log, '2026-10-31', 169),
                beforeStartUnderTarget: checkInCelebrates(planProgress(future, log, '2026-10-31'), log, '2026-10-31', 171),
            };
        });
        eq(other, { noPlanDrop: true, noPlanSame: false, beforeStartDrop: true, beforeStartUnderTarget: false },
           'without a started plan only a drop counts, against the previous reading');

        // === 2. fillGap =================================================
        const filled = await page.evaluate(() => fillGap(
            [{ date: '2026-09-08', weight: 171, loggedAt: '2026-09-08T12:00:00.000Z' }],
            '2026-09-07', '2026-09-10', 170));
        eq(filled.map((e) => [e.date, e.weight, !!e.filled]),
           [['2026-09-07', 170, true], ['2026-09-08', 171, false], ['2026-09-09', 170, true], ['2026-09-10', 170, true]],
           'only the empty days are filled, and they are tagged');
        ok(filled.filter((e) => e.filled).every((e) => !e.loggedAt && e.addedAt),
           'a filled day carries addedAt, never loggedAt');

        // === 3. The editor, end to end ==================================
        // Old plan started 8 Mondays ago with readings only in its first week;
        // the new start is 2 Mondays ahead. Built in-page so the Mondays are
        // local ones.
        const seeded = await page.evaluate((ns) => {
            const pad = (n) => String(n).padStart(2, '0');
            const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
            const shift = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const monday = shift(today, today.getDay() === 0 ? -6 : 1 - today.getDay());
            const oldStart = shift(monday, -56);
            const newStart = shift(monday, 14);
            const log = [0, 1, 2].map((n) => ({ date: key(shift(oldStart, n)), weight: 180 - n,
                                               loggedAt: shift(oldStart, n).toISOString() }));
            localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
            localStorage.setItem(ns + 'weightHistorySeeded', 'true');
            localStorage.setItem(ns + 'gymWeightPlan', JSON.stringify({
                name: 'Old cut', startDate: key(oldStart), startWeight: 180, goalWeight: 160,
                ratePerWeek: 2, weeks: 10, solveFor: 'weeks' }));
            return { oldStart: key(oldStart), newStart: key(newStart),
                     dayBefore: key(shift(newStart, -1)), today: key(today), readings: log.length };
        }, NS);

        await page.reload({ waitUntil: 'networkidle0' });
        await waitFor(page, 'the check-in card', () => !!document.querySelector('.weigh-card'));

        await page.click('.settings-btn');
        await waitFor(page, 'settings', () => !!document.querySelector('.modal-title'));
        await clickButton(page, 'Edit plan');
        await waitFor(page, 'the plan editor', () => !!document.querySelector('.plan-field select'));

        const options = await page.$$eval('.plan-field select option', (os) => os.map((o) => o.value));
        ok(options.length > 50 && options.every((k) => {
            const [y, m, d] = k.split('-').map(Number);
            return new Date(y, m - 1, d).getDay() === 1;
        }), `the start offers Mondays only (${options.length} of them)`);
        eq(await page.$eval('.plan-field select', (s) => s.value), seeded.oldStart,
           'and opens on the saved start');

        await page.select('.plan-field select', seeded.newStart);
        const startWeight = await page.evaluateHandle(() =>
            Array.from(document.querySelectorAll('.plan-field'))
                .find((r) => r.querySelector('.plan-field-label').textContent.trim() === 'Start weight')
                .querySelector('input'));
        await startWeight.click({ clickCount: 3 });
        await startWeight.press('Backspace');
        await startWeight.type('172');

        const dialogs = [];
        page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
        await clickButton(page, 'Save plan');
        await waitFor(page, 'the editor to close', () => !document.querySelector('.plan-solve'));

        const expected = await page.evaluate((s) =>
            'Your plan now starts ' + formatMonthDay(s.newStart) + ' instead of ' + formatMonthDay(s.oldStart)
            + '. Fill every unlogged day from ' + formatMonthDay(s.oldStart) + ' to '
            + formatMonthDay(s.dayBefore) + ' with 172.0 lb?', seeded);
        eq(dialogs, [expected], 'one prompt, naming both starts, the range and the weight');

        const after = await page.evaluate((ns) => JSON.parse(localStorage.getItem(ns + 'gymWeightLog')), NS);
        const days = Math.round((new Date(seeded.dayBefore) - new Date(seeded.oldStart)) / 86400000) + 1;
        eq(after.length, days, 'every day from the old start through the day before the new start has an entry');
        eq(after[after.length - 1].date, seeded.dayBefore, 'today and the future days up to the start included');
        eq(after.filter((e) => e.filled).length, days - seeded.readings, 'the gaps are the filled ones');
        ok(after.filter((e) => e.filled).every((e) => e.weight === 172), 'all at the new start weight');

        await clickButton(page, 'Close');
        await clickButton(page, 'History');
        await waitFor(page, 'History', () => !!document.querySelector('.weigh-chart-card'));
        const ledger = await page.evaluate(() => ({
            title: Array.from(document.querySelectorAll('.section-title')).some((t) => t.textContent === 'By week'),
            rows: document.querySelectorAll('.weigh-week:not(.projected)').length,
        }));
        eq(ledger, { title: false, rows: 0 }, 'a plan with no readings yet shows no week history');

        // Cleared, there is no plan, so the whole log is back.
        await page.click('.settings-btn');
        await waitFor(page, 'settings', () => !!document.querySelector('.modal-title'));
        await clickButton(page, 'Clear plan');
        await clickButton(page, 'Close');
        const all = await page.evaluate(() => document.querySelectorAll('.weigh-week:not(.projected)').length);
        ok(all >= 8, `without a plan every week shows (${all})`);
        contains(await page.evaluate(() => document.body.textContent), 'By week', 'under its heading');

        eq(errors, [], 'no console errors');
        console.log('PASS: plan restart — flash rule, gap fill, plan-only ledger.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
