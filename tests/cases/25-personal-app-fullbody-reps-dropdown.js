// What this test covers
// ----------------------
// Standard reps are a dropdown (not a free-type number). Defaulting:
//   - Hit 4 or 5 last session  -> dropdown carries that over (NOT +1).
//   - Hit 6 last session       -> weight auto-bumps (simplePR) and reps reset
//                                 to 4 for the new heavier weight.
//   - Wrist curls use their id-keyed 5/6/7/8 dropdown and only bump at 8.
//   - No history               -> defaults to the exercise's start reps.
// And one-tap LOG (no interaction) persists the pre-selected reps + pre-filled
// weight.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { ACTIVE, goToCard, goToCardById, revealCard, goToCardAndLog } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

// Read a standard card's weight input and reps <select>. The card has to be
// navigated to and opened first: on the deck the inputs do not exist until the
// card is revealed.
async function readStandardCard(page, name) {
    await goToCard(page, name);
    await revealCard(page);
    return page.evaluate((sel) => {
        const slot = document.querySelector(sel);
        if (!slot) return null;
        const weightInput = slot.querySelector('input[type="number"][inputmode="decimal"]');
        const repsSelect = slot.querySelector('select[data-field="reps"]');
        return {
            weightValue: weightInput ? weightInput.value : null,
            repsValue: repsSelect ? repsSelect.value : null,
            repsIsSelect: !!repsSelect,
            repsOptions: repsSelect ? Array.from(repsSelect.options).map(o => o.value) : null,
        };
    }, ACTIVE);
}

async function readStandardCardById(page, id) {
    await goToCardById(page, id);
    await revealCard(page);
    return page.evaluate((sel) => {
        const slot = document.querySelector(sel);
        if (!slot) return null;
        const card = slot.querySelector('.card[data-exercise-id]');
        const weightInput = slot.querySelector('input[type="number"][inputmode="decimal"]');
        const repsSelect = slot.querySelector('select[data-field="reps"]');
        return {
            exerciseId: card ? card.getAttribute('data-exercise-id') : null,
            weightValue: weightInput ? weightInput.value : null,
            repsValue: repsSelect ? repsSelect.value : null,
            repsIsSelect: !!repsSelect,
            repsOptions: repsSelect ? Array.from(repsSelect.options).map(o => o.value) : null,
        };
    }, ACTIVE);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Last session: shoulder-press 5 reps (carry over), kelso-shrugs 6 reps
        // (weight bump -> reps reset to 4), reverse-wrist-curls 7 reps (carry
        // over), and cable-wrist-curls 8 reps (wrist bump -> reps reset to 6).
        // Dated weeks back so we're past Week 1.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-25T20:00:00Z', day: 'fullbody',
                exercises: [
                    { id: 'shoulder-press', name: 'Shoulder Press', weight: '100', reps: '5' },
                    { id: 'kelso-shrugs', name: 'Kelso Shrugs', weight: '190', reps: '6' },
                    { id: 'reverse-wrist-curls', name: 'Reverse Wrist Curls', weight: '30', reps: '7' },
                    { id: 'cable-wrist-curls', name: 'Cable Wrist Curls', weight: '90', reps: '8' },
                ],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.evaluate(() => localStorage.setItem('gym-local:firstWorkoutMonday', '2026-05-25T00:00:00.000Z'));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior');

        // Most standard exercises still use exactly 3/4/5/6.
        const sp = await readStandardCard(page, 'Shoulder Press');
        ok(sp && sp.repsIsSelect, 'Shoulder Press reps is a <select>');
        eq(sp.repsOptions, ['3', '4', '5', '6'], 'reps dropdown offers exactly 3/4/5/6');
        eq(sp.repsValue, '5', 'reps carries over last session (5), not +1');
        eq(sp.weightValue, '100', 'weight carries over (no bump after 5 reps)');

        // A never-logged exercise defaults to 4.
        const cf = await readStandardCard(page, 'Chest Flies');
        eq(cf.repsValue, '4', 'no-history exercise defaults reps to 4');

        // Kelso Shrugs hit 6 last time -> weight bumps (+2.5 -> 192.5), reps -> 4.
        // It is the one probe here that sits on Posterior, so hop the toggle
        // for it. Keeping Kelso Shrugs specifically matters: the expected
        // 190 -> 192.5 bump is its own PR increment, so substituting an
        // Anterior movement to save the hop would change what is covered.
        await selectDayType(page, 'posterior');
        const ks = await readStandardCard(page, 'Kelso Shrugs');
        eq(ks.repsValue, '4', 'after hitting 6, reps reset to 4 for the new weight');
        eq(ks.weightValue, '192.5', 'after hitting 6, weight auto-bumps by the PR increment');

        const reverse = await readStandardCardById(page, 'reverse-wrist-curls');
        eq(reverse.exerciseId, 'reverse-wrist-curls', 'reverse wrist curls are found by id');
        eq(reverse.repsOptions, ['5', '6', '7', '8'], 'reverse wrist curls use the 5/6/7/8 dropdown');
        eq(reverse.repsValue, '7', 'reverse wrist curls carry over 7 reps without bumping');
        eq(reverse.weightValue, '30', 'reverse wrist curls do not bump below 8 reps');

        const cable = await readStandardCardById(page, 'cable-wrist-curls');
        eq(cable.exerciseId, 'cable-wrist-curls', 'cable wrist curls are found by id');
        eq(cable.repsOptions, ['5', '6', '7', '8'], 'cable wrist curls use the 5/6/7/8 dropdown');
        eq(cable.repsValue, '6', 'after hitting 8, wrist curls reset to 6 for the new weight');
        eq(cable.weightValue, '92.5', 'after hitting 8, cable wrist curls auto-bump by the PR increment');

        // One-tap LOG on Shoulder Press (no interaction) persists 5 reps @ 100.
        // On the deck that means navigating to it and opening it — LOG exists
        // only on the revealed face, which is the point of the screen.
        await selectDayType(page, 'anterior');
        await goToCardAndLog(page, 'Shoulder Press');
        const saved = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]'), NS);
        const todays = saved.find(w => !w.submitted);
        const loggedSP = todays.exercises.find(e => e.id === 'shoulder-press');
        eq(loggedSP.reps, '5', 'one-tap LOG persists the carried-over 5 reps');
        eq(loggedSP.weight, '100', 'one-tap LOG persists the pre-filled weight');

        eq(errors, [], 'no console errors');
        console.log('PASS: full-body reps dropdown carries over / resets on bump / one-tap logs.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
