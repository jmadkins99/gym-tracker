// What this test covers
// ----------------------
// The bottom of the rep dropdown is a failed set, and a failed set is never a
// PR — not on the card, not in History, not in the Day Breakdown count.
//
// The case worth naming is the one that used to score: load MORE weight than
// last session and then only get three reps. isImprovement returned true on the
// weight alone, so the app congratulated the user for the set they failed. The
// whole point of the 3 is that it is where the set died; it is not a rep count
// anyone trains for.
//
// Seeded posterior history, two sessions:
//
//   Kelso Shrugs           190x5 -> 200x3  weight UP, failed set: no PR  <- the bug
//   Transverse Plane Rows  100x5 -> 105x4  weight UP, real set:   PR     <- control
//   Shoulder Flexion Curls  55x4 ->  55x3  same weight, down to 3: no PR
//
// The controls matter in both directions: without Transverse Plane Rows this
// case would also pass against an app that had stopped awarding PRs entirely.
//
// A failed set is still a baseline — the machine gave you what it gave you —
// so coming back and getting four reps at that same weight is a genuine
// improvement. The tail of this case pins that, and pins the logged-card pill
// (the pre-submit face of the same verdict) on both a failed and a real set.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { ACTIVE, bottomNav, goToCardById, logCard, revealCard } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const dayOffset = (days, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};

const BASELINE = workoutEntry({
    date: dayOffset(-4, 9),
    day: 'posterior',
    submitted: true,
    exercises: [
        { id: 'kelso-shrugs', name: 'Kelso Shrugs', weight: '190', reps: '5' },
        { id: 'upper-back-row', name: 'Transverse Plane Rows', weight: '100', reps: '5' },
        { id: 'preacher-curls', name: 'Preacher Curls', weight: '55', reps: '4' },
    ],
});

const LATEST = workoutEntry({
    date: dayOffset(-2, 9),
    day: 'posterior',
    submitted: true,
    exercises: [
        { id: 'kelso-shrugs', name: 'Kelso Shrugs', weight: '200', reps: '3' },
        { id: 'upper-back-row', name: 'Transverse Plane Rows', weight: '105', reps: '4' },
        { id: 'preacher-curls', name: 'Preacher Curls', weight: '55', reps: '3' },
    ],
});

// Display names as today's config renders them; the seeds above carry the
// stored name, which History does not use.
const NAMES = {
    'kelso-shrugs': 'Kelso Shrugs',
    'upper-back-row': 'Transverse Plane Rows',
    'preacher-curls': 'Shoulder Flexion Curls',
};

async function enterSet(page, exerciseId, weight, reps) {
    await goToCardById(page, exerciseId);
    await revealCard(page);
    await page.evaluate((sel, w, r) => {
        const card = document.querySelector(sel);

        const input = card.querySelector('input[type="number"][inputmode="decimal"]');
        const inputSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set;
        inputSetter.call(input, w);
        input.dispatchEvent(new Event('input', { bubbles: true }));

        const select = card.querySelector('select[data-field="reps"]');
        const selectSetter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, 'value').set;
        selectSetter.call(select, r);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }, ACTIVE, weight, reps);
    await new Promise(r => setTimeout(r, 120));
}

async function readCardBadge(page, exerciseId) {
    await goToCardById(page, exerciseId);
    await revealCard(page);
    return page.evaluate((sel) => {
        const badge = document.querySelector(sel + ' .streak-badge');
        return badge ? badge.textContent.trim() : null;
    }, ACTIVE);
}

// The newest History entry, keyed by exercise name.
async function readHistoryBadges(page) {
    return page.evaluate(() => {
        const out = {};
        const latest = document.querySelector('.history-item');
        if (!latest) return out;
        latest.querySelectorAll('.history-exercise').forEach((row) => {
            const name = row.querySelector('.history-exercise-name');
            if (!name) return;
            const badge = row.querySelector('[data-pr-badge]');
            out[name.textContent.trim()] = badge ? badge.textContent.trim() : null;
        });
        return out;
    });
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [LATEST, BASELINE] });
        await page.evaluate(() => localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'posterior');

        // === 1. The arbiter, directly ===================================
        // isImprovement is the one rule behind every surface below, so name it
        // here before walking through three screens that only echo it.
        const verdicts = await page.evaluate(() => {
            const at = (weight, reps) => ({ id: 'kelso-shrugs', type: 'standard', weight, reps });
            const last = at('190', '5');
            return {
                moreWeightFailed: isImprovement(at('200', '3'), last),
                moreWeightReal: isImprovement(at('200', '4'), last),
                sameWeightFailed: isImprovement(at('190', '3'), last),
                failedBeatsFailed: isImprovement(at('200', '3'), at('190', '3')),
                offAFailedSet: isImprovement(at('190', '4'), at('190', '3')),
            };
        });
        eq(verdicts.moreWeightFailed, false,
            'three reps is a failed set, even carrying more weight than last session');
        eq(verdicts.moreWeightReal, true,
            'four reps at that same heavier weight is a PR — the probe is not vacuous');
        eq(verdicts.sameWeightFailed, false, 'and dropping to three at the same weight is not');
        eq(verdicts.failedBeatsFailed, false,
            'a heavier failed set does not beat a lighter failed set either');
        eq(verdicts.offAFailedSet, true,
            'a failed set is still the baseline: four reps at that weight next time is an improvement');

        // === 2. The card's streak pill ==================================
        eq(await readCardBadge(page, 'kelso-shrugs'), null,
            'no streak pill for a weight bump that ended at three reps');
        eq(await readCardBadge(page, 'upper-back-row'), '🔥 1',
            'the same weight bump at four reps still gets one');
        eq(await readCardBadge(page, 'preacher-curls'), null,
            'and dropping to three at the same weight breaks the streak');

        // === 3. History agrees ==========================================
        await bottomNav(page, 'History');
        await page.waitForSelector('.history-item', { timeout: 8000 });
        const badges = await readHistoryBadges(page);

        eq(badges[NAMES['kelso-shrugs']], null,
            'History shows no PR badge for the failed set');
        eq(badges[NAMES['upper-back-row']], '🔥 PR',
            'History does badge the real improvement beside it');
        eq(badges[NAMES['preacher-curls']], null,
            'History shows no PR badge for the drop to three reps');

        // === 4. The logged card, before any Submit Day ==================
        // 210x3 is the bug's exact shape one more time, now through the deck:
        // heavier than the 200 just logged, and still a failed set.
        await bottomNav(page, 'Workout');
        await enterSet(page, 'kelso-shrugs', '210', '3');
        ok(await logCard(page), 'kelso-shrugs: LOG button clicked');
        const failedPill = await page.evaluate((sel) =>
            !!document.querySelector(sel + ' [data-logged-pr-badge]'), ACTIVE);
        eq(failedPill, false, 'the logged card shows no PR pill for a failed set');

        // The real one celebrates and then advances, so read it before the
        // auto-advance rather than after.
        await enterSet(page, 'upper-back-row', '105', '5');
        ok(await logCard(page, { settle: 750, waitForAutoAdvance: false }),
            'upper-back-row: LOG button clicked');
        const realPill = await page.evaluate((sel) => {
            const badge = document.querySelector(sel + ' [data-logged-pr-badge]');
            return badge ? badge.textContent.trim() : null;
        }, ACTIVE);
        eq(realPill, '🔥 2', 'and does show one for the set that actually improved');

        eq(errors, [], 'no console errors');
        console.log('PASS: a set that bottoms out the rep range is a failed set, never a PR.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
