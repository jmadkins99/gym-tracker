// What this test covers
// ----------------------
// "Projected Weight" on the History tab, added September 2026: a button
// between the chart and the ledger that unfolds the REST of the plan, drawn at
// the rate actually being achieved rather than the one the plan asks for.
//
// The reason it needs a case of its own is that it puts rows that are not
// records into a list that is otherwise entirely records. Three things have to
// hold for that to be safe, and this case pins each of them:
//
//   - The projection is opt-in. The rows are in the DOM so both directions can
//     animate, but until the button is pressed the block is collapsed and
//     hidden from the accessibility tree, and none of it is readable.
//   - A projected week never lands on a week the log can answer for. The rows
//     start after the LAST week with readings, so no Monday appears twice in
//     the ledger.
//   - They are visibly not records: muted, tagged "projected" rather than
//     "n/7 logged", and labelled proj rather than avg.
//
// The fixture is chosen so every projected number is exact. Four completed
// weeks average 176 / 175 / 174 / 173, so the three deltas are -1.0 each and
// the plan's average rate is exactly -1.0 lb/wk. The plan is 180.0 at
// 1.5 lb/wk for 12 weeks to a 165.0 goal, anchored so that week 5 is the week
// in progress. Projecting -1.0 a week off week 4's 173.0 gives 172.0 for week
// 5 through 165.0 for week 12 — and 165.0 IS the goal, so week 12 is the last
// row and carries the goal marker. The plan's own line is steeper, so the
// projection starts UNDER target (172.0 against 172.5) and ends OVER it
// (165.0 against 162.0), which is what makes both tones testable from one
// fixture.
//
// Nothing is seeded in the week in progress, deliberately: `actual` is the
// last week that HAS readings, and a fixture that wrote into the current week
// would make the expected numbers depend on which weekday the suite runs.
//
// Mutation checks: start the projection at the plan's own week instead of the
// last week with data and the "no Monday twice" assertion fails; drop the
// clamp at the goal and week 12 stops being the last row; render the rows
// unconditionally and the collapsed-on-arrival assertion fails.

const { start } = require('../lib/server');
const { launch, attachConsole, waitFor } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';

// Week 4's average, and so where the projection starts from.
const LAST_ACTUAL = 173.0;
// One pound a week, which is what the four seeded weeks work out to.
const RATE = 1.0;
const GOAL = 165.0;

const seed = (page) => page.evaluate((ns) => {
    const pad = (n) => String(n).padStart(2, '0');
    const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const shift = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };

    const monday = getMondayOfWeek(new Date());
    const planStart = shift(monday, -28);

    // Seven readings summing to 1232.0, so week 1 averages exactly 176.0, and
    // each later week is the same seven a pound lighter. Not flat — a week of
    // identical readings is treated as typed-in history and would be filtered.
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
        startDate: key(planStart), startWeight: 180.0, goalWeight: 165, ratePerWeek: 1.5, weeks: 12,
    }));
}, NS);

const toHistory = async (page) => {
    await page.evaluate(() => {
        Array.from(document.querySelectorAll('.bottom-nav-btn'))
            .find((b) => b.textContent.includes('History')).click();
    });
    await waitFor(page, 'the weekly ledger to render',
        () => !!document.querySelector('.weigh-week'));
};

// Every week row in the ledger, in document order, flagged by whether it is a
// projection. Reading both kinds through one selector is the point: their
// ORDER relative to each other is part of what is under test.
const ledger = (page) => page.evaluate(() => {
    const text = (row, sel) => {
        const el = row.querySelector(sel);
        return el ? el.textContent.trim() : null;
    };
    return Array.from(document.querySelectorAll('.weigh-week')).map((row) => ({
        projected: row.classList.contains('projected'),
        goal: row.classList.contains('goal'),
        date: text(row, '.history-date'),
        weight: parseFloat(text(row, '.weigh-week-avg')),
        unit: text(row, '.weigh-week-unit'),
        count: text(row, '.weigh-week-count'),
        vs: text(row, '.weigh-week-vs'),
        delay: row.style.transitionDelay,
        opacity: parseFloat(getComputedStyle(row).opacity),
    }));
});

const block = (page) => page.evaluate(() => {
    const el = document.querySelector('.weigh-projection');
    if (!el) return null;
    return {
        open: el.classList.contains('open'),
        hidden: el.getAttribute('aria-hidden'),
        rows: el.querySelectorAll('.weigh-week').length,
    };
});

