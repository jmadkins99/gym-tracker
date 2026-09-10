// What this test covers
// ----------------------
// The plan editor derives one of its numbers instead of accepting it,
// September 2026.
//
// Start, goal, rate and length state the same straight line twice: any three
// fix the fourth. The editor used to take all four, and nothing reconciled
// them — the target line was built from rate x weeks while the progress bar,
// "to go" and the projected finish were built from the goal weight, so a plan
// typed as 175 -> 145 at 2.5 lb/wk over 16 weeks quietly asked for 40 lb while
// reporting against 30, and no screen ever said so.
//
// So one of goal / rate / length is solved for, chosen by the picker and
// remembered on the plan. Start weight is never it: it is a fact about the
// scale rather than a choice.
//
// The fixture is exactly the plan that exposed the bug — 175 / 145 / 2.5 / 16,
// with no `solveFor`, as a plan saved before any of this existed. Everything
// asserted about it is arithmetic that has one right answer:
//
//   - solving for length: 30 lb at 2.5 = 12 weeks, not the 16 stored
//   - solving for rate:   30 lb over 12 weeks = 2.5 lb/wk
//   - saved:              startWeight - rate*weeks lands ON goalWeight
//
// Phase 2 switching the picker to Rate is what pins the carry-over: the 12 the
// editor just worked out becomes the length input, so the plan on screen does
// not change under you when you change which end is held fixed. A version that
// reverted the field to its stored text would put 16 back and derive 1.875.
//
// Phase 4 re-reads the saved plan through planWeightForWeek and planProgress
// together — the two readings that used to disagree — and pins them to the same
// number at the final week. That is the actual bug, stated as an assertion.
//
// Mutation checks: drop the ceil in derivePlanField and phase 3's 11-week case
// reads 10; leave the solved-for field's typed text in `typed` and phase 1
// derives 16 from itself; drop the carry-over in chooseSolveFor and phase 2
// reads 1.875; save the draft's raw fields instead of `resolved` and phase 4
// fails on the plan that was just saved.

const { start } = require('../lib/server');
const { launch, attachConsole, waitFor } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok, contains } = require('../lib/assert');

const NS = 'gym-local:';

// The plan that motivated the change, with all four numbers typed in and no
// recorded preference — the shape every plan saved before this has.
const PLAN = {
    name: 'Test cut',
    startWeight: 175,
    goalWeight: 145,
    ratePerWeek: 2.5,
    weeks: 16,
};

// The editor's rows, keyed by label, with a flag for the one being derived.
const planFields = (page) => page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.plan-field').forEach((row) => {
        const label = row.querySelector('.plan-field-label').textContent.trim();
        const derived = row.querySelector('.plan-field-derived');
        const input = row.querySelector('input');
        out[label] = {
            value: derived ? derived.textContent.trim() : (input ? input.value : null),
            derived: !!derived,
        };
    });
    return out;
});

const clickPill = (page, label) => page.evaluate((text) => {
    Array.from(document.querySelectorAll('.plan-solve-toggle .day-pill'))
        .find((b) => b.textContent.trim() === text).click();
}, label);

