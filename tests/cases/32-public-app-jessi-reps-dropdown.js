// What this test covers
// ----------------------
// Jessi's standard cards use a 5-8 reps DROPDOWN instead of the public app's
// free-type number field, ported from the personal app's 3-6 dropdown.
//
// The range extends one below his 6-8 goal range, and the goal range itself is
// unchanged — so getMinimalistPR still fires on reps >= maxReps (8), making the
// top option exactly the weight-bump trigger while 5 does nothing special.
//
// Asserts:
//   1. enableRepsDropdownForJessi sets repsDropdown {min:5,max:8} + its flag.
//   2. The Reps field is a <select> with exactly 5/6/7/8.
//   3. Defaulting, parity with the personal app:
//        prev 7            -> carries over 7
//        prev 8 (>=maxReps)-> weight bump, reps reset to 6 (goal floor)
//        prev 4 (legacy)   -> clamped up to 5
//        no history        -> 6
//   4. One-tap LOG with NO interaction records the pre-selected reps. The
//      dropdown always displays a value but workoutData only gets one on
//      change, so without the capture in logExercise this fails validation
//      against a visibly filled field.
//   5. Goal range is untouched: logged entries still carry maxReps 8.
//   6. Non-Jessi-shaped installs keep the free-type number input.
//
// To verify this is real: delete the `if (!data.reps)` capture block from
// logExercise — assertion 4 fails (reps never persist on a one-tap LOG).
// Or change repsDropdown to {min:6,max:8} in enableRepsDropdownForJessi —
// assertion 2 fails with the wrong option list.

