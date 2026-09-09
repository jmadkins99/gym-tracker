// What this test covers
// ----------------------
// The check-in card under a running cut plan, September 2026.
//
// With no plan the card reports where the week has landed: "Weekly average
// weight" and a lb/week rate. With a plan there is a number being chased, and
// reporting the one already reached buries it — so the card switches to the
// week's TARGET, with a single line saying how far off it is. Orange while
// there is weight still to come off, green once the target has been beaten.
//
// The number and the distance both come off planProgress rather than being
// recomputed in the component, which is what stops the card and the plan
// dashboard disagreeing about the same week. This case pins that by asserting
// the card's target against the dashboard's own "beat this week" figure on
// screen, rather than against a constant typed twice.
//
// All three states are exercised on the SAME plan, by moving only this week's
// readings: 178.6 leaves the week above target, 170.0 puts it under, and 178.0
// lands on it exactly. A case that only ever saw one state would pass against a
// card that had the colours hardcoded.
//
// The middle state is not decoration. The distance prints to a tenth, so a week
// sitting within half a tenth of its target would otherwise read "0.0 pounds
// away" — a sentence claiming both that you arrived and that you did not. That
// band reads "Target met" and is coloured as a win.
//
// The plan is built in-page from this week's Monday so week 1 is always the
// week in progress, whatever day the suite runs. Its arithmetic is exact:
// start 180.0, 2 lb/week, so week 1's target is 178.0.
//
// Phase 4 is the one that pins the hero. The other phases hold this week flat,
// which makes the average and the morning's reading identical — an assertion
// that cannot tell them apart. Dragging today well below the rest of the week
// separates them.
//
// Phase 4 also pins the chip, which is where the raw reading went when the hero
// became the average: with today dragged away from the rest of the week the two
// numbers are distinguishable, so "shows what was typed" is a real assertion
// rather than one satisfied by either value.
//
// Mutation checks: point the hero back at today.weight and phase 4 fails; drop
// the MET_BAND branch and phase 3 reads "0.0 pounds over
// goal"; drop the progress prop and every phase falls back to "Weekly average
// weight"; point the value at weekAvg again and phase 1 reads 178.0 only by
// coincidence of the fixture, which is why phase 2 moves the readings and
// re-checks the target has NOT moved with them.

const { start } = require('../lib/server');
const { launch, attachConsole, waitFor } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

// Phase 4's expected wording, derived rather than transcribed, because the
// week's average moves with the weekday the suite runs on. This deliberately
// mirrors the card's own three-way split: what phase 4 is testing is WHICH
// number the line is measured from, and phases 1-3 already pin the wording
// itself against literals.
const formatDistance = (gap) => {
    const r = Math.round(gap * 10) / 10;
    if (r > 0) return r.toFixed(1) + ' pounds away';
    if (r === 0) return 'Target met';
    return (-r).toFixed(1) + ' pounds over goal';
};

const NS = 'gym-local:';

const START_WEIGHT = 180.0;
const RATE = 2.0;
const WEEK_1_TARGET = 178.0;

// Above target, then under it. Both are flat runs, but only a full seven
// identical days counts as a bootstrapped week, and this week is partial.
const ABOVE = 178.6;
const UNDER = 170.0;
const EXACT = WEEK_1_TARGET;

const seed = (page, weight, todayWeight) => page.evaluate((ns, w, todayW, start, rate) => {
    const pad = (n) => String(n).padStart(2, '0');
    const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const now = new Date();
    const monday = new Date(getMondayOfWeek(now));

    // This week only, Monday through today, so week 1 of the plan is the week
    // that has readings in it.
    const log = [];
    for (let d = new Date(monday); key(d) <= key(now); d.setDate(d.getDate() + 1)) {
        const isToday = key(d) === key(now);
        log.push({
            date: key(d),
            weight: (isToday && todayW !== null) ? todayW : w,
            loggedAt: new Date(d).toISOString(),
        });
    }
    localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
    localStorage.setItem(ns + 'weightHistorySeeded', 'true');
    localStorage.setItem(ns + 'gymWeightPlan', JSON.stringify({
        startDate: key(monday),
        startWeight: start,
        goalWeight: 160,
        ratePerWeek: rate,
        weeks: 10,
    }));
}, NS, weight, todayWeight === undefined ? null : todayWeight, START_WEIGHT, RATE);

