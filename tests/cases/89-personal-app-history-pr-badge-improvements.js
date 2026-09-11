// What this test covers
// ----------------------
// History's "🔥 PR" badge mirrors the "PRs Smashed" count from Day Breakdown.
// It is not a range-top marker: it appears when a standard row improves on that
// exercise's previous valid row.
//
// It also does not wait for Submit Day, in either direction. Today's in-progress
// entry is already in the History list, so the badge lands the moment the set is
// logged — the tail of this case logs two sets and reads History without
// submitting. That cannot disagree with the badge shown after submitting,
// because the baseline isExercisePRInWorkout compares against is simply the last
// session older than the entry being badged, submitted or not (case 67 and case
// 48 pin that; getPreviousExerciseForPR says why).
//
// The regression it guards is reading the badge as a range-top marker. The
// wrist pair used to be the sharpest probe for that — a 5-8 range meant a 6-rep
// improvement was unambiguously mid-range — but both movements left the program
// in Sep 2026 and the 5-8 range went with them. Preacher Curls carries that
// half now: 55x4 -> 55x5 improves without coming near the top of its 3-6
// dropdown, so a "badge only at the range top" reading still fails here.
//
//   Kelso Shrugs        190x5 -> 190x6 card streak yes, History PR yes
//   Preacher Curls       55x4 -> 55x5  card streak yes, History PR yes  <- mid-range
//
// The controls catch the old range-top interpretation:
//
//   Transverse Plane Rows 100x6 -> 95x6  top reps, but a weight drop: no PR
//   Frontal Pulldowns             110x6  top reps, but no prior row: no PR

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { ACTIVE, bottomNav, goToCardById, logCard, revealCard } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const BADGE_BG = 'rgba(0, 0, 0, 0)';
const BADGE_BORDER = 'rgb(212, 175, 55)';

const dayOffset = (days, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};

const EXERCISES = [
    ['frontal-pulldowns', 'Frontal Plane Pulldowns'],
    ['upper-back-row', 'Transverse Plane Rows'],
    ['kelso-shrugs', 'Kelso Shrugs'],
    ['preacher-curls', 'Preacher Curls'],
];

const BASELINE = workoutEntry({
    date: dayOffset(-4, 9),
    day: 'posterior',
    submitted: true,
    exercises: [
        { id: 'upper-back-row', name: 'Transverse Plane Rows', weight: '100', reps: '6' },
        { id: 'kelso-shrugs', name: 'Kelso Shrugs', weight: '190', reps: '5' },
        { id: 'preacher-curls', name: 'Preacher Curls', weight: '55', reps: '4' },
    ],
});

const LATEST = workoutEntry({
    date: dayOffset(-2, 9),
    day: 'posterior',
    submitted: true,
    exercises: [
        { id: 'frontal-pulldowns', name: 'Frontal Plane Pulldowns', weight: '110', reps: '6' },
        { id: 'upper-back-row', name: 'Transverse Plane Rows', weight: '95', reps: '6' },
        { id: 'kelso-shrugs', name: 'Kelso Shrugs', weight: '190', reps: '6' },
        { id: 'preacher-curls', name: 'Preacher Curls', weight: '55', reps: '5' },
    ],
});

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

// The newest History entry, keyed by exercise name.
async function readHistoryRows(page, names) {
    return page.evaluate((wanted) => {
        const rows = {};
        const latest = document.querySelector('.history-item');
        if (!latest) return rows;

        latest.querySelectorAll('.history-exercise').forEach((row) => {
            const name = row.querySelector('.history-exercise-name');
            if (!name || !wanted.includes(name.textContent.trim())) return;

            const badge = row.querySelector('[data-pr-badge]');
            rows[name.textContent.trim()] = {
                badgeText: badge ? badge.textContent.trim() : null,
                badgeClass: badge ? badge.className : null,
                badgeBg: badge ? getComputedStyle(badge).backgroundColor : null,
                badgeBorder: badge ? getComputedStyle(badge).borderTopColor : null,
                badgeRightOfName: badge ? name.nextElementSibling === badge : false,
            };
        });

        return rows;
    }, names);
}

