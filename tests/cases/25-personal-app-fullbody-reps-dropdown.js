// What this test covers
// ----------------------
// Full-body reps are a 3/4/5/6 dropdown (not a free-type number). Defaulting:
//   - Hit 4 or 5 last session  -> dropdown carries that over (NOT +1).
//   - Hit 6 last session       -> weight auto-bumps (simplePR) and reps reset
//                                 to 4 for the new heavier weight.
//   - No history               -> defaults to 4.
// And one-tap LOG (no interaction) persists the pre-selected reps + pre-filled
// weight.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { ACTIVE, goToCard, revealCard, goToCardAndLog } = require('../lib/deck');
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

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Last session: shoulder-press 5 reps (carry over), kelso-shrugs 6 reps
        // (weight bump -> reps reset to 4). Dated weeks back so we're past Week 1.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-25T20:00:00Z', day: 'fullbody',
                exercises: [
                    { id: 'shoulder-press', name: 'Shoulder Press', weight: '100', reps: '5' },
                    { id: 'kelso-shrugs', name: 'Kelso Shrugs', weight: '190', reps: '6' },
                ],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.evaluate(() => localStorage.setItem('gym-local:firstWorkoutMonday', '2026-05-25T00:00:00.000Z'));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior');

        // Reps is now a dropdown of exactly 3/4/5/6.
        const sp = await readStandardCard(page, 'Shoulder Press');
        ok(sp && sp.repsIsSelect, 'Shoulder Press reps is a <select>');
        eq(sp.repsOptions, ['3', '4', '5', '6'], 'reps dropdown offers exactly 3/4/5/6');
        eq(sp.repsValue, '5', 'reps carries over last session (5), not +1');
        eq(sp.weightValue, '100', 'weight carries over (no bump after 5 reps)');

        // A never-logged exercise defaults to 4.
        const cf = await readStandardCard(page, 'Chest Flies');
        eq(cf.repsValue, '4', 'no-history exercise defaults reps to 4');

        // Kelso Shrugs hit 6 last time -> weight bumps (+1.25 -> 191.25), reps -> 4.
        // It is the one probe here that sits on Posterior, so hop the toggle
        // for it. Keeping Kelso Shrugs specifically matters: the expected
        // 190 -> 191.25 bump is its own PR increment, so substituting an
        // Anterior movement to save the hop would change what is covered.
        await selectDayType(page, 'posterior');
        const ks = await readStandardCard(page, 'Kelso Shrugs');
        eq(ks.repsValue, '4', 'after hitting 6, reps reset to 4 for the new weight');
        eq(ks.weightValue, '191.25', 'after hitting 6, weight auto-bumps by the PR increment');

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
