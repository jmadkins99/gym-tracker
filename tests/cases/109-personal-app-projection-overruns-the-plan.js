// What this test covers
// ----------------------
// The Projected Weight rows no longer stop at the plan's last week. A plan you
// are behind on does not finish in week 6 — it finishes in week 6 with pounds
// still on — so the projection keeps numbering past the plan's length (wk 7,
// wk 8) until the line reaches the goal, and the count of those extra rows is
// the size of the shortfall stated in weeks.
//
// Four things have to hold, and this case pins each:
//
//   - The overrun rows exist at all, and stop on the goal rather than running
//     past it. Numbering continues from the plan's last week with no gap and no
//     repeated Monday.
//   - They are labelled "wk N", not "plan wk N" — there is no plan week N to
//     name — and they carry the `overrun` class the amber border hangs off. The
//     week the goal lands keeps its `goal` marker even when it is one of them.
//   - Their target is the GOAL WEIGHT, not the plan line extended past its end.
//     The line had nothing left to ask for; the goal is what is left.
//   - The overrun is capped at 12 weeks past the plan. Past that the drawing
//     stops but the answer does not: the last row names the week the goal
//     actually lands ("goal ~wk 27") instead of drawing fifteen more rows.
//
// Fixture one: a 6-week plan, 180.0 at 2.5 lb/wk to a 165.0 goal, anchored so
// week 5 is the week in progress. Four logged weeks average 176/175/174/173, so
// the achieved rate is exactly -1.0 lb/wk against the 2.5 asked for — behind by
// construction. Projecting -1.0 off week 4's 173.0 gives 172.0 for week 5,
// 171.0 for week 6 (the plan's last, which wanted 165.0), and then the overrun:
// 170.0 for week 7 down to exactly 165.0 for week 12, which is the goal. Six
// overrun rows, the last of them the goal row.
//
// Fixture two is the same thing with a 150.0 goal, which -1.0 lb/wk does not
// reach until week 27. The cap stops the rows at week 18 (the plan's 6 plus 12)
// and that row carries the finish week instead of the goal marker.
//
// Nothing is seeded in the week in progress, deliberately: `actual` is the last
// week that HAS readings, and writing into the current week would make the
// expected numbers depend on which weekday the suite runs.
//
// Mutation checks: restore the `i <= plan.weeks` bound and fixture one draws two
// rows instead of eight; keep `planWeightForWeek` for the overrun rows and their
// targets read 162.5 and below instead of 165.0; drop the cap and fixture two
// draws 23 rows; drop the `overrun` class and the tag and border assertions go.

const { start } = require('../lib/server');
const { launch, attachConsole, waitFor } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';

// Week 4's average, and so where the projection starts from.
const LAST_ACTUAL = 173.0;

// Four weeks of readings a pound apart, plus a plan with whatever goal the
// variant needs. Seven readings summing to 1232.0 so week 1 averages exactly
// 176.0, and not flat — a week of identical readings reads as typed-in history
// and would be filtered out of the averages.
const seed = (page, goalWeight) => page.evaluate((ns, goal) => {
    const pad = (n) => String(n).padStart(2, '0');
    const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const shift = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };

    const planStart = shift(getMondayOfWeek(new Date()), -28);
    const WEEK_ONE = [176.3, 176.1, 175.9, 175.7, 176.2, 175.8, 176.0];
    const log = [];
    for (let w = 0; w < 4; w++) {
        WEEK_ONE.forEach((weight, i) => {
            const d = shift(planStart, w * 7 + i);
            log.push({ date: key(d), weight: weight - w, loggedAt: new Date(d).toISOString() });
        });
    }

    localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
    localStorage.setItem(ns + 'weightHistorySeeded', 'true');
    localStorage.setItem(ns + 'gymWeightPlan', JSON.stringify({
        startDate: key(planStart), startWeight: 180.0, goalWeight: goal,
        ratePerWeek: 2.5, weeks: 6,
    }));
}, NS, goalWeight);

const toHistory = async (page) => {
    await page.evaluate(() => {
        Array.from(document.querySelectorAll('.bottom-nav-btn'))
            .find((b) => b.textContent.includes('History')).click();
    });
    await waitFor(page, 'the weekly ledger to render',
        () => !!document.querySelector('.weigh-week'));
};

// Every projected row, in document order (furthest week first), with the pieces
// that say which side of the plan's end it is on.
const projected = (page) => page.evaluate(() => {
    const text = (row, sel) => {
        const el = row.querySelector(sel);
        return el ? el.textContent.trim().replace(/\s+/g, ' ') : null;
    };
    return Array.from(document.querySelectorAll('.weigh-week.projected')).map((row) => ({
        overrun: row.classList.contains('overrun'),
        goal: row.classList.contains('goal'),
        tag: text(row, '.weigh-week-plan-tag'),
        weight: parseFloat(text(row, '.weigh-week-avg')),
        count: text(row, '.weigh-week-count'),
        vs: text(row, '.weigh-week-vs'),
        border: getComputedStyle(row).borderTopColor,
    }));
});