const path = require('path');
const { start } = require('../lib/server');
const { launch, waitForApp, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiDefaultSchedule, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const { PUBLIC_APP_ROOT } = require('../lib/paths');
const { ACTIVE, goToCard, revealCard } = require('../lib/deck');

function config(categories) {
    return {
        version: 2,
        categories,
        minimalistPrTracking: true,
        gympinMode: true,
        days: {
            1: [
                { id: 'jcarry', name: 'Chest Flies',         category: categories[0], order: 0, type: 'standard', sets: 1, minReps: 6, maxReps: 8 },
                { id: 'jpr',    name: 'Incline Chest Press', category: categories[0], order: 1, type: 'standard', sets: 1, minReps: 6, maxReps: 8 },
                { id: 'jlow',   name: 'Kelso Shrugs',        category: categories[0], order: 2, type: 'standard', sets: 1, minReps: 6, maxReps: 8 },
                { id: 'jfresh', name: 'Calf Raises',         category: categories[0], order: 3, type: 'standard', sets: 1, minReps: 6, maxReps: 8 },
            ],
        },
    };
}

// jfresh deliberately absent — exercises a first-ever session.
const HISTORY = [
    workoutEntry({
        date: '2026-07-20',
        day: 1,
        exercises: [
            { id: 'jcarry', name: 'Chest Flies',         weight: '95',  reps: '7', minReps: 6, maxReps: 8 },
            { id: 'jpr',    name: 'Incline Chest Press', weight: '250', reps: '8', minReps: 6, maxReps: 8 },
            { id: 'jlow',   name: 'Kelso Shrugs',        weight: '215', reps: '4', minReps: 6, maxReps: 8 },
        ],
    }),
];

// The reps control lives on the revealed face, so the card has to be navigated
// to and swiped open before it exists at all.
async function readReps(page, name) {
    await goToCard(page, name);
    await revealCard(page);
    return page.evaluate((sel2) => {
        const card = document.querySelector(sel2);
        if (!card) return null;
        const sel = card.querySelector('select[data-field="reps"]');
        const input = card.querySelector('input[type="number"][inputmode="numeric"]');
        return {
            isSelect: !!sel,
            isFreeType: !!input,
            value: sel ? sel.value : (input ? input.value : null),
            options: sel ? Array.from(sel.options).map(o => o.value) : null,
        };
    }, ACTIVE);
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        await seedPublicApp(page, {
            exerciseConfig: config(['Full Body']),
            workoutHistory: HISTORY,
            schedule: jessiDefaultSchedule(),
        });
        await page.evaluate(() => {
            localStorage.removeItem('gym-local:jessiRepsDropdownEnabled');
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // 1. Auto-enable.
        const enabled = await page.evaluate(() => {
            const cfg = JSON.parse(localStorage.getItem('gym-local:gymExerciseConfig'));
            return {
                repsDropdown: cfg.repsDropdown,
                flag: localStorage.getItem('gym-local:jessiRepsDropdownEnabled'),
            };
        });
        eq(enabled.repsDropdown, { min: 5, max: 8 }, 'repsDropdown auto-enabled as 5-8 for Jessi');
        eq(enabled.flag, 'true', 'jessiRepsDropdownEnabled set so auto-enable does not re-fire');

        // 2 + 3. Widget type, options, and defaulting.
        const carry = await readReps(page, 'Chest Flies');
        ok(carry && carry.isSelect, 'Reps is a <select>, not a free-type input');
        eq(carry.options, ['5', '6', '7', '8'], 'dropdown offers exactly 5-8');
        eq(carry.value, '7', 'prev 7 carries over unchanged');

        const pr = await readReps(page, 'Incline Chest Press');
        eq(pr.value, '6',
            'prev 8 hit maxReps -> weight bumped, reps reset to the 6 goal floor');

        const low = await readReps(page, 'Kelso Shrugs');
        eq(low.value, '5', 'legacy prev 4 clamps up into the 5-8 range');

        const fresh = await readReps(page, 'Calf Raises');
        eq(fresh.value, '6', 'first-ever session defaults to the 6 goal floor');

        // 4. One-tap LOG with zero interaction persists the pre-selected reps.
        await goToCard(page, 'Chest Flies');
        await revealCard(page);
        const logged = await page.evaluate((sel) => {
            const card = document.querySelector(sel);
            const btn = Array.from(card.querySelectorAll('button'))
                .find(b => b.textContent.trim() === 'LOG');
            if (!btn) return false;
            btn.click();
            return true;
        }, ACTIVE);
        ok(logged, 'clicked LOG on Chest Flies without touching any field');
        await new Promise(r => setTimeout(r, 600));

        const saved = await page.evaluate(() => {
            const hist = JSON.parse(localStorage.getItem('gym-local:gymWorkoutHistory') || '[]');
            const today = hist.find(w => (w.exercises || []).some(e => e.id === 'jcarry' && w.date !== '2026-07-20'));
            const ex = today && today.exercises.find(e => e.id === 'jcarry');
            return ex ? { reps: ex.reps, weight: ex.weight, maxReps: ex.maxReps } : null;
        });
        ok(saved, 'a new session entry was written for Chest Flies');
        eq(saved.reps, '7', 'one-tap LOG persisted the pre-selected 7 reps');
        ok(saved.weight && saved.weight !== '', 'one-tap LOG also captured the auto-filled weight');

        // 5. Goal range untouched.
        eq(saved.maxReps, 8, 'goal range unchanged — logged entry still carries maxReps 8');

        // 6. Non-Jessi-shaped install keeps the free-type input.
        await seedPublicApp(page, {
            exerciseConfig: config(['Custom Split']),
            workoutHistory: HISTORY,
            schedule: jessiDefaultSchedule(),
        });
        await page.evaluate(() => {
            localStorage.removeItem('gym-local:jessiRepsDropdownEnabled');
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        const other = await readReps(page, 'Chest Flies');
        ok(other && other.isFreeType, 'non-Jessi install keeps the free-type number input');
        ok(!other.isSelect, 'non-Jessi install has no reps <select>');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Jessi gets a 5-8 reps dropdown; goal range and PR trigger unchanged.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
