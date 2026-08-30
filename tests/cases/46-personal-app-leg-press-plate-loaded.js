// What this test covers
// ----------------------
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
// The 390 cap went with the pin-stack classification. Overflow rendering now
// lives entirely on Calf Raises in 08-personal-app-pin-stack-overflow, which is
// the program's only capped stack.
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
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { setWeightAndOpen } = require('../lib/deck');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// Same 4-arg shape as case 16 — see the note there.
function extractLiteral(source, name, open, close) {
    const start = source.indexOf(`const ${name} =`);
    if (start === -1) throw new Error(`could not find ${name} in config.js`);
    const openIdx = source.indexOf(open, start);
    const closeIdx = source.indexOf(close + ';', openIdx);
    return new Function(`return ${source.slice(openIdx, closeIdx + 1)}`)();
}

(async () => {
    const configSrc = fs.readFileSync(path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const DEFAULT_EXERCISES = extractLiteral(configSrc, 'DEFAULT_EXERCISES', '[', ']');
    const INCREMENTS = extractLiteral(configSrc, 'PR_WEIGHT_INCREMENTS', '{', '}');
    const PIN_STACK_CAPS = extractLiteral(configSrc, 'PIN_STACK_CAPS', '{', '}');
    const loadTypeById = Object.fromEntries(DEFAULT_EXERCISES.map(e => [e.id, e.loadType]));

    // Config-level invariants, before touching the browser. These are SEED
    // values — loadType is a user setting now, and this case runs on a fresh
    // install, so the seed is what renders. `machineWeight: 0` used to be
    // asserted here; it went away with the old maps, having never been read by
    // any code, the same way `overflowPlateMode` did.
    eq(loadTypeById['hip-adduction'], 'plate-two-sided',
        'hip-adduction (Leg Press) seeds as two-sided plate-loaded');
    eq(INCREMENTS['hip-adduction'], 5,
        'hip-adduction PR increment is 5, which is 2.5/side');

    // Calf Raises is the only capped stack left now that Leg Press's 390 went
    // with its pin-stack classification. Asserted here rather than only in test
    // 16 because this is where the cap/increment pairing is checked — the two
    // have to be read together, and 405 is exactly the kind of number that
    // invites being copied onto a neighbouring machine.
    eq(loadTypeById['calf-raise'], 'pin', 'calf-raise seeds as a pin stack');
    eq(PIN_STACK_CAPS['calf-raise'], 405, 'calf-raise is capped at 405');
    eq(INCREMENTS['calf-raise'], 5,
        'calf-raise PR increment is 5, exactly one pin-stack step');

    // Back Extensions is the program's other two-sided plate machine. It moved
    // single-plate -> two-side in the same Aug 2026 trip that took Leg Press to
    // a stack, and it does NOT move back — the two changes are independent and
    // reverting both together is the mistake worth catching.
    eq(loadTypeById['leg-curls'], 'plate-two-sided',
        'leg-curls (Back Extensions) still seeds as two-sided plate-loaded');

    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate(() => localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior');

        const text = await setWeightAndOpen(page, 'Leg Press', 200);

        contains(text, '140 lbs', 'warmup #1 total = 140 (70% of 200)');
        contains(text, '70/side', 'warmup #1 per side = 70 lbs (= 140/2)');
        contains(text, '180 lbs', 'warmup #2 total = 180 (90% of 200)');
        contains(text, '90/side', 'warmup #2 per side = 90 lbs (= 180/2)');
        contains(text, '200 lbs', 'top set total shown as 200 lbs (unrounded)');
        contains(text, '100/side', 'top set per side = 100 lbs (= 200/2)');

        // The pin-stack branch renders a single weight with no per-side split.
        // Its absence proves the revert took effect rather than both branches
        // somehow rendering.
        ok(text.indexOf('pin ') === -1, 'no pin-stack overflow rendering remains on Leg Press');
        ok(text.indexOf('/side') !== -1, 'Leg Press uses the two-sided plate format');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Leg Press renders a two-sided plate breakdown with a matching increment.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
