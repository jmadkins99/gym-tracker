// What this test covers
// ----------------------
// The check-in card's headline number, September 2026. It used to be the EMA
// trend — a smoothed value weighted toward the most recent readings — under the
// label "Trend". It is now this week's plain average, under the label "Weekly
// average weight", with a week-over-week rate beneath it.
//
// The property worth pinning is not the arithmetic on its own but the AGREEMENT:
// the card and the History ledger's top row must be the same number, because
// they now name the same thing. Two functions computing a "weekly average"
// separately is exactly how they drift, so `currentWeekAverage` reads its answer
// out of `weeklyAverages` — the same buckets the ledger renders — and this case
// asserts the two match on screen rather than asserting a constant twice.
//
// The fixture is a full prior week at a flat 180.0 and a single reading of 175.0
// today. Deliberately weekday-independent: seeding only today for the current
// week means this week's average is exactly 175.0 whether the suite runs on a
// Monday or a Sunday, and a fixture that changed value with the day of the week
// would fail every seventh day for reasons having nothing to do with the code.
//
// It also pins the rate as a per-week difference of averages: 175.0 - 180.0 is
// -5.0, and the EMA rate it replaced would report neither that number nor
// anything stable, since it read a 14-day window off the smoothed series.
//
// The chart is pinned in the same pass, because it changed for the same reason:
// it used to draw the EMA and now draws the readings. The fixture's last day is
// a deliberate 10 lb drop, which is what makes the two distinguishable on
// screen — an EMA absorbs a one-day move at a quarter of its size, so the axis
// under the old chart could not reach down to the reading itself. Asserting
// that the axis covers 175.0 therefore fails against a smoothed series and
// passes against a raw one, which a fixture of gentle drift would not.
//
// Mutation checks: plot p.trend again (or point the card at an EMA) and both
// the agreement and the axis assertions fail; drop the spanWeeks divisor in
// weeklyAverageRate and this case still passes but a gap-week fixture would
// not, which is why the divisor carries its own comment; restore the ephemeral
// disclaimer and its assertion fails.

const { start } = require('../lib/server');
const { launch, attachConsole, waitFor } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';

const PRIOR_WEEK_WEIGHT = 180.0;
const TODAY_WEIGHT = 175.0;

// A week bucket is a LOCAL Monday, so the fixture's dates are built inside the
// page against its own clock rather than against node's. The same reason case
// 96 computes its plan dates in the browser.
const seedLog = (page) => page.evaluate((ns, prior, today) => {
    const pad = (n) => String(n).padStart(2, '0');
    const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const now = new Date();
    const monday = getMondayOfWeek(now);

    const log = [];
    // The seven days of the immediately preceding week, all flat.
    for (let i = 7; i >= 1; i--) {
        const d = new Date(monday);
        d.setDate(d.getDate() - i);
        log.push({ date: key(d), weight: prior, loggedAt: new Date(d).toISOString() });
    }
    // This week's only reading is today's, so the week average is exact on
    // whatever weekday the suite happens to run.
    log.push({ date: key(now), weight: today, loggedAt: now.toISOString() });

    localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
    localStorage.setItem(ns + 'weightHistorySeeded', 'true');
    localStorage.setItem(ns + 'gymWeightPlan', 'null');
}, NS, PRIOR_WEEK_WEIGHT, TODAY_WEIGHT);

const cardNumber = (page) => page.evaluate(() =>
    parseFloat(document.querySelector('.weigh-trend-value').textContent));

const cardLabel = (page) => page.evaluate(() =>
    document.querySelector('.weigh-trend-label').textContent.trim());

const rateText = (page) => page.evaluate(() =>
    document.querySelector('.weigh-rate').textContent.trim());

const topWeekAverage = (page) => page.evaluate(() =>
    parseFloat(document.querySelector('.weigh-week-avg').textContent));

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);

        await page.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        await seedLog(page);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitFor(page, 'the check-in card to render',
            () => !!document.querySelector('.weigh-card'));

        // === 1. The card shows this week's average, not the EMA ==========
        await waitFor(page, 'the weekly average to render',
            () => !!document.querySelector('.weigh-trend-value'));

        eq(await cardLabel(page), 'Weekly average weight',
            'the card labels its number as a weekly average');
        eq(await cardNumber(page), TODAY_WEIGHT,
            "this week's average is today's only reading");

        // === 2. The rate is a difference of weekly averages ==============
        const rate = await rateText(page);
        ok(rate.includes('5.0'),
            'rate should be 180.0 - 175.0 = 5.0 lb per week, got: ' + rate);
        ok(rate.includes('↓'),
            'a losing week should read as a fall, got: ' + rate);

        // === 3. Today's raw reading is still ephemeral, with no caption ===
        const ephemeral = await page.evaluate(() =>
            !!document.querySelector('.weigh-ephemeral')
            || document.body.textContent.includes('not shown again after tonight'));
        eq(ephemeral, false, 'the "today only" disclaimer should be gone from the card');

        // === 4. The ledger agrees with the card ==========================
        await page.evaluate(() => {
            Array.from(document.querySelectorAll('.bottom-nav-btn'))
                .find((b) => b.textContent.includes('History')).click();
        });
        await waitFor(page, 'the weekly ledger to render',
            () => !!document.querySelector('.weigh-week'));

        eq(await topWeekAverage(page), TODAY_WEIGHT,
            'the ledger top row must show the same average the card does');

        // === 5. The chart plots the readings, not a smoothed line =========
        //
        // The y-axis is snapped out to round gridlines, so the assertion is
        // that it CONTAINS the raw low rather than that it equals it. Against
        // the EMA this fixture's series bottoms out near 178.8 and a domain
        // reaching 175.0 would be several gridlines too tall.
        const axis = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.weigh-chart-yaxis span'))
                .map((el) => parseFloat(el.textContent)));
        ok(axis.length > 1, 'the chart should label its y-axis, got: ' + JSON.stringify(axis));
        ok(Math.min.apply(null, axis) <= TODAY_WEIGHT,
            'the axis must reach the actual reading of ' + TODAY_WEIGHT
            + ', which a smoothed series never descends to; axis: ' + JSON.stringify(axis));
        ok(Math.max.apply(null, axis) >= PRIOR_WEEK_WEIGHT,
            'the axis must reach the prior weeks flat ' + PRIOR_WEEK_WEIGHT
            + '; axis: ' + JSON.stringify(axis));

        ok(errors.length === 0, 'no console errors: ' + JSON.stringify(errors));
        console.log('PASS');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
