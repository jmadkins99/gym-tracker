// What this test covers
// ----------------------
// The public app's PR baseline is the last session that logged the movement —
// submitted or not. Ported from the personal app in September 2026; cases 48
// and 67 pin the same rule there.
//
// Submit Day is a ceremony the user performs, not a property of the training.
// A day whose sets were logged and then left unsubmitted still happened, and
// the lookup used to skip it: the next session was then scored against the
// session BEFORE it, and took a PR badge for repeating a set it had already
// done. On the personal app that was Thursday 3 September 2026, logged in full
// and never submitted. Public users leave days unsubmitted for the same reason
// anyone does — they walked out of the gym.
//
// The fixture makes the old and new answers differ, because one where they
// agree proves nothing:
//
//   Chest Press   100x5 submitted, then 105x5 NEVER SUBMITTED, then 105x5
//                 today. Against the unsubmitted day that is a repeat and no
//                 PR. Against the submitted one behind it, the old rule saw
//                 100 -> 105 and called it a PR.
//   Incline Press 100x5 submitted, then 105x5 today. Nothing unsubmitted in
//                 the way, so it is a PR under either rule — the control that
//                 keeps a silent badge failure from passing this case.
//
// Mutation check: put `if (!w.submitted) return false;` back into
// getPreviousExerciseForPR and Chest Press earns a badge on both surfaces.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPublicApp } = require('../lib/state');
const { PUBLIC_APP_ROOT } = require('../lib/paths');
const { ACTIVE, bottomNav, goToCardById, logCard, revealCard } = require('../lib/deck');
const { eq, ok } = require('../lib/assert');

const dayOffset = (days, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};

function publicConfig() {
    return {
        version: 2,
        categories: ['Push'],
        minimalistPrTracking: true,
        days: {
            1: [
                { id: 'chest', name: 'Chest Press', category: 'Push', order: 0, type: 'standard', minReps: 5, maxReps: 8 },
                { id: 'incline', name: 'Incline Press', category: 'Push', order: 1, type: 'standard', minReps: 5, maxReps: 8 },
            ],
        },
    };
}

function everyDaySchedule() {
    return {
        version: 2,
        scheduleIsExplicit: true,
        totalWorkoutDays: 1,
        workoutDays: [
            'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
        ].map(dayOfWeek => ({ dayOfWeek, workoutDayNumber: 1 })),
    };
}

const row = (id, name, weight, reps) => ({
    id, name, category: 'Push', type: 'standard', weight, reps, minReps: 5, maxReps: 8,
});

// Three days back, submitted: the baseline the OLD rule would have used.
const SUBMITTED = {
    date: dayOffset(-3, 9), day: 1, week: 1, submitted: true, plateauBusters: [],
    exercises: [row('chest', 'Chest Press', '100', '5'), row('incline', 'Incline Press', '100', '5')],
};

// Yesterday, walked away from without submitting. Chest Press only — Incline
// has to stay clear of it to work as the control.
const UNSUBMITTED = {
    date: dayOffset(-1, 9), day: 1, week: 1, submitted: false, plateauBusters: [],
    exercises: [row('chest', 'Chest Press', '105', '5')],
};

async function enterSet(page, exerciseId, weight, reps) {
    await goToCardById(page, exerciseId);
    await revealCard(page);
    await page.evaluate((sel, w, r) => {
        const card = document.querySelector(sel);
        const weightInput = card.querySelector('input[type="number"][inputmode="decimal"]');
        const inputSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set;
        inputSetter.call(weightInput, w);
        weightInput.dispatchEvent(new Event('input', { bubbles: true }));

        const repsField = card.querySelector('select[data-field="reps"]') ||
            card.querySelector('input[type="number"][inputmode="numeric"]');
        if (repsField.tagName === 'SELECT') {
            const selectSetter = Object.getOwnPropertyDescriptor(
                window.HTMLSelectElement.prototype, 'value').set;
            selectSetter.call(repsField, r);
            repsField.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            inputSetter.call(repsField, r);
            repsField.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, ACTIVE, weight, reps);
    await new Promise(r => setTimeout(r, 120));
}

const historyRows = (page) => page.evaluate(() => {
    const newest = document.querySelector('.history-item');
    if (!newest) return [];
    return Array.from(newest.querySelectorAll('.history-exercise')).map(r => ({
        name: r.querySelector('.history-exercise-name')?.textContent.trim() || null,
        badge: !!r.querySelector('[data-pr-badge]'),
    }));
});

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPublicApp(page, {
            exerciseConfig: publicConfig(),
            schedule: everyDaySchedule(),
            workoutHistory: [UNSUBMITTED, SUBMITTED],
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // === 1. The helper, directly ====================================
        // Cheap, and it names the rule without going through three surfaces.
        const verdicts = await page.evaluate(() => {
            const history = JSON.parse(localStorage.getItem('gym-local:gymWorkoutHistory') || '[]');
            const today = { date: new Date().toISOString(), submitted: false, exercises: [] };
            const at = (weight, reps) =>
                ({ id: 'chest', type: 'standard', weight, reps, minReps: 5, maxReps: 8 });
            return {
                repeat: isExercisePRInWorkout(at('105', '5'), today, history),
                beatsIt: isExercisePRInWorkout(at('107.5', '5'), today, history),
                moreReps: isExercisePRInWorkout(at('105', '6'), today, history),
            };
        });
        eq(verdicts.repeat, false,
            'repeating an unsubmitted session is not a PR — that day counts as the baseline');
        eq(verdicts.beatsIt, true, 'beating it still is, so the probe is not vacuous');
        eq(verdicts.moreReps, true, 'and so is the same weight for more reps');

        // === 2. The same thing through the deck =========================
        await enterSet(page, 'chest', '105', '5');
        ok(await logCard(page), 'logged Chest Press');
        const chestReview = await page.evaluate((sel) =>
            !!document.querySelector(sel + ' [data-logged-pr-badge]'), ACTIVE);
        eq(chestReview, false, 'the logged card shows no PR for a repeat of the unsubmitted day');

        await enterSet(page, 'incline', '105', '5');
        ok(await logCard(page), 'logged Incline Press');

        // === 3. History agrees ==========================================
        await bottomNav(page, 'History');
        const rows = await historyRows(page);
        const byName = Object.fromEntries(rows.map(r => [r.name, r.badge]));
        eq(byName['Chest Press'], false,
            'History shows no PR for the lift that only matched an unsubmitted day');
        eq(byName['Incline Press'], true,
            'and does show one for the lift that genuinely improved');

        eq(errors, [], 'no console errors');
        console.log('PASS: an unsubmitted day is a baseline like any other, on every public surface.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
