// What this test covers
// ----------------------
// The "View Course Correction" button and the forecast day rows it opens,
// September 2026. Case 121 owns the arithmetic against hand-computed
// constants; this case owns when the button is on screen and what the ledger
// does when it is pressed, and it asserts the numbers as PROPERTIES rather
// than as literals — constant step, lands on target — so it cannot quietly
// become a second copy of the implementation it is checking.
//
// Three rules put the button on screen, and all three are load-bearing:
//
//   - The projection has to be open. The correction is a forecast, and the
//     ledger's resting state is the record. It lives inside the same opt-in
//     the projected weeks live behind rather than adding a second one.
//   - The week has to be over its target. A week on or under it has nothing
//     to correct, and the card already calls that a win.
//   - It has to be the CURRENT week. Week 1 of this fixture finished over its
//     own target and gets no button: a week that is over is a fact, and there
//     are no days left in it to forecast.
//
// The fixture holds the week in progress flat at 173.5 against a 172.5
// target, which is what makes this case weekday-independent: the week's
// average is 173.5 whether one day is logged or six, so it is over target on
// every day of the week. Today is deliberately left UNWEIGHED, so there is
// always at least one day for the correction to work with — including on a
// Sunday, where a fully logged week would have none.
//
// Monday is the one day that genuinely has nothing to say: the week has no
// readings yet, so there is no average to be over target, and the case
// asserts the button's absence instead. That is the rule, not a hole in the
// fixture.
//
// Mutation checks: drop the showProjection guard and phase 1 fails; render
// the button on every week and phase 2's count fails; let a past week keep it
// and phase 2 fails too; render the forecast as editable NA rows and phase 4
// fails; forget to clear it when the projection closes and phase 6 fails.

const { start } = require('../lib/server');
const { launch, attachConsole, waitFor } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';

// Plan week 5 is the week in progress: 180.0 - 1.5 * 5.
const TARGET = 172.5;
// The week in progress, held flat so its average does not move with the
// weekday. A pound over target, every day of the week.
const THIS_WEEK = 173.5;

const seed = (page) => page.evaluate((ns, thisWeek) => {
    const pad = (n) => String(n).padStart(2, '0');
    const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const shift = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };

    const monday = getMondayOfWeek(new Date());
    const planStart = shift(monday, -28);

    // Four completed weeks, none of them flat. Week 1 finishes at 178.9
    // against a 178.5 target — over it, on purpose: it is the week that proves
    // the button belongs to the CURRENT week rather than to any week that
    // happens to be behind.
    const WEEKS = [
        [179.4, 179.0, 179.3, 178.8, 178.5, 178.9, 178.6],
        [175.3, 175.0, 174.7, 175.1, 174.5, 174.2, 174.6],
        [173.3, 173.0, 172.8, 173.1, 172.6, 172.4, 172.7],
        [170.4, 169.6, 170.2, 169.8, 170.1, 169.9, 170.0],
    ];
    const log = [];
    WEEKS.forEach((week, w) => week.forEach((weight, i) => {
        const d = shift(planStart, w * 7 + i);
        log.push({ date: key(d), weight, loggedAt: new Date(d).toISOString() });
    }));

    // The week in progress: Monday up to but NOT including today.
    const today = key(new Date());
    for (let d = new Date(monday); key(d) < today; d = shift(d, 1)) {
        log.push({ date: key(d), weight: thisWeek, loggedAt: new Date(d).toISOString() });
    }

    localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
    localStorage.setItem(ns + 'weightHistorySeeded', 'true');
    localStorage.setItem(ns + 'gymWeightPlan', JSON.stringify({
        startDate: key(planStart), startWeight: 180.0, goalWeight: 165, ratePerWeek: 1.5, weeks: 12,
    }));
    return { today, monday: key(monday) };
}, NS, THIS_WEEK);

const goHistory = (page) => page.evaluate(() => {
    Array.from(document.querySelectorAll('.bottom-nav-btn'))
        .find((b) => b.textContent.includes('History')).click();
});

const correctionButtons = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('.weigh-correction-btn')).map((b) => ({
        text: b.textContent.trim(),
        // Which week row it belongs to, read off the row it is rendered in.
        week: b.closest('.weigh-week').querySelector('.history-date').textContent.trim(),
    })));

const toggleProjection = (page) => page.evaluate(() =>
    document.querySelector('.weigh-project-btn').click());

// The forecast rows, newest-first as the ledger renders them.
const forecastRows = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('.weigh-day.forecast')).map((el) => ({
        date: el.querySelector('.weigh-day-date').textContent.trim(),
        weight: parseFloat(el.querySelector('.weigh-day-value').textContent),
        editable: !!el.querySelector('button'),
    })));

