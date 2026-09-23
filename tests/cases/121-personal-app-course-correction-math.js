// What this test covers
// ----------------------
// `courseCorrection` — the arithmetic behind the "Projected Days" button,
// September 2026. Case 122 owns the button and the rows on screen;
// this one owns the numbers, because the numbers are the whole feature and
// they are far easier to pin here than through a rendered ledger.
//
// The question it answers: this week is over its plan target, some days are
// still unweighed, what is the SMALLEST CONSTANT daily loss that still lands
// the week's average exactly on target?
//
// Constant is the operative word, and it is what makes this arithmetic rather
// than a lookup. A week's average is the mean of its readings, so the days
// still to come have to make up the whole of what the days already logged are
// over by — and they have to do it while stepping down by the same amount
// each morning. With r days left, anchored at the last reading L, those days
// are L-x, L-2x, ... L-rx, summing to r*L - x*r(r+1)/2. Set that equal to
// what is needed and there is exactly one x. The triangular number is the
// part worth pinning: drop it and every fixture below still produces a
// plausible-looking wrong answer.
//
// The anchor is the LAST LOGGED READING, not the week's average and not the
// target. A steady daily loss is a thing you do starting from where you are
// this morning, and the week's average is not a weight anyone was ever at.
//
// Nothing here renders. The case loads the page for its globals and calls
// `planProgress` and `courseCorrection` directly, building each fixture's
// progress through the real function so a change to the plan rows cannot let
// this case keep passing against a stale shape.
//
// Mutation checks: drop the r(r+1)/2 and phase 1's 0.4 becomes 0.24; anchor
// on the week average instead of the last reading and phase 1 gives 0.33;
// divide by 7 instead of the readings the week will actually end with and
// phase 5 breaks; lose the clamp and phase 4 forecasts a GAIN; lose the
// remaining-days-are-future rule and phase 6 tries to correct a Tuesday that
// has already gone by.

const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

// Every fixture is stated in plain weekday terms and built against a FIXED
// Monday, so none of this moves with the day the suite runs on. The page's
// own clock is irrelevant here: `todayKey` is passed in.
const MONDAY = '2026-09-14';
const DAY = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
             '2026-09-18', '2026-09-19', '2026-09-20'];

// A plan whose week 2 target is exactly 170.0, so the fixtures below can talk
// in round numbers. A week's target is where the line has arrived by the END
// of that week -- planWeightForWeek is start - rate * i -- so week 2 of a
// 174.0 plan losing 2.0 a week is 174.0 - 4.0. Sep 7 and Sep 14 are both
// Mondays, which is what makes week 2 the week the fixtures live in.
const PLAN = {
    startDate: '2026-09-07',
    startWeight: 174.0,
    goalWeight: 160.0,
    ratePerWeek: 2.0,
    weeks: 8,
};
const TARGET = 170.0;

// Run one fixture through the real planProgress and the function under test.
// `weights` is this week's readings in weekday order, null for a day with no
// reading; `todayKey` is the day the correction is asked for.
const correctionFor = (page, weights, todayKey) => page.evaluate((plan, days, ws, today) => {
    const log = [];
    ws.forEach((w, i) => {
        if (w !== null) log.push({ date: days[i], weight: w, loggedAt: days[i] + 'T07:00:00.000Z' });
    });
    const progress = planProgress(plan, log, today);
    const cc = courseCorrection(progress, log, today);
    return { cc, weekAvg: progress.actual, target: progress.planWeight };
}, PLAN, DAY, weights, todayKey);

