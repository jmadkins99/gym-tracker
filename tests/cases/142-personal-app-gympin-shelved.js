// What this test covers
// ----------------------
// Gympin shelved behind GYMPIN_ENABLED = false (Nov 2026). Its code stays, and
// the cases that cover it (08, 26, 105, 128, 129) serve config.js with the flag
// flipped on (lib/server.js `flags`). This one runs the real, shipped value:
//   - a pin exercise saved with the Gympin on at 260 shows no "Gympin past"
//     line in Settings and no Gympin form in its pencil form — while the
//     cable stack switch beside it still shows, so the load type is not
//     what hid it;
//   - saving that form (here, flipping the cable stack switch) leaves the
//     saved `gympin`/`stackMax` exactly as they were;
//   - the card renders no "pin 260" overflow row.
//
// To verify this test is real: set GYMPIN_ENABLED to true. The status line,
// the form and the overflow row all come back.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType, waitFor, tap } = require('../lib/browser');
const { setWeightAndOpen } = require('../lib/deck');
const { seedPersonalApp, seedExerciseConfig } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const ID = 'erectors-spinal-extension';   // Stiff Legged Deadlift, pin
const rowSel = `.exercise-row[data-exercise-id="${ID}"]`;

// Edit swaps the row's Edit button for Save and Cancel, and either of those
// swaps it back, so the press has landed once the other button shows.
async function clickRowButton(page, label) {
    const next = label === 'Edit' ? 'Save' : 'Edit';
    await tap(page, rowSel + ' button', { text: label });
    await waitFor(page, `${label} to show its ${next} button`, (sel, next) =>
        Array.from(document.querySelectorAll(sel + ' button'))
            .some(b => b.textContent.trim() === next), rowSel, next);
}

const has = (page, field) =>
    page.evaluate((sel, f) => !!document.querySelector(`${sel} [data-field="${f}"]`), rowSel, field);

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await seedExerciseConfig(page, { overrides: { [ID]: { gympin: true, stackMax: 260 } } });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        eq(await page.evaluate(() => GYMPIN_ENABLED), false, 'Gympin ships shelved');

        await tap(page, '.settings-btn');
        await tap(page, '.modal-btn', { text: /Manage Exercises/ });
        await waitFor(page, 'the exercise rows', () => document.querySelectorAll('.exercise-row').length > 0);

        eq(await has(page, 'gympin-status'), false, 'no "Gympin past 260" line in the list');
        await clickRowButton(page, 'Edit');
        eq(await has(page, 'gympin-form'), false, 'no Gympin form in the pencil form');
        eq(await has(page, 'cable-stack-form'), true, 'while the cable stack switch, also pin-only, is there');

        // The checkbox is 0x0; a finger hits the track drawn right after it.
        const box = rowSel + ' input[data-field="cableStack"]';
        await tap(page, box + ' + .switch-track');
        await waitFor(page, 'the cable stack switch to turn on', (sel) => document.querySelector(sel).checked, box);
        await clickRowButton(page, 'Save');
        const saved = await page.evaluate((ns, id) =>
            JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig')).exercises.find(e => e.id === id), NS, ID);
        eq([saved.gympin, saved.stackMax, saved.cableStack], [true, 260, true],
            'Save wrote the cable stack switch and left the hidden Gympin pair alone');

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'posterior-2');
        const card = await setWeightAndOpen(page, 'Stiff Legged Deadlift', 270);
        ok(card.indexOf('pin 260') === -1, 'the card renders no Gympin overflow row');

        eq(errors, [], 'no console errors');
        console.log('PASS: with GYMPIN_ENABLED off the Gympin is hidden and its saved fields are untouched');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