const toggle = (page) => page.evaluate(() => document.querySelector('.weigh-project-btn').click());

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);

        await page.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        await seed(page);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitFor(page, 'the check-in card', () => !!document.querySelector('.weigh-card'));
        await toHistory(page);

        // === 1. The button, and the rate it names ========================
        const btn = await page.evaluate(() => {
            const b = document.querySelector('.weigh-project-btn');
            return b && {
                label: b.querySelector('.weigh-project-label').textContent.trim(),
                rate: b.querySelector('.weigh-project-rate').textContent.trim(),
                expanded: b.getAttribute('aria-expanded'),
            };
        });
        ok(btn, 'the projection button is on the History tab');
        ok(btn.label.includes('Projected Weight'), 'button reads Projected Weight, got: ' + btn.label);
        eq(btn.rate, 'at ↓' + RATE.toFixed(1) + ' lb/wk',
           'the button names the rate it will project at: ' + btn.rate);
        eq(btn.expanded, 'false', 'and arrives collapsed');

        // === 2. Collapsed on arrival =====================================
        const shut = await block(page);
        eq(shut.open, false, 'the projection block is collapsed before the button is pressed');
        eq(shut.hidden, 'true', 'and is hidden from the accessibility tree while it is');
        eq(shut.rows, 8, 'weeks 5 through 12 are mounted so closing can animate too');

        const before = await ledger(page);
        eq(before.filter((r) => r.projected).every((r) => r.opacity === 0), true,
           'no projected row is readable until the button is pressed');
        eq(before.filter((r) => !r.projected).length, 4, 'the four logged weeks are the ledger');

        // === 3. Pressed: the rest of the plan ============================
        await toggle(page);
        await waitFor(page, 'the projection to open',
            () => document.querySelector('.weigh-projection').classList.contains('open'));
        // Long enough for the last staggered row to have finished arriving.
        await new Promise((r) => setTimeout(r, 1200));

        const after = await ledger(page);
        const proj = after.filter((r) => r.projected);
        const real = after.filter((r) => !r.projected);

        eq(after.slice(0, 8).every((r) => r.projected), true,
           'the projected weeks sit above the logged ones — the ledger is newest first');
        eq(proj.every((r) => r.opacity === 1), true, 'and every one of them is readable now');

        // Newest first inside the block too, so the numbers count DOWN the
        // page toward the present.
        eq(proj.map((r) => r.weight),
           [165.0, 166.0, 167.0, 168.0, 169.0, 170.0, 171.0, 172.0],
           'one pound a week off ' + LAST_ACTUAL + ', furthest week first');
        eq(proj.every((r) => r.unit === 'lbs proj'), true,
           'the unit says proj, not avg — these are not weekly averages of anything');
        eq(proj[7].count, 'projected', 'a projected row is tagged rather than counting logged days');
        eq(proj[7].vs, 'target 172.5 · 0.5 lb under',
           'week 5 is ahead of the plan line: ' + proj[7].vs);

        // === 4. The projection stops at the goal =========================
        eq(proj[0].weight, GOAL, 'the last row lands ON the goal rather than past it');
        eq(proj[0].goal, true, 'and is marked as the week the goal lands');
        eq(proj.filter((r) => r.goal).length, 1, 'only that one row is');
        ok(proj[0].count.includes('goal'), 'which it says out loud: ' + proj[0].count);
        eq(proj[0].vs, 'target 162.0 · 3.0 lb over',
           'and it is honest that the plan wanted more by then: ' + proj[0].vs);

        // === 5. No Monday appears twice ==================================
        const dates = after.map((r) => r.date.replace(/^[\s\S]*?Week of /, ''));
        eq(dates.length, new Set(dates).size,
           'a projected week never lands on a week the log already answers for');
        eq(real.map((r) => r.weight), [173.0, 174.0, 175.0, 176.0],
           'the logged weeks are untouched by any of this');

        // === 6. The stagger runs out of the present ======================
        // Nearest week first on the way out, furthest week first on the way
        // back — the row adjacent to the real ledger is the hinge.
        eq(proj[7].delay, '0ms', 'opening starts from the week closest to now');
        eq(proj[0].delay, (7 * 55) + 'ms', 'and reaches the furthest one last');

        // === 7. Pressing again puts it away ==============================
        await toggle(page);
        await waitFor(page, 'the projection to close',
            () => !document.querySelector('.weigh-projection').classList.contains('open'));
        await new Promise((r) => setTimeout(r, 1200));

        const closed = await ledger(page);
        eq(closed.filter((r) => r.projected).every((r) => r.opacity === 0), true,
           'the projected rows are unreadable again');
        eq(await page.evaluate(() => document.querySelector('.weigh-project-btn').getAttribute('aria-expanded')),
           'false', 'and the button says so');
        eq(closed.find((r) => r.projected).delay, '0ms',
           'closing retracts from the furthest week back toward the present');

        // === 8. Week 1 of a plan, which has no week-to-week delta ========
        // The mean of the weekly deltas does not exist yet, so the rate falls
        // back to what has come off since the plan started. One logged week at
        // 176.0 against a 180.0 start is 4.0 lb in one week, and projecting
        // that reaches the 165.0 goal partway through week 4 — so week 4 is
        // the last row and lands on the goal rather than at 164.0.
        await page.evaluate((ns) => {
            const pad = (n) => String(n).padStart(2, '0');
            const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
            const shift = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };
            const planStart = shift(getMondayOfWeek(new Date()), -7);
            const log = [176.3, 176.1, 175.9, 175.7, 176.2, 175.8, 176.0].map((weight, i) => {
                const d = shift(planStart, i);
                return { date: key(d), weight, loggedAt: new Date(d).toISOString() };
            });
            localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
            localStorage.setItem(ns + 'gymWeightPlan', JSON.stringify({
                startDate: key(planStart), startWeight: 180.0, goalWeight: 165,
                ratePerWeek: 1.5, weeks: 12,
            }));
        }, NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitFor(page, 'the check-in card', () => !!document.querySelector('.weigh-card'));
        await toHistory(page);

        eq(await page.evaluate(() => document.querySelector('.weigh-project-btn')
                                     .querySelector('.weigh-project-rate').textContent.trim()),
           'at ↓4.0 lb/wk',
           'week 1 projects at what has come off since the plan started');

        await toggle(page);
        await waitFor(page, 'the projection to open',
            () => document.querySelector('.weigh-projection').classList.contains('open'));
        await new Promise((r) => setTimeout(r, 900));

        const week1 = (await ledger(page)).filter((r) => r.projected);
        eq(week1.map((r) => r.weight), [165.0, 168.0, 172.0],
           'weeks 2 through 4, stopping the moment the line reaches the goal');
        eq(week1[0].goal, true, 'and the row it stops on is the goal row');

        eq(errors, [], 'no console errors');
        console.log('PASS: History projects the rest of the plan behind a button.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