async function readCardBadge(page, exerciseId) {
    await goToCardById(page, exerciseId);
    await revealCard(page);
    return page.evaluate((sel) => {
        const badge = document.querySelector(sel + ' .streak-badge');
        return badge ? badge.textContent.trim() : null;
    }, ACTIVE);
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

        eq(await readCardBadge(page, 'preacher-curls'), '🔥 1',
            'card streak counts mid-range rep progress (4 -> 5) as an improvement');
        eq(await readCardBadge(page, 'kelso-shrugs'), '🔥 1',
            'normal 3-6 exercise still gets the same card streak behavior');
        eq(await readCardBadge(page, 'upper-back-row'), null,
            'card streak does not count a weight drop, even at top reps');

        await bottomNav(page, 'History');
        await page.waitForSelector('.history-item', { timeout: 8000 });

        const historyRows = await readHistoryRows(page, EXERCISES.map(([, name]) => name));

        for (const [, name] of EXERCISES) {
            ok(historyRows[name], `History includes ${name}`);
        }

        eq(historyRows['Kelso Shrugs'].badgeText, '🔥 PR',
            'History shows PR at 6 reps when a normal 3-6 exercise improved');
        eq(historyRows['Preacher Curls'].badgeText, '🔥 PR',
            'History shows PR at 5 reps — mid-range, so not a range-top marker');
        eq(historyRows['Transverse Plane Rows'].badgeText, null,
            'History does not show PR for top reps after a weight drop');
        eq(historyRows['Frontal Plane Pulldowns'].badgeText, null,
            'History does not show PR for top reps without any previous row');
        ok(historyRows['Kelso Shrugs'].badgeClass.includes('streak-badge'),
            'History PR badge reuses the streak-badge container class');
        eq(historyRows['Kelso Shrugs'].badgeBg, BADGE_BG,
            'History PR badge uses the shared transparent background');
        eq(historyRows['Kelso Shrugs'].badgeBorder, BADGE_BORDER,
            'History PR badge uses the shared gold border');
        ok(historyRows['Kelso Shrugs'].badgeRightOfName,
            'History PR badge sits immediately to the right of the exercise name');

        // Log against LATEST without submitting: Preacher Curls 55x5 -> 55x6
        // improves, Kelso Shrugs repeats 190x6 and does not. Today's entry is
        // now the newest .history-item and is still unsubmitted.
        await bottomNav(page, 'Workout');
        await enterSet(page, 'preacher-curls', '55', '6');
        ok(await logCard(page), 'preacher-curls: LOG button clicked');
        await enterSet(page, 'kelso-shrugs', '190', '6');
        ok(await logCard(page), 'kelso-shrugs: LOG button clicked');

        await bottomNav(page, 'History');
        await page.waitForSelector('.history-item', { timeout: 8000 });

        const submitted = await page.evaluate(() => {
            const hist = JSON.parse(localStorage.getItem('gym-local:gymWorkoutHistory') || '[]');
            return hist.map(w => !!w.submitted);
        });
        eq(submitted[0], false, 'the newest history entry is still unsubmitted');

        const todayRows = await readHistoryRows(page, EXERCISES.map(([, name]) => name));
        // 55x4 -> 55x5 -> 55x6 is a run of two, so this row reads the count
        // rather than "PR" — the pre-submit badge is the streak pill from the
        // moment the set is logged, exactly as the lone-PR badge above is.
        // Case 100 owns that rule; what this line pins is that logging alone,
        // with no Submit Day, is enough to earn it.
        eq(todayRows['Preacher Curls'].badgeText, '🔥 2',
            'History badges an improvement as soon as it is logged, before Submit Day');
        eq(todayRows['Preacher Curls'].badgeBorder, BADGE_BORDER,
            'the pre-submit History badge is the same gold-outlined pill');
        eq(todayRows['Kelso Shrugs'].badgeText, null,
            'a repeated session gets no pre-submit History badge');
        // Transverse Plane Rows is the NA probe: it has a baseline in history,
        // so an unlogged row here is the case where a badge is conceivable and
        // must not appear. (Reverse Wrist Curls held this probe until the wrist
        // pair left the program.)
        eq(todayRows['Transverse Plane Rows'].badgeText, null,
            'an unlogged NA row in the in-progress entry gets no History badge');

        eq(errors, [], 'no console errors');
        console.log('PASS: History PR badges mirror the Day Breakdown PR definition.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
