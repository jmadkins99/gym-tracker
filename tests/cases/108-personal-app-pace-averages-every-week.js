// What this test covers
// ----------------------
// Pace, September 2026: the plan card's lb/wk figure is the MEAN of every plan
// week's own rate, not the change from last week to this one, and the same
// number draws the Projected Weight rows.
//
// It used to be the mean of the plan's week-to-week deltas with week 1 missing
// from it, because week 1 had no earlier plan row to be measured against. On a
// two-week-old cut that left exactly one number in the average, so Pace was
// the latest week and nothing else: a fortnight that went 4.6 lb then 0.4 lb
// reported 0.4 lb/wk, and the projection drew the remaining twenty-five pounds
// at that rate — a finish date two months late off a cut that was on plan.
//
// The fixture is that fortnight, with every number exact:
//
//   week before the plan   175.0 avg   <- what week 1's loss came off
//   plan week 1            170.4 avg   ↓ 4.6
//   plan week 2            170.0 avg   ↓ 0.4
//
// so Pace is 2.5 lb/wk and the plan asks for 2.0, which keeps the two halves of
// "2.5 lb/wk vs 2.0 planned" telling each other apart. Projecting 2.5 a week
// off week 2's 170.0 reaches the 145.0 goal at week 12 of 15.
//
// Nothing is seeded in the week in progress, deliberately: `actual` is the last
// week that HAS readings, and writing into the current week would make every
// expected number depend on which weekday the suite runs on.
//
// Three things beyond the headline are pinned here, each with its own variant
// of that log:
//
//   - The anchor for week 1 is a week that was WEIGHED, not the plan's typed-in
//     start weight. Drop the pre-plan week and Pace is 0.4 again — the two
//     agree in this fixture only because the plan was set up from that week.
//   - A delta spanning a skipped week is divided by the weeks it spans, so a
//     fortnight's loss is not averaged in as one week's.
//   - Pace, the projection button's rate, and the projected rows are one
//     number. They were allowed to disagree once and it was not worth it.
//
// Mutation checks: average the deltas rather than the rates and the skipped-week
// variant reads 5.0; anchor week 1 on plan.startWeight and the no-earlier-week
// variant reads 2.5; take the last week's rate as Pace and the headline reads
// 0.4, which is the bug this case exists for.

const { start } = require('../lib/server');
const { launch, attachConsole, waitFor } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';

// Seven readings summing to 1225.0, so the week averages exactly 175.0. Not
// seven identical ones: a flat week is treated as typed-in history elsewhere,
// and a fixture should not lean on the one shape the app second-guesses.
const WEEK = [175.3, 175.1, 174.9, 174.7, 175.2, 174.8, 175.0];

// Week buckets are LOCAL Mondays, so the fixture is built against the page's
// own clock — the same reason cases 96, 97 and 98 do it in-page.
const seed = (page, week) => page.evaluate((ns, WEEK) => {
    const pad = (n) => String(n).padStart(2, '0');
    const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const shift = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };

    const monday = getMondayOfWeek(new Date());
    // Plan week 1 is the week before last, so the plan has two finished weeks
    // and the week in progress is its third.
    const planStart = shift(monday, -14);

    const log = [];
    // offset in weeks from the plan's start, and what that week must average.
    [[-1, 175.0], [0, 170.4], [1, 170.0]].forEach((pair) => {
        const drop = 175.0 - pair[1];
        WEEK.forEach((weight, i) => {
            const d = shift(planStart, pair[0] * 7 + i);
            log.push({ date: key(d), weight: weight - drop, loggedAt: new Date(d).toISOString() });
        });
    });

    localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
    localStorage.setItem(ns + 'weightHistorySeeded', 'true');
    localStorage.setItem(ns + 'gymWeightPlan', JSON.stringify({
        name: 'Cut', startDate: key(planStart), startWeight: 175.0,
        goalWeight: 145.0, ratePerWeek: 2.0, weeks: 15,
    }));
}, NS, week);