const open = async (page) => {
    await page.evaluate(() => document.querySelector('.weigh-project-btn').click());
    await waitFor(page, 'the projection to open',
        () => document.querySelector('.weigh-projection').classList.contains('open'));
    // Long enough for the last staggered row to have finished arriving.
    await new Promise((r) => setTimeout(r, 1600));
};

const reseed = async (page, goal) => {
    await seed(page, goal);
    await page.reload({ waitUntil: 'networkidle0' });
    await waitFor(page, 'the check-in card', () => !!document.querySelector('.weigh-card'));
    await toHistory(page);
};

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);

        await page.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        await reseed(page, 165);

        // === 1. The plan's end is not the projection's end ===============
        eq(await page.evaluate(() => document.querySelector('.weigh-project-btn')
                                     .querySelector('.weigh-project-rate').textContent.trim()),
           'at ↓1.0 lb/wk', 'the rows are drawn at the achieved pace, not the planned 2.5');

        await open(page);
        const rows = await projected(page);

        // Newest first, so the numbers count DOWN the page toward the present.
        eq(rows.map((r) => r.weight),
           [165.0, 166.0, 167.0, 168.0, 169.0, 170.0, 171.0, 172.0],
           'weeks 5 through 12 at a pound a week off ' + LAST_ACTUAL + ', furthest first');
        eq(rows.length, 8, 'six of those eight are past the end of a six-week plan');

        // === 2. Numbered past the plan, and labelled as such =============
        eq(rows.map((r) => r.tag),
           ['wk 12', 'wk 11', 'wk 10', 'wk 9', 'wk 8', 'wk 7', 'plan wk 6', 'plan wk 5'],
           'the tag keeps counting but stops claiming to be a plan week');
        eq(rows.map((r) => r.overrun),
           [true, true, true, true, true, true, false, false],
           'and the overrun rows carry the class the amber border hangs off');

        const amber = rows.find((r) => r.overrun && !r.goal).border;
        const grey = rows.find((r) => !r.overrun).border;
        ok(amber !== grey, 'an overrun row is bordered differently from an in-plan one: '
                           + amber + ' vs ' + grey);

        // === 3. Measured against the goal, not the line extended =========
        // Week 6 is the plan's last and its target is the plan's own: 180 - 2.5×6
        // is the goal weight exactly, so the row says how far short the plan
        // itself lands.
        eq(rows[6].vs, 'target 165.0 · 6.0 lb over',
           'week 6 is the plan running out with six pounds still on: ' + rows[6].vs);
        eq(rows[5].vs, 'target 165.0 · 5.0 lb over',
           'and week 7 is measured against the goal rather than 162.5: ' + rows[5].vs);
        eq(rows[1].vs, 'target 165.0 · 1.0 lb over', 'as is week 11: ' + rows[1].vs);

        // === 4. It still stops on the goal ===============================
        eq(rows[0].weight, 165.0, 'the last row lands ON the goal rather than past it');
        eq(rows[0].goal, true, 'and is marked as the week the goal lands');
        eq(rows[0].overrun, true, 'even though it is itself an overrun week');
        eq(rows.filter((r) => r.goal).length, 1, 'only that one row is');
        ok(rows[0].count.includes('goal lands here'), 'which it says out loud: ' + rows[0].count);
        ok(rows[0].border !== amber,
           'and it keeps the accent border rather than the overrun tint: ' + rows[0].border);
        eq(rows[5].count, 'past plan', 'an ordinary overrun row says which side of the plan it is on');
        eq(rows[7].count, 'projected', 'an in-plan one is unchanged');

        // === 5. No Monday appears twice ==================================
        const dates = await page.evaluate(() => Array.from(document.querySelectorAll('.weigh-week'))
            .map((r) => r.querySelector('.history-date').textContent.replace(/^[\s\S]*?Week of /, '')));
        eq(dates.length, new Set(dates).size,
           'the overrun weeks land on Mondays nothing else in the ledger claims');

        // === 6. Capped at twelve weeks past the plan =====================
        // Same pace against a 150.0 goal, which -1.0 lb/wk does not reach until
        // week 27. The plan is six weeks, so the rows stop at week 18.
        await reseed(page, 150);
        await open(page);
        const capped = await projected(page);

        eq(capped.length, 14, 'weeks 5 through 18 and no further');
        eq(capped[0].tag, 'wk 18', 'the furthest row is twelve weeks past the six-week plan');
        eq(capped[0].weight, 159.0, 'still nine pounds above the goal when the rows run out');
        eq(capped.filter((r) => r.goal).length, 0, 'so no row pretends the goal lands inside them');
        eq(capped[0].count, 'goal ~wk 27',
           'and the last row names the week it actually lands: ' + capped[0].count);
        eq(capped[0].vs, 'target 150.0 · 9.0 lb over',
           'measured against the goal like every other overrun row: ' + capped[0].vs);

        eq(errors, [], 'no console errors');
        console.log('PASS: the projection runs past the plan to the goal, and says how far.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
