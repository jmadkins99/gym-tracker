// What this test covers
// ----------------------
// The check-in card carries the week's target BEFORE the reading, not only
// after it. Case 99 owns what that block says under a running plan; this one
// owns when it is on screen.
//
// The card is opened to weigh in, which is the exact moment the number being
// chased is worth knowing — and until September 2026 that was the one moment it
// was missing. The pre-check-in card was an input and nothing else: date,
// prompt, field, button. "Weight to beat" and the distance to it appeared only
// once the reading was committed, so the figure you wanted on the way to the
// scale was a trip into History or a memory.
//
// So the input state now renders the same block, off the same `headline`, and
// what is asserted here is that sameness rather than two similar-looking
// screens: the label, the number and the distance are read before the check-in
// and again after it. Here the reading pulls the week's average under its
// target, so the line flips from a distance still to go to a distance already
// past — while the target itself, the figure both sentences are about, stays
// on screen.
//
// The pre-check-in card is still the input state and not a preview of the
// read-back one: the field is present and the reading's hero is not.
//
// The plan is anchored to this week's Monday so week 5's target is 172.5
// whatever weekday the suite runs on, and every reading is seeded in COMPLETED
// weeks — none in the week in progress. That is what keeps the expected gap
// fixed: `actual` is the last week that has readings, which on a Monday would
// otherwise be a different week than on a Friday.

const { start } = require('../lib/server');
const { launch, attachConsole, waitFor } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';

// Plan week 5 is the week in progress: 180.0 - 1.5 * 5.
const TARGET = 172.5;
// Last week's mean, exactly: the seven readings below sum to 1211.0.
const LAST_WEEK_AVG = 173.0;
const TODAY_WEIGHT = 170.0;

const seed = (page) => page.evaluate((ns) => {
    const pad = (n) => String(n).padStart(2, '0');
    const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const shift = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };

    const monday = getMondayOfWeek(new Date());
    const planStart = shift(monday, -28);

    // Four completed weeks, none of them flat (a flat week is treated as
    // typed-in history and would take the badges with it), and nothing at all
    // in the week in progress.
    const WEEKS = [
        [176.4, 176.0, 176.3, 175.8, 175.5, 175.9, 175.6],
        [175.3, 175.0, 174.7, 175.1, 174.5, 174.2, 174.6],
        [174.3, 174.0, 173.8, 174.1, 173.6, 173.4, 173.7],
        [173.4, 172.6, 173.2, 172.8, 173.1, 172.9, 173.0],
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
        target: el('.weigh-trend-value') ? parseFloat(el('.weigh-trend-value').textContent) : null,
        foot: el('.weigh-rate') ? el('.weigh-rate').textContent.trim() : null,
        tone: el('.weigh-rate') ? el('.weigh-rate').className : null,
        hasInput: !!el('.weigh-input'),
        hasHero: !!el('.weigh-hero'),
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

        // === Before the reading =========================================
        const before = await card(page);
        ok(before.hasInput, 'the card is still the input state before check-in');
        ok(!before.hasHero, 'and shows no reading yet');
        eq(before.label, 'Weight to beat',
            'the target block is on screen before the reading, not only after it');
        eq(before.target, TARGET, "the target is the plan's week, read before check-in");
        eq(before.foot, '0.5 pounds away',
            'the distance is measured from the last week that has readings: ' + before.foot);
        ok(before.tone.includes('behind'),
            'short of the target reads as behind before check-in too: ' + before.tone);

        // === After it ===================================================
        await checkIn(page, TODAY_WEIGHT);
        const after = await card(page);
        ok(after.hasHero, 'checking in switches the card to the read-back state');
        // The hero is the week's AVERAGE. This fixture seeds nothing in the
        // week in progress, so today's reading is that week's only one and the
        // two coincide here — which is what lets this case stay weekday-
        // independent. Case 99 phase 4 is where they are pulled apart.
        eq(after.hero, TODAY_WEIGHT, "the hero is the week's average, which here is today's reading");
        ok(!after.hasInput, 'and the field is gone');
        eq(after.label, before.label, 'the block is the same one, not a second version of it');
        // The week in progress had no readings, so today's is its whole
        // average: 170.0 against a 172.5 target is 2.5 under. Beaten, and the
        // target is still what the block names.
        eq(after.target, TARGET, 'a beaten target is still the weight to beat');
        eq(after.foot, (TARGET - TODAY_WEIGHT).toFixed(1) + ' pounds under',
            'the distance follows the new week average: ' + after.foot);
        ok(after.tone.includes('good'), 'a beaten target reads as a win: ' + after.tone);

        // A sanity check that the fixture is what the assertions above assume:
        // the pre-check-in distance is last week's mean against the target.
        eq(Math.round((LAST_WEEK_AVG - TARGET) * 10) / 10, 0.5,
            'the fixture puts last week half a pound over the target');

        eq(errors, [], 'no console errors');
        console.log('PASS: the check-in card shows the week\'s target before the reading.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