// Types into one of the editor's inputs the way a person does, so React's
// onChange actually runs.
const typeInto = async (page, label, text) => {
    const handle = await page.evaluateHandle((lbl) => {
        const row = Array.from(document.querySelectorAll('.plan-field'))
            .find((r) => r.querySelector('.plan-field-label').textContent.trim() === lbl);
        return row.querySelector('input');
    }, label);
    await handle.click({ clickCount: 3 });
    await handle.press('Backspace');
    await handle.type(text);
};

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);

        await page.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        // Dates are built in-page: the week bucket is a LOCAL Monday, and a
        // fixture built in node's timezone lands the plan a week off whenever
        // the two disagree.
        await page.evaluate((ns, plan) => {
            const pad = (n) => String(n).padStart(2, '0');
            const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const monday = new Date(today);
            monday.setDate(monday.getDate() + (monday.getDay() === 0 ? -6 : 1 - monday.getDay()));

            localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(
                [{ date: key(today), weight: 174, loggedAt: new Date().toISOString() }]));
            localStorage.setItem(ns + 'weightHistorySeeded', 'true');
            localStorage.setItem(ns + 'gymWeightPlan',
                JSON.stringify(Object.assign({ startDate: key(monday) }, plan)));
        }, NS, PLAN);

        await page.reload({ waitUntil: 'networkidle0' });
        await waitFor(page, 'the check-in card to render',
            () => !!document.querySelector('.weigh-card'));

        // === 1. The stored plan is called out, and opens solving for length ===
        await page.click('.settings-btn');
        await waitFor(page, 'settings to open', () => !!document.querySelector('.modal-title'));

        ok(await page.$('.plan-warn'), 'a plan whose numbers disagree says so before it is opened');
        contains(await page.$eval('.plan-warn', (el) => el.textContent.replace(/\s+/g, ' ').trim()),
                 '135.0 lb, not 145.0',
                 'and says where the rate and the length actually land');

        await page.evaluate(() => {
            Array.from(document.querySelectorAll('.modal-btn'))
                .find((b) => b.textContent.includes('Edit plan')).click();
        });
        await waitFor(page, 'the plan editor to open', () => !!document.querySelector('.plan-solve'));

        let fields = await planFields(page);
        eq(fields['Start weight'], { value: '175', derived: false },
           'start weight is always an input — it is a fact, not a choice');
        eq(fields['Goal weight'], { value: '145', derived: false }, 'the goal is kept');
        eq(fields['Target rate'], { value: '2.5', derived: false }, 'so is the rate');
        eq(fields['Length'], { value: '12', derived: true },
           'and the length is derived: 30 lb at 2.5 lb/wk is 12 weeks, not the 16 stored');

        contains(await page.$eval('.plan-field-derived', (el) => el.textContent), '12',
           'the derived field is a readout rather than an input');

        // === 2. Switching which field is solved for carries the number over ===
        await clickPill(page, 'Rate');
        fields = await planFields(page);
        eq(fields['Length'], { value: '12', derived: false },
           'the length it just worked out becomes the input, rather than the stored 16');
        eq(fields['Target rate'], { value: '2.5', derived: true },
           '30 lb over those 12 weeks is the 2.5 lb/wk that was already there');

        await clickPill(page, 'Goal');
        fields = await planFields(page);
        eq(fields['Goal weight'], { value: '145', derived: true },
           '175 at 2.5 lb/wk for 12 weeks is the 145 goal, from the other direction');

        // === 3. A rate that does not divide rounds the length UP ============
        await clickPill(page, 'Length');
        await typeInto(page, 'Target rate', '2.8');
        fields = await planFields(page);
        eq(fields['Length'], { value: '11', derived: true },
           '30 lb at 2.8 lb/wk is 10.7 weeks, and a length is a count of Mondays');
        contains(await page.$eval('.plan-note', (el) => el.textContent.replace(/\s+/g, ' ').trim()),
                 'overshoots',
                 'and the week that overshoots the goal is said out loud');

        // === 4. What gets saved is a plan whose four numbers agree ==========
        await typeInto(page, 'Target rate', '2.5');
        await page.evaluate(() => {
            Array.from(document.querySelectorAll('.modal-btn'))
                .find((b) => b.textContent.includes('Save plan')).click();
        });
        await waitFor(page, 'the editor to close', () => !document.querySelector('.plan-solve'));

        const saved = await page.evaluate((ns) => {
            const plan = JSON.parse(localStorage.getItem(ns + 'gymWeightPlan'));
            const log = JSON.parse(localStorage.getItem(ns + 'gymWeightLog'));
            const progress = planProgress(plan, log, log[0].date);
            return {
                plan,
                // The two readings of the plan that used to disagree: where the
                // target line ends, and what the progress bar counts down to.
                lastWeekTarget: planWeightForWeek(plan, plan.weeks),
                goalPounds: progress.goalPounds,
                targetDate: progress.targetDate,
            };
        }, NS);

        eq(saved.plan.weeks, 12, 'the derived length is what was written');
        eq(saved.plan.goalWeight, 145, 'the goal typed in survives');
        eq(saved.plan.ratePerWeek, 2.5, 'so does the rate');
        eq(saved.plan.solveFor, 'weeks', 'and which field was derived is remembered');
        eq(saved.lastWeekTarget, saved.plan.goalWeight,
           'the target line now ENDS on the goal weight — the whole point');
        eq(saved.goalPounds, 30, 'and the bar counts down the same 30 lb the line covers');

        // Reopened, a reconciled plan has nothing left to complain about.
        await page.evaluate(() => {
            Array.from(document.querySelectorAll('.modal-btn'))
                .find((b) => b.textContent.includes('Edit plan')).click();
        });
        await waitFor(page, 'the plan editor to reopen', () => !!document.querySelector('.plan-solve'));
        fields = await planFields(page);
        eq(fields['Length'].derived, true, 'it reopens on the field it was solving for');
        eq(fields['Length'].value, '12', 'showing the same length');

        eq(errors, [], 'no console errors');
        console.log('PASS');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