// The assertion that actually matters, applied to every phase that produces a
// forecast: the readings already taken plus the days forecast, over the count
// the week will end with, is the target. Everything else is presentation.
const landsOnTarget = (logged, days, target) => {
    const sum = logged.reduce((s, w) => s + w, 0) + days.reduce((s, d) => s + d.weight, 0);
    return Math.abs(sum / (logged.length + days.length) - target) < 1e-9;
};

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        await page.waitForFunction(() => typeof planProgress === 'function');

        // === 1. The worked example ======================================
        //
        // Tuesday. Mon 170.0 and Tue 171.0 are in, so the week averages 170.5
        // against a 170.0 target — half a pound over, which is what puts the
        // button on screen at all. Five days left.
        //
        //   7 readings must total   7 x 170.0 = 1190.0
        //   already logged                       341.0
        //   Wed-Sun must total                   849.0
        //   5 days from 171.0 stepping down by x:
        //       5(171.0) - x(5.6/2) = 849.0  ->  855.0 - 15x = 849.0
        //                                    ->  x = 0.4
        const { cc, weekAvg } = await correctionFor(page, [170.0, 171.0, null, null, null, null, null], DAY[1]);
        eq(weekAvg, 170.5, 'the fixture is half a pound over target');
        ok(cc !== null, 'a week over target with days left gets a correction');
        eq(cc.weekStart, MONDAY, 'the correction is about the current week');
        eq(cc.target, TARGET, "and about that week's plan target");
        eq(cc.anchor, 171.0, 'the glide starts from the last reading, not the average');
        eq(Math.round(cc.perDay * 1000) / 1000, 0.4, 'the smallest constant daily loss is 0.4');
        eq(cc.days.map((d) => d.date), DAY.slice(2), 'every unweighed day gets a forecast');
        eq(cc.days.map((d) => Math.round(d.weight * 10) / 10),
            [170.6, 170.2, 169.8, 169.4, 169.0],
            'the forecast steps down by a constant 0.4');
        ok(landsOnTarget([170.0, 171.0], cc.days, TARGET),
            'the week must land exactly on target, got ' + JSON.stringify(cc.days));

        // === 2. On target is not a correction ===========================
        //
        // The same Tuesday with Tuesday at 170.0: the week averages exactly
        // its target, so there is nothing to correct and no button to show.
        const on = await correctionFor(page, [170.0, 170.0, null, null, null, null, null], DAY[1]);
        eq(on.weekAvg, TARGET, 'the fixture sits on target');
        eq(on.cc, null, 'a week on target has no correction');

        // Under it, likewise — the card already calls that a win.
        const under = await correctionFor(page, [169.0, 169.0, null, null, null, null, null], DAY[1]);
        ok(under.weekAvg < TARGET, 'the fixture is under target');
        eq(under.cc, null, 'a week under target has no correction');

        // === 3. One day left, far gone: the number is printed anyway ====
        //
        // Saturday, six days logged at 175.0 flat. Sunday alone has to drag a
        // 175.0 week down to 170.0, which takes a reading of 140.0. No week
        // does that. It is still the honest answer to the question asked, and
        // a cap here would be the component inventing a second, softer
        // question nobody posed.
        const late = await correctionFor(page,
            [175.0, 175.0, 175.0, 175.0, 175.0, 175.0, null], DAY[5]);
        ok(late.cc !== null, 'an unreachable week still gets its arithmetic');
        eq(late.cc.days.length, 1, 'one day remains');
        eq(Math.round(late.cc.days[0].weight * 10) / 10, 140.0,
            'the single remaining day carries the whole correction');
        ok(landsOnTarget([175, 175, 175, 175, 175, 175], late.cc.days, TARGET),
            'and it does land on target, however impossibly');

        // === 4. Already low enough: the loss clamps at zero =============
        //
        // Monday 180.0 then Tuesday 165.0. The week averages 172.5 — over
        // target, so the button shows — but Tuesday is already far enough
        // under that holding it flat for five days lands the week UNDER 170.0.
        // The smallest constant daily loss that gets there is therefore none
        // at all, and the honest forecast is a flat line at today's reading.
        //
        // Without the clamp the arithmetic is happy to hand back a negative
        // x — a forecast instructing you to gain 1.3 lb a day to hit a
        // weight-loss target, which is true arithmetic and nonsense advice.
        const low = await correctionFor(page, [180.0, 165.0, null, null, null, null, null], DAY[1]);
        eq(low.weekAvg, 172.5, 'the week is over target on Monday alone');
        ok(low.cc !== null, 'so the correction is still offered');
        eq(low.cc.perDay, 0, 'but the required daily loss clamps at zero');
        eq(low.cc.days.map((d) => d.weight), [165, 165, 165, 165, 165],
            'and the forecast is holding today, not gaining');
        const landed = (180 + 165 + 165 * 5) / 7;
        ok(landed < TARGET, 'holding steady lands the week under target: ' + landed);

        // === 5. A missed day shrinks the divisor ========================
        //
        // Monday was never weighed and never will be — it is in the past, so
        // no forecast can fill it. The week will end with SIX readings, not
        // seven, and the correction divides by six. Dividing by seven would
        // demand the remaining days make up for a reading that is never
        // coming, and would forecast a week that misses its own target.
        //
        // This cannot happen to a daily weigher, which is the point: the
        // arithmetic has to be right about the week it is actually in rather
        // than the week it assumes.
        const skipped = await correctionFor(page, [null, 171.0, null, null, null, null, null], DAY[1]);
        ok(skipped.cc !== null, 'a missed Monday still leaves a correctable week');
        eq(skipped.cc.days.length, 5, 'five days remain');
        ok(landsOnTarget([171.0], skipped.cc.days, TARGET),
            'six readings, not seven, must average the target: '
            + JSON.stringify(skipped.cc.days.map((d) => Math.round(d.weight * 100) / 100)));

        // === 6. A gap earlier in the week is not a day to forecast ======
        //
        // Thursday, with Wednesday skipped. Wednesday is gone; the forecast
        // covers Thursday onward. A correction that quietly filled in a past
        // Wednesday would be forecasting the past.
        const gap = await correctionFor(page, [171.0, 171.0, null, null, null, null, null], DAY[3]);
        eq(gap.cc.days.map((d) => d.date), DAY.slice(3),
            'the forecast starts today, not at the skipped Wednesday');

        // === 7. No days left, no correction =============================
        //
        // Sunday, all seven in, still over target. There is no day left to
        // change and therefore no number to print.
        const done = await correctionFor(page,
            [171.0, 171.0, 171.0, 171.0, 171.0, 171.0, 171.0], DAY[6]);
        ok(done.weekAvg > TARGET, 'the week finished over target');
        eq(done.cc, null, 'a finished week has no correction left');

        // === 8. No plan, no correction ==================================
        const planless = await page.evaluate((days) => {
            const log = [{ date: days[0], weight: 175.0, loggedAt: days[0] + 'T07:00:00.000Z' }];
            return courseCorrection(planProgress(null, log, days[1]), log, days[1]);
        }, DAY);
        eq(planless, null, 'without a plan there is no target to correct toward');

        eq(errors, [], 'no console errors');
        console.log('PASS: the course correction arithmetic holds.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
