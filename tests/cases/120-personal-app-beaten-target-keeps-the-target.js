// What this test covers
// ----------------------
// A week whose average is already UNDER the plan's target. "Weight to beat"
// keeps naming the target, and the line beneath it flips from how far there
// is to go to how far past it the week already is — "2.5 pounds under".
//
// This case was written in September 2026 to pin the opposite rule. For a
// fortnight the block swapped to the week's average when the target was
// beaten, on the reasoning that a cleared target is not what you walk onto
// the scale to beat — where the week stands is. That reasoning held only
// while the average had nowhere else to be. The card's hero is the week's
// average now, so the swap printed one number twice and took the figure the
// sentence is about off the screen: "2.5 pounds over" what, exactly, once
// 172.5 is gone from the card?
//
// So the two slots divide the work. The hero is where the week IS. The block
// is what it is being measured against, in every state — behind it, on it, or
// past it. This case asserts they are two different numbers, before the
// reading and after it, which is the assertion the old arrangement failed.
//
// Case 101 covers a week still ABOVE its target; case 99 covers all three
// distances on one plan, and is where the hero is pulled apart from today's
// reading.
//
// The fixture follows case 101: the plan starts four weeks before this
// Monday, so week 5 (target 172.5) is the week in progress, and every reading
// is in a COMPLETED week. The gap is then fixed whatever weekday the suite
// runs on. Last week's mean is exactly 170.0, which is 2.5 under the target.
//
// Mutation checks: restore the beaten-week swap and both phases read 170.0 /
// 171.0 in the block and phase 3's distinctness assertion fails; point the
// hero back at today's reading and phase 2's hero still passes (the week in
// progress holds one reading) but case 99 phase 4 fails, which is why that
// one exists.

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

        // === 1. Before the reading: the target stays, the line flips ======
        const before = await card(page);
        ok(before.hasInput, 'the card is the input state before check-in');
        eq(before.label, 'Weight to beat', 'the label is unchanged');
        eq(before.value, TARGET,
            'a beaten target is still the target the block names');
        eq(before.foot, (TARGET - LAST_WEEK_AVG).toFixed(1) + ' pounds under',
            'the line says how far past the target the week is: ' + before.foot);
        ok(before.tone.includes('good'), 'under target reads as a win: ' + before.tone);
        ok(!before.tone.includes('behind'), 'and not as behind: ' + before.tone);

        // === 2. After it: the hero is the week, the block is the target ===
        // The week in progress had no readings, so today's is its average.
        await checkIn(page, TODAY_WEIGHT);
        const after = await card(page);
        eq(after.hero, TODAY_WEIGHT, "the hero is the new week's average");
        eq(after.value, TARGET, 'the target does not move when the check-in lands');
        eq(after.foot, (TARGET - TODAY_WEIGHT).toFixed(1) + ' pounds under',
            'the distance follows the new week average: ' + after.foot);
        ok(after.tone.includes('good'), 'still under target: ' + after.tone);

        // === 3. The card is not saying one number twice ==================
        //
        // The whole point of the arrangement: where the week stands and what
        // it is measured against are two slots holding two figures. Under the
        // swap this case used to pin, both of these read the same number.
        ok(before.hero === null, 'the input state has no hero to duplicate');
        ok(after.hero !== after.value,
            'the hero and the weight to beat must be different numbers, both read '
            + after.hero);

        eq(errors, [], 'no console errors');
        console.log('PASS: a beaten target keeps the target as the weight to beat.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