// Monday is 1, Sunday is 7.
const weekdayIndex = (page) => page.evaluate(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
});

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

        await goHistory(page);
        await waitFor(page, 'the weekly ledger', () => !!document.querySelector('.weigh-week'));

        const n = await weekdayIndex(page);

        // === 1. Closed projection, no button ============================
        //
        // The correction is a forecast. It does not appear in the ledger's
        // resting state, and it does not get an opt-in of its own.
        eq(await correctionButtons(page), [],
            'no correction button while the projection is collapsed');

        await waitFor(page, 'the projection toggle',
            () => !!document.querySelector('.weigh-project-btn'));
        await toggleProjection(page);
        await waitFor(page, 'the projection to open',
            () => document.querySelector('.weigh-project-btn').classList.contains('open'));

        if (n === 1) {
            // Monday: the week in progress has no readings at all, so there is
            // no average to be over target and nothing to correct toward.
            eq(await correctionButtons(page), [],
                'a week with no readings yet gets no correction button');
            eq(errors, [], 'no console errors');
            console.log('PASS: Monday has no week to correct yet.');
            return;
        }

        // === 2. Open projection: exactly one button, on this week ========
        //
        // Week 1 of the fixture also finished over its target. It gets no
        // button: a finished week is a fact, not a thing to steer.
        const buttons = await correctionButtons(page);
        eq(buttons.length, 1, 'exactly one correction button: ' + JSON.stringify(buttons));
        eq(buttons[0].text.toUpperCase().includes('COURSE CORRECTION'), true,
            'the button says what it is: ' + buttons[0].text);
        const thisMonday = await page.evaluate(() => {
            const pad = (x) => String(x).padStart(2, '0');
            const d = getMondayOfWeek(new Date());
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
        ok(buttons[0].week.includes(thisMonday),
            'and it belongs to the current week (' + thisMonday + '): ' + buttons[0].week);

        // === 3. No forecast rows until it is pressed ====================
        eq(await forecastRows(page), [], 'the forecast is behind the button, not beside it');

        await page.evaluate(() => document.querySelector('.weigh-correction-btn').click());
        await waitFor(page, 'the forecast rows', () => !!document.querySelector('.weigh-day.forecast'));

        // === 4. The forecast covers today and every day after it ========
        //
        // Today is unweighed in this fixture, so it is the first day the
        // correction can act on. Sunday is the last.
        const rows = await forecastRows(page);
        eq(rows.length, 8 - n,
            'one forecast row per remaining day (today through Sunday): '
            + JSON.stringify(rows));
        ok(rows.every((r) => !r.editable),
            'a forecast is not a reading and must not offer an edit: '
            + JSON.stringify(rows));

        // The ledger runs newest-first, so these descend in time. Read them
        // chronologically to check the shape.
        const chron = rows.slice().reverse().map((r) => r.weight);
        ok(chron.every((w, i) => i === 0 || w < chron[i - 1]),
            'every forecast day is below the one before it: ' + JSON.stringify(chron));

        // A CONSTANT daily loss, which is the whole point: the same step every
        // morning rather than a curve.
        //
        // Measured in whole tenths, as integers, because that is the only
        // form in which this question has a clean answer. The rows are
        // rounded to a tenth for display, so a true step of a third of a
        // pound prints as 0.4, 0.3, 0.3, 0.4, 0.3 — neighbouring differences
        // that are not equal and never can be. What a rounded constant step
        // IS guaranteed to produce is at most two distinct step sizes, one
        // tenth apart, and nothing else does: a curve drifts to three or
        // more, and a flat stretch shows a zero.
        //
        // Floating point never enters it. Comparing 0.4 - 0.3 against 0.1 in
        // doubles is how the first version of this assertion failed against
        // arithmetic that was already correct.
        if (chron.length > 2) {
            const tenths = chron.map((w) => Math.round(w * 10));
            const steps = tenths.slice(1).map((t, i) => tenths[i] - t);
            const lo = Math.min.apply(null, steps);
            const hi = Math.max.apply(null, steps);
            ok(lo > 0, 'every step must be a loss, got tenths: ' + JSON.stringify(steps));
            ok(hi - lo <= 1,
                'a constant daily loss rounds to at most two step sizes a tenth apart, got: '
                + JSON.stringify(steps) + ' from ' + JSON.stringify(chron));
        }

        // === 5. And the week actually lands on target ===================
        //
        // The property the whole feature exists for, checked against the
        // fixture's own numbers rather than against the function that
        // produced the rows: (n-1) days already logged at 173.5, plus the
        // forecast days, over seven, is the target.
        const sum = THIS_WEEK * (n - 1) + chron.reduce((s, w) => s + w, 0);
        const landed = sum / 7;
        ok(Math.abs(landed - TARGET) < 0.06,
            'the corrected week must average its ' + TARGET + ' target, got '
            + landed.toFixed(3) + ' from ' + JSON.stringify(chron));

        // === 6. Closing the projection takes the correction with it =====
        //
        // It was opened from inside the projection and it is the same kind of
        // claim about the future, so it does not outlive it.
        await toggleProjection(page);
        await waitFor(page, 'the projection to close',
            () => !document.querySelector('.weigh-project-btn').classList.contains('open'));
        eq(await correctionButtons(page), [], 'the button goes with the projection');
        eq(await forecastRows(page), [], 'and so do the forecast rows');

        eq(errors, [], 'no console errors');
        console.log('PASS: the course correction button and its forecast rows.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
