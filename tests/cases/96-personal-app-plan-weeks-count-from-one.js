// What this test covers
// ----------------------
// Plan weeks are numbered from 1, and a week's target is where the plan line
// arrives by the END of that week — the number to be at or under when it
// closes. September 2026, replacing the spreadsheet's week-0 convention.
//
// The old shape came from the sheet: a row 0 whose target was just the start
// weight, which made a 4-week plan five rows long and asked nothing of the week
// you actually started dieting. Two things had to move together, so both are
// pinned here:
//
//   - planRows yields exactly `plan.weeks` rows, numbered 1..N, the first
//     starting on the plan's own Monday.
//   - Week n's target is startWeight - rate*n, so week 1 already asks for a
//     week's loss and week N lands on the goal.
//
// The fixture is a 4-week plan at 2 lb/week from 180 to 170, started two
// Mondays ago, so today is week 3 and the arithmetic is exact at every row:
// 178 / 176 / 174 / 172. Week 4's target being 172 rather than the 170 goal is
// not a bug in the fixture — it is the rate and the goal disagreeing. The
// settings editor no longer lets a plan be SAVED that way (it solves for one of
// the three, see derivePlanField), but planRows still reads whatever the stored
// plan says, including a hand-edited import, and that is what is pinned here:
// the line comes off startWeight and ratePerWeek, never off goalWeight.
//
// Dates are computed inside the page rather than in node: the week bucket is a
// LOCAL Monday, and a fixture built in one timezone and bucketed in another
// lands the plan a week off roughly one run in seven.
//
// Mutation checks: start the planRows loop at 0 again and the row count and
// every weekStart fail; drop the +1 in planWeekNumber and both the week label
// and this week's target fail.

const { start } = require('../lib/server');
const { launch, attachConsole, waitFor } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq } = require('../lib/assert');

const NS = 'gym-local:';

const PLAN = {
    name: 'Test cut',
    startWeight: 180,
    goalWeight: 170,
    ratePerWeek: 2,
    weeks: 4,
};

// The card's "label: value" rows, keyed by label.
const planLines = (page) => page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.plan-line-row').forEach((row) => {
        const spans = row.querySelectorAll('span');
        out[spans[0].textContent.trim()] = spans[1].textContent.trim();
    });
    return out;
});

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);

        await page.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        const seeded = await page.evaluate((ns, plan) => {
            const pad = (n) => String(n).padStart(2, '0');
            const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const monday = new Date(today);
            monday.setDate(monday.getDate() + (monday.getDay() === 0 ? -6 : 1 - monday.getDay()));
            // Two Mondays back, which makes this week the plan's week 3.
            const startDate = new Date(monday);
            startDate.setDate(startDate.getDate() - 14);

            localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(
                [{ date: key(today), weight: 175, loggedAt: new Date().toISOString() }]));
            localStorage.setItem(ns + 'weightHistorySeeded', 'true');
            localStorage.setItem(ns + 'gymWeightPlan',
                JSON.stringify(Object.assign({ startDate: key(startDate) }, plan)));

            return { startDate: key(startDate), thisMonday: key(monday), today: key(today) };
        }, NS, PLAN);

        await page.reload({ waitUntil: 'networkidle0' });
        await waitFor(page, 'the check-in card to render',
            () => !!document.querySelector('.weigh-card'));

        // === 1. The ledger, directly ====================================
        // Cheaper than reading it off three surfaces, and it names the rule.
        const rows = await page.evaluate((ns) => {
            const log = JSON.parse(localStorage.getItem(ns + 'gymWeightLog'));
            const plan = JSON.parse(localStorage.getItem(ns + 'gymWeightPlan'));
            return {
                rows: planRows(plan, log).map((r) => ({
                    week: r.week, weekStart: r.weekStart, planWeight: r.planWeight,
                })),
                weekNumber: planWeekNumber(plan, JSON.parse(localStorage.getItem(ns + 'gymWeightLog'))[0].date),
            };
        }, NS);

        eq(rows.rows.map((r) => r.week), [1, 2, 3, 4], 'four weeks, numbered from 1');
        eq(rows.rows[0].weekStart, seeded.startDate, "week 1 starts on the plan's own Monday");
        eq(rows.rows.map((r) => r.planWeight), [178, 176, 174, 172],
           'week n targets startWeight - rate*n, so week 1 already asks for a week of loss');
        eq(rows.rows[2].weekStart, seeded.thisMonday, 'this week is week 3');
        eq(rows.weekNumber, 3, 'planWeekNumber counts from 1 on the starting Monday');

        // === 2. What the card says ======================================
        await page.evaluate(() => {
            Array.from(document.querySelectorAll('.bottom-nav-btn'))
                .find((b) => b.textContent.includes('History')).click();
        });
        await waitFor(page, 'the plan card to render',
            () => !!document.querySelector('.plan-week'));

        eq(await page.$eval('.plan-week', (el) => el.textContent.trim()), 'Week 3 of 4',
           'the card counts from 1');

        const lines = await planLines(page);
        eq(lines['Beat this week'], '174.0 lb', "this week's target is the one to beat by Sunday");

        // 175.0 actual against a 174.0 target: a pound left to beat, and the
        // wording says that rather than calling a mid-week reading "behind".
        eq(await page.$eval('.plan-gap', (el) => el.textContent.trim()), '1.0', 'gap to this week');
        eq(await page.$$eval('.finish-stat-label', (els) => els.map((e) => e.textContent.trim())),
           ['lb lost', 'to go', 'to beat'], 'the gap reads as something to beat');

        // === 3. And the weekly ledger ===================================
        eq(await page.$eval('.weigh-week-plan-tag', (el) => el.textContent.trim()), 'plan wk 3',
           'the history row for this week is tagged week 3, not week 2');

        eq(errors, [], 'no console errors');
        console.log('PASS');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
