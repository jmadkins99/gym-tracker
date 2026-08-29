// What this test covers
// ----------------------
// The load-type dropdown in Settings > Manage Exercises actually changes what
// the Weight Breakdown renders. This is THE case for the feature: everything
// else about loadType (16, 45, 46, 57, 59, 60) checks a stored or seeded value,
// and every one of them still passes if the setting is written to localStorage
// but never reaches WorkoutView.
//
// Chest Flies seeds as 'pin'. At 200 lbs it is driven through all three
// settings and back, asserting the rendered shape each time. The three shapes
// are distinguished by what is present AND what is absent:
//
//   pin               "Warmup Set #1 (~70%): 140 lbs", no per-plate lines,
//                     no "Per side", no "Pin:" (200 is under no cap)
//   plate-two-sided   "Warmup Set #1 (140 lbs - ~70%)" + "Per side: 70 lbs",
//                     per-plate lines, top set always shown
//   plate-one-sided   the same label shape and plate lines, but NO "Per side" —
//                     one-sided is the only pair that differs by an absence
//                     alone, which is why both are exercised here
//
// The arithmetic mirrors case 46 (Leg Press at 200 two-sided), so the expected
// numbers are already pinned independently: 70% = 140, 90% = 180, top = 200.
//
// Ending back on 'pin' matters: it proves the branch is chosen per render
// rather than latched on first open.
//
// To verify this test is real: in WorkoutView.jsx, change the loadType const
// back to reading a code-side seed rather than resolveLoadType(exercise) —
// every assertion after the first block fails.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const EXERCISE_ID = 'chest-flies';
const EXERCISE_NAME = 'Chest Flies';

// Opens Settings > Manage Exercises and sets one exercise's dropdown. React
// installs its own value setter on the select, so assigning `.value` directly
// is invisible to it — go through the prototype descriptor and fire `change`.
async function setLoadType(page, exerciseId, loadType) {
    await page.click('.settings-btn');
    await new Promise(r => setTimeout(r, 200));
    const opened = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('.modal-btn'))
            .find(b => b.textContent.includes('Manage Exercises'));
        if (!btn) return false;
        btn.click();
        return true;
    });
    ok(opened, 'opened Manage Exercises');
    await new Promise(r => setTimeout(r, 300));

    const set = await page.evaluate((id, value) => {
        const row = document.querySelector(`.exercise-row[data-exercise-id="${id}"]`);
        if (!row) return 'no row';
        const select = row.querySelector('select[data-field="loadType"]');
        if (!select) return 'no select';
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, 'value').set;
        setter.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return 'ok';
    }, exerciseId, loadType);
    eq(set, 'ok', `set ${exerciseId} to ${loadType} in Manage Exercises`);
    await new Promise(r => setTimeout(r, 200));

    // Back out of the modal entirely so the workout view is interactive again.
    await page.evaluate(() => {
        const back = Array.from(document.querySelectorAll('.modal-btn'))
            .find(b => b.textContent.includes('Back to Settings'));
        if (back) back.click();
    });
    await new Promise(r => setTimeout(r, 200));
    await page.evaluate(() => {
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) overlay.click();
    });
    await new Promise(r => setTimeout(r, 250));
}

// Sets the weight input to 200 and opens the breakdown, returning the card's
// full text. Same shape as the interaction in cases 45 and 46.
async function readBreakdown(page, name, weight) {
    const opened = await page.evaluate((exName, w) => {
        const card = Array.from(document.querySelectorAll('.exercise-card'))
            .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === exName);
        if (!card) return false;
        const input = card.querySelector('input[type="number"], input[inputmode="decimal"]');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, w);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const btn = Array.from(card.querySelectorAll('button'))
            .find(b => b.textContent.includes('Weight Breakdown'));
        if (!btn) return false;
        btn.click();
        return true;
    }, name, weight);
    ok(opened, `set ${name} to ${weight} and opened its Weight Breakdown`);
    await new Promise(r => setTimeout(r, 300));

    const text = await page.evaluate((exName) => {
        const card = Array.from(document.querySelectorAll('.exercise-card'))
            .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === exName);
        return card ? card.textContent : '';
    }, name);

    // No collapse step: the Weight Breakdown button stopped toggling in August
    // 2026 (it is what starts an exercise's clock, so it had to become
    // one-way), and there is no Hide to click. Nothing is needed in its place —
    // expandedWeightBreakdown holds a single id, so opening the next exercise's
    // panel closes this one.
    return text;
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate(() => {
            localStorage.setItem('gym-local:lastBackupReminder', String(Date.now()));
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // Chest Flies is on Anterior.
        await selectDayType(page, 'anterior');

        // --- 1. The seeded value: a plain pin stack -------------------------
        let text = await readBreakdown(page, EXERCISE_NAME, '200');
        contains(text, 'Warmup Set #1 (~70%): 140 lbs',
            'seeded as a pin stack: warmup #1 is 70% of 200, already on the stack');
        contains(text, 'Warmup Set #2 (~90%): 180 lbs',
            'seeded as a pin stack: warmup #2 is 90% of 200');
        ok(!/Per side/.test(text), 'a pin stack has no per-side split');
        ok(!/Pin:/.test(text), '200 is under no cap, so this is the plain pin branch');

        // --- 2. Plate-loaded on both sides ----------------------------------
        await setLoadType(page, EXERCISE_ID, 'plate-two-sided');
        await selectDayType(page, 'anterior');
        text = await readBreakdown(page, EXERCISE_NAME, '200');
        contains(text, 'Warmup Set #1 (140 lbs', 'two-sided: warmup #1 total is 140');
        contains(text, 'Per side: 70 lbs', 'two-sided: 140 splits to 70 a side');
        contains(text, 'Warmup Set #2 (180 lbs', 'two-sided: warmup #2 total is 180');
        contains(text, 'Per side: 90 lbs', 'two-sided: 180 splits to 90 a side');
        contains(text, 'Top Set (200 lbs)', 'two-sided: the top set is always shown');
        contains(text, 'Per side: 100 lbs', 'two-sided: 200 splits to 100 a side');
        ok(!/Warmup Set #1 \(~70%\)/.test(text),
            'the pin-stack label shape is gone once the setting changed');

        // --- 3. Plate-loaded on one side ------------------------------------
        await setLoadType(page, EXERCISE_ID, 'plate-one-sided');
        await selectDayType(page, 'anterior');
        text = await readBreakdown(page, EXERCISE_NAME, '200');
        contains(text, 'Warmup Set #1 (140 lbs',
            'one-sided keeps the plate-loaded label shape');
        ok(/45s - \d/.test(text) || /45 x \d/.test(text) || /45/.test(text),
            'one-sided still renders a plate pile');
        ok(!/Per side/.test(text),
            'one-sided is the whole load in one place — no per-side line');

        // --- 4. Back to a pin stack -----------------------------------------
        await setLoadType(page, EXERCISE_ID, 'pin');
        await selectDayType(page, 'anterior');
        text = await readBreakdown(page, EXERCISE_NAME, '200');
        contains(text, 'Warmup Set #1 (~70%): 140 lbs',
            'switching back restores the pin shape — the branch is not latched');
        ok(!/Per side/.test(text), 'no per-side line survives the switch back');

        eq(errors, [], 'no console errors while changing the load type');
        console.log('PASS: load type changes the rendered Weight Breakdown');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