// planProgress over a variant of the seeded log, without touching what is
// stored: `drop` names the weeks (as offsets from the plan's start) to leave
// out. Rounded to a hundredth because the seeded readings do not land on exact
// tenths in binary, and a rate is a tenths-place number.
const paceFor = (page, drop) => page.evaluate((ns, drop) => {
    const pad = (n) => String(n).padStart(2, '0');
    const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const shift = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };
    const round = (n) => (n === null ? null : Math.round(n * 100) / 100);

    const log = JSON.parse(localStorage.getItem(ns + 'gymWeightLog'));
    const plan = JSON.parse(localStorage.getItem(ns + 'gymWeightPlan'));
    const planStart = plan.startDate;
    const excluded = new Set(drop.map((w) => key(shift(new Date(planStart + 'T00:00:00'), w * 7))));
    const kept = log.filter((e) => {
        const monday = key(getMondayOfWeek(new Date(e.date + 'T00:00:00')));
        return !excluded.has(monday);
    });

    const progress = planProgress(plan, kept, key(new Date()));
    return {
        avgRate: round(progress.avgRate),
        projectionRate: round(projectionRate(progress)),
        rows: progress.rows
            .filter((r) => r.actual !== null)
            .map((r) => ({ week: r.week, actual: round(r.actual), delta: round(r.delta), rate: round(r.rate) })),
    };
}, NS, drop);

const toHistory = async (page) => {
    await page.evaluate(() => {
        Array.from(document.querySelectorAll('.bottom-nav-btn'))
            .find((b) => b.textContent.includes('History')).click();
    });
    await waitFor(page, 'the weekly ledger to render',
        () => !!document.querySelector('.weigh-week'));
};

const planCard = (page) => page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.plan-line-row'));
    const row = (label) => {
        const found = rows.find((r) => r.firstElementChild.textContent.trim() === label);
        return found ? found.lastElementChild.textContent.trim() : null;
    };
    return { pace: row('Pace'), goal: rows.length ? rows[rows.length - 1].lastElementChild.textContent.trim() : null };
});

const projection = (page) => page.evaluate(() => {
    const btn = document.querySelector('.weigh-project-btn');
    if (!btn) return null;
    // Rendered newest first, like the ledger they sit above; reversed here so
    // the assertions below read forwards in time.
    const rows = Array.from(document.querySelectorAll('.weigh-projection .weigh-week')).reverse();
    return {
        rate: btn.querySelector('.weigh-project-rate').textContent.trim(),
        weights: rows.map((r) => parseFloat(r.querySelector('.weigh-week-avg').textContent)),
        lastIsGoal: rows.length ? rows[rows.length - 1].classList.contains('goal') : false,
    };
});

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);

        await page.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        await seed(page, WEEK);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitFor(page, 'the check-in card to render',
            () => !!document.querySelector('.weigh-card'));

        // === 1. The arithmetic, directly ================================
        const full = await paceFor(page, []);
        eq(full.rows.map((r) => r.week), [1, 2], 'both finished weeks are plan rows with data');
        eq(full.rows.map((r) => r.actual), [170.4, 170.0], 'and they average what the fixture says');
        eq(full.rows.map((r) => r.rate), [-4.6, -0.4],
            "week 1's rate is measured against the week before the plan, not left null");
        eq(full.avgRate, -2.5, 'Pace is the mean of the two, not the latest of them');

        // === 2. The anchor is a week that was weighed ===================
        // Without the week before it, week 1 has nothing to be a change from.
        // The plan's start weight is not a substitute: it is typed into the
        // editor, and a plan set up a month after the weight it names would
        // book that whole month as week 1's loss.
        const noAnchor = await paceFor(page, [-1]);
        eq(noAnchor.rows.map((r) => r.rate), [null, -0.4],
            'with no earlier week logged, week 1 carries no rate');
        eq(noAnchor.avgRate, -0.4, 'and Pace is what is left rather than a figure off the start weight');

        // === 3. A skipped week is divided by the weeks it spans =========
        const gapped = await paceFor(page, [0]);
        eq(gapped.rows.map((r) => r.week), [2], 'plan week 1 is gone from this variant');
        eq(gapped.rows[0].delta, -5.0, 'the raw change is still the whole fortnight');
        eq(gapped.avgRate, -2.5, 'but the rate it contributes is per week, not per row');

        // === 4. What the card says ======================================
        await toHistory(page);
        const card = await planCard(page);
        eq(card.pace, '↓ 2.5 lb/wk vs 2.0 planned',
            'the plan card prints the average, not the last week: ' + card.pace);

        // === 5. The projection is drawn at the same rate ================
        const proj = await projection(page);
        ok(proj, 'the Projected Weight button is offered');
        eq(proj.rate, 'at ↓2.5 lb/wk', 'the button names Pace: ' + proj.rate);
        eq(proj.weights.slice(0, 3), [167.5, 165.0, 162.5],
            'and the rows step by it from the last week with readings');
        eq(proj.weights[proj.weights.length - 1], 145.0, 'the last projected row is the goal weight');
        ok(proj.lastIsGoal, 'and is marked as where the goal lands');

        eq(errors, [], 'no console errors');
        console.log('PASS: Pace averages every week of the plan, and the projection is drawn at it.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
