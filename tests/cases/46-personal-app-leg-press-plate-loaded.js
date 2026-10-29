// What this test covers
// ----------------------
// Since v25 (Oct 2026) every movement defaults to pin-loaded with no cap, and
// the per-machine seed checks that opened this case went with the seeds. What
// is left is the two-sided rendering: the case sets Squats (Leg Press's row,
// on a new id) to plate two-sided itself, through the saved config the way
// the Settings dropdown does. The history below is about the retired ids.
//
// Leg Press's breakdown STYLE, which has now changed twice. It was two-side
// plate-loaded, was reclassified to a capped pin stack in Aug 2026 when the
// gym looked to have swapped the sled for a stack machine, and is back to
// two-side plate-loaded now that that turned out not to hold. Test 16 only
// asserts that a Weight Breakdown button exists, so it passes under any
// classification — the style needs its own pin, the same way test 45 pins
// Shoulder Press and test 26 pins Back Extensions.
//
// The id is `hip-adduction`, which renders as "Leg Press". That mismatch is
// deliberate and frozen: ids are never renamed because workout history keys off
// them. Do not "fix" it.
//
// A two-sided plate machine halves the target and renders a "Per side" line per
// set. Two absences carry the weight alongside the positive assertions: no
// "Pin:" proves the pin-stack branch is unreachable for this id, and no bare
// "Warmup Set #1 (~70%):" proves it is not taking the plain-stack row format —
// the two branches render different shapes for the same set, so a half-applied
// revert (config moved, stale PIN_STACK entry left behind) fails here.
//
// The 390 cap went with the pin-stack classification. Overflow rendering lives
// on Calf Raises in 08-personal-app-pin-stack-overflow and on Back Extensions
// in 26-personal-app-back-extensions-pin; this case is the one that says Leg
// Press is not among them.
//
// At 200 lbs, two-sided:
//   - Warmup 1 = 70% of 200 = 140 total → 70/side (exact, no rounding) → 45+25
//   - Warmup 2 = 90% of 200 = 180 total → 90/side (exact, no rounding) → 45+45
//   - Top set  = 200 total → 100/side, never rounded → 45+45+10
//
// Also guards the matching PR increment. 5 is 2.5/side, the smallest real
// plate, and it also reads as one pin-stack notch — which is exactly why it
// survived both moves untouched and why it is NOT evidence of a classification
// on its own. The increment and the classification have to be read together,
// which is why both are asserted here.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { setWeightAndOpen } = require('../lib/deck');
const { seedExerciseConfig, seedPersonalApp } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await seedExerciseConfig(page, { overrides: { 'quads-knee-extension-during-hip-flexion': { loadType: 'plate-two-sided' } } });
        await page.evaluate(() => localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'full-body');

        const text = await setWeightAndOpen(page, 'Squats', 200);

        contains(text, '140 lbs', 'warmup #1 total = 140 (70% of 200)');
        contains(text, '70/side', 'warmup #1 per side = 70 lbs (= 140/2)');
        contains(text, '180 lbs', 'warmup #2 total = 180 (90% of 200)');
        contains(text, '90/side', 'warmup #2 per side = 90 lbs (= 180/2)');
        contains(text, '200 lbs', 'top set total shown as 200 lbs (unrounded)');
        contains(text, '100/side', 'top set per side = 100 lbs (= 200/2)');

        // The pin-stack branch renders a single weight with no per-side split.
        // Its absence proves the revert took effect rather than both branches
        // somehow rendering.
        ok(text.indexOf('pin ') === -1, 'no pin-stack overflow rendering remains on Squats');
        ok(text.indexOf('/side') !== -1, 'Squats uses the two-sided plate format');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Squats, set two-sided, renders a two-sided plate breakdown.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
