// What this test covers
// ----------------------
// Once the week's average is under the plan's target, "Weight to beat" shows
// that average instead of the target, before the reading and after it. Added
// September 2026.
//
// A beaten target is not worth walking onto the scale for: you already cleared
// it. What you still want to beat is where the week stands. So the card swaps
// the number to the week's average, and since the plan's figure has left the
// headline, the line under it names it: "2.5 pounds over 172.5 goal". After
// the check-in, the big number is the reading just entered.
//
// Case 101 covers the other side: a week still ABOVE its target keeps the
// target before check-in.
//
// The fixture follows case 101: the plan starts four weeks before this
// Monday, so week 5 (target 172.5) is the week in progress, and every reading
// is in a COMPLETED week. The gap is then fixed whatever weekday the suite runs
// on. Last week's mean is exactly 170.0, which is 2.5 under the target.
//
// Mutation check: keep the plan's target when it is beaten and both phases
// read 172.5; drop the goal from the line and both feet fail.

const { start } = require('../lib/server');
const { launch, attachConsole, waitFor } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';

// Plan week 5 is the week in progress: 180.0 - 1.5 * 5.
const TARGET = 172.5;
// Last week's mean, exactly: the seven readings below sum to 1190.0.
const LAST_WEEK_AVG = 170.0;
const TODAY_WEIGHT = 171.0;

const seed = (page) => page.evaluate((ns) => {
    const pad = (n) => String(n).padStart(2, '0');
    const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const shift = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };

    const monday = getMondayOfWeek(new Date());
    const planStart = shift(monday, -28);

    // Four completed weeks, none of them flat (a flat week is treated as
    // typed-in history), and nothing in the week in progress.
    const WEEKS = [
        [176.4, 176.0, 176.3, 175.8, 175.5, 175.9, 175.6],
        [175.3, 175.0, 174.7, 175.1, 174.5, 174.2, 174.6],
        [173.3, 173.0, 172.8, 173.1, 172.6, 172.4, 172.7],
        [170.4, 169.6, 170.2, 169.8, 170.1, 169.9, 170.0],
    ];
    const log = [];
    WEEKS.forEach((week, w) => week.forEach((weight, i) => {
        const d = shift(planStart, w * 7 + i);
        log.push({ date: key(d), weight, loggedAt: new Date(d).toISOString() });
    }));

    localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
    localStorage.setItem(ns + 'weightHistorySeeded', 'true');
    localStorage.setItem(ns + 'gymWeightPlan', JSON.stringify({
        startDate: key(planStart), startWeight: 180.0, goalWeight: 165, ratePerWeek: 1.5, weeks: 12,
    }));
}, NS);

const card = (page) => page.evaluate(() => {
    const el = (s) => document.querySelector(s);
    return {
        label: el('.weigh-trend-label') ? el('.weigh-trend-label').textContent.trim() : null,
        value: el('.weigh-trend-value') ? parseFloat(el('.weigh-trend-value').textContent) : null,
        foot: el('.weigh-rate') ? el('.weigh-rate').textContent.trim() : null,
        tone: el('.weigh-rate') ? el('.weigh-rate').className : null,
        hasInput: !!el('.weigh-input'),
        hero: el('.hero-weight') ? parseFloat(el('.hero-weight').textContent) : null,
    };
});

const checkIn = async (page, weight) => {
    await page.evaluate((w) => {
        const input = document.querySelector('.weigh-input');
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        set.call(input, w);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }, String(weight));
    await new Promise(r => setTimeout(r, 120));
    await page.evaluate(() => document.querySelector('.weigh-submit').click());
    await waitFor(page, 'the read-back state', () => !!document.querySelector('.weigh-hero'));
};

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

        // === 1. Before the reading: the average is the number to beat =====
        const before = await card(page);
        ok(before.hasInput, 'the card is the input state before check-in');
        eq(before.label, 'Weight to beat', 'the label is unchanged');
        eq(before.value, LAST_WEEK_AVG,
            'a beaten target gives way to the week average as the weight to beat');
        eq(before.foot, (TARGET - LAST_WEEK_AVG).toFixed(1) + ' pounds over ' + TARGET + ' goal',
            'the line measures the average against the named plan goal: ' + before.foot);
        ok(before.tone.includes('good'), 'under target reads as a win: ' + before.tone);

        // === 2. After it: the reading is the hero, the average to beat ====
        // The week in progress had no readings, so today's is its average.
        await checkIn(page, TODAY_WEIGHT);
        const after = await card(page);
        eq(after.hero, TODAY_WEIGHT, 'the hero is the reading just entered');
        eq(after.value, TODAY_WEIGHT, 'the weight to beat is the new week average');
        eq(after.foot, (TARGET - TODAY_WEIGHT).toFixed(1) + ' pounds over ' + TARGET + ' goal',
            'the distance follows the new week average: ' + after.foot);

        eq(errors, [], 'no console errors');
        console.log('PASS: a beaten target shows the week average as the weight to beat.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
