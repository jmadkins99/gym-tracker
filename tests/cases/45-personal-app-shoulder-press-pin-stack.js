// What this test covers
// ----------------------
// Shoulder Press's breakdown STYLE, which has now changed twice. It was
// pin-stack, was reclassified to two-sided plate-loaded in Aug 2026, and moved
// back to pin-stack later the same month. Test 16 only asserts that a Weight
// Breakdown button exists, so it passes under any classification — the style
// needs its own pin, the same way test 26 pins Back Extensions and test 46
// pins Leg Press.
//
// A plain (non-overflow) pin stack renders one "<label>: N lbs" row per warmup
// and NO "Per side" line anywhere. Two absences carry the weight here: no
// "Per side" proves the plate-splitting branch is unreachable for this id, and
// no "Pin:" proves it took the plain branch rather than the overflow one —
// WorkoutView only emits a literal "Pin:" row when a set overflows a capped
// stack, the way cable wrist curls do above 97.5. There is likewise no top-set
// row, which the component renders only when overflow is in play.
//
// At 200 lbs: warmup 70% = 140, warmup 90% = 180 — both already land on the
// 5 lb stack, so no micro-plate is involved.
//
// Also guards the matching PR increment. 2.5 was chosen back when this was
// two-sided (= 1.25/side, the smallest real plate); it survives the move back
// because 2.5 is also a legal pin-stack micro-plate step. The increment and the
// classification have to be read together — that pairing is why both are
// asserted here rather than in separate tests.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { setWeightAndOpen } = require('../lib/deck');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// Same 4-arg shape as case 16 — it handles arrays as well as objects, and
// having one variant across every config-parsing case is worth more than the
// two characters the old hardcoded-`{` version saved.
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
    const loadTypeById = Object.fromEntries(DEFAULT_EXERCISES.map(e => [e.id, e.loadType]));

    // Config-level invariants, before touching the browser. Note this is the
    // SEED, not the classification: loadType is a user setting now, so what
    // config.js pins is only what a fresh install starts with. The browser half
    // below really is running against this seed — seedPersonalApp clears
    // gymExerciseConfig, so there is no saved override in play.
    eq(loadTypeById['shoulder-press'], 'pin',
        'shoulder-press seeds as a plain pin stack');
    eq(INCREMENTS['shoulder-press'], 2.5,
        'shoulder-press PR increment is 2.5, a legal pin-stack micro-plate step');

    // The old "not in PLATE_LOADED too" assertion is deleted rather than
    // translated. Its subject was that two independent maps could disagree,
    // with the pin branch checked first so a stale entry silently shadowed the
    // plate one. A single enum cannot contradict itself, so there is nothing
    // left to guard — do not try to reconstruct it.
    //
    // The two-sided increment sweep that used to live here is likewise gone
    // from this file: any of the 21 can be set two-sided at runtime now, so the
    // invariant cannot be checked against config source at all. It moved to
    // case 61, which runs it through getWeightIncrement for all 21.

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

        // The breakdown is part of the card's revealed face now, so this
        // navigates to Shoulder Press, opens it, and types the weight in.
        const text = await setWeightAndOpen(page, 'Shoulder Press', 200);

        contains(text, '140 lbs', 'warmup #1 = 70% of 200 = 140, already on the stack');
        contains(text, '180 lbs', 'warmup #2 = 90% of 200 = 180, already on the stack');

        // A per-side figure and a plate list are the plate-loaded signature.
        // Their absence is what proves the reclassification took effect rather
        // than both branches somehow rendering.
        ok(text.indexOf('/side') === -1,
            'no two-sided plate rendering remains on Shoulder Press');
        ok(text.indexOf(' × ') === -1,
            'and no plate list — a pin stack has no plates to name');
        ok(text.indexOf('pin ') === -1,
            'plain pin stack, not the capped-overflow branch');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Shoulder Press renders a pin-stack breakdown with a matching increment.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