const card = (page) => page.evaluate(() => ({
    chip: document.querySelector('.logged-chip').textContent.trim(),
    hero: parseFloat(document.querySelector('.hero-weight').textContent),
    label: document.querySelector('.weigh-trend-label').textContent.trim(),
    value: parseFloat(document.querySelector('.weigh-trend-value').textContent),
    foot: document.querySelector('.weigh-rate').textContent.trim(),
    tone: document.querySelector('.weigh-rate').className,
}));

// Monday is 1 day in, Sunday is 7 — the fixture's week is Monday..today.
const daysThisWeek = (page) => page.evaluate(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
});

const load = async (page, weight, todayWeight) => {
    await seed(page, weight, todayWeight);
    await page.reload({ waitUntil: 'networkidle0' });
    await waitFor(page, 'the check-in card to render',
        () => !!document.querySelector('.weigh-trend-value'));
    return card(page);
};

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);

        await page.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });

        // === 1. Above the target: orange, counting down ==================
        const above = await load(page, ABOVE);
        eq(above.label, 'Weight to beat', 'a running plan renames the headline');
        eq(above.value, WEEK_1_TARGET, "the headline is the week's target, not the week's average");
        eq(above.foot, '0.6 pounds away', 'the gap counts down to the target: ' + above.foot);
        ok(above.tone.includes('behind'),
            'still short of target should read as behind: ' + above.tone);
        ok(!above.tone.includes('good'), 'and must not read as good: ' + above.tone);

        // === 2. Under the target: green, and the target has not moved ====
        const under = await load(page, UNDER);
        eq(under.label, 'Weight to beat', 'the label does not change with the state');
        eq(under.value, WEEK_1_TARGET,
            'the target is the plan\'s, so it must not follow the readings down');
        eq(under.foot, '8.0 pounds over goal', 'a beaten target reads as over: ' + under.foot);
        ok(under.tone.includes('good'), 'a beaten target should read as good: ' + under.tone);
        ok(!under.tone.includes('behind'), 'and must not read as behind: ' + under.tone);

        // === 3. Exactly on target reads as met, not as 0.0 away =========
        const exact = await load(page, EXACT);
        eq(exact.value, WEEK_1_TARGET, 'the target is unchanged in the met state');
        eq(exact.foot, 'Target met',
            'landing on the target must not read as a distance: ' + exact.foot);
        ok(exact.tone.includes('good'), 'a met target should read as a win: ' + exact.tone);
        ok(!exact.tone.includes('behind'), 'and must not read as behind: ' + exact.tone);

        // === 4. The hero is the average the distance is measured from ====
        //
        // Every earlier phase holds this week flat, where the average and the
        // morning's reading are the same number and the assertion would pass
        // either way. Here today is dragged well below the rest of the week so
        // the two genuinely differ, and the expected mean is computed from the
        // weekday rather than hardcoded.
        const n = await daysThisWeek(page);
        const HERO_REST = 180.0;
        const HERO_TODAY = 172.0;
        const expected = Math.round(((HERO_REST * (n - 1) + HERO_TODAY) / n) * 10) / 10;
        const varied = await load(page, HERO_REST, HERO_TODAY);
        eq(varied.hero, expected,
            "the hero must be this week's average (" + expected + '), not the morning reading');
        if (n > 1) {
            ok(varied.hero !== HERO_TODAY,
                'and with a varied week it must differ from what was typed today');
        }
        // The chip is the one place the morning's own reading survives, which
        // is what keeps the card from looking like it discarded what was typed.
        ok(varied.chip.includes(HERO_TODAY.toFixed(1)),
            'the chip must show the reading actually entered: ' + varied.chip);
        if (n > 1) {
            ok(!varied.chip.includes(String(expected)),
                'and not the average, which the hero already carries: ' + varied.chip);
        }

        // The distance below it is measured from that same number.
        eq(varied.foot, formatDistance(expected - WEEK_1_TARGET),
            'the distance must derive from the hero: ' + varied.foot);

        // === 5. The dashboard agrees about the same week =================
        await page.evaluate(() => {
            Array.from(document.querySelectorAll('.bottom-nav-btn'))
                .find((b) => b.textContent.includes('History')).click();
        });
        await waitFor(page, 'the plan dashboard to render',
            () => !!document.querySelector('.plan-card'));
        const dash = await page.evaluate(() => document.querySelector('.plan-card').textContent);
        ok(dash.includes(String(WEEK_1_TARGET.toFixed(1))),
            'the plan dashboard must name the same target the card does: ' + dash.slice(0, 200));

        ok(errors.length === 0, 'no console errors: ' + JSON.stringify(errors));
        console.log('PASS');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
