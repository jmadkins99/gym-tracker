// What this test covers
// ----------------------
// Leg Press's breakdown STYLE. It was two-sided plate-loaded until Aug 2026,
// when the gym replaced the plate sled with a pin stack. Test 16 only asserts
// that a Weight Breakdown button exists, so it passes under any classification
// — the style needs its own pin, the same way test 45 pins Shoulder Press and
// test 26 pins Back Extensions.
//
// The id is `hip-adduction`, which renders as "Leg Press". That mismatch is
// deliberate and frozen: ids are never renamed because workout history keys off
// them. Do not "fix" it.
//
// A plain (non-overflow) pin stack renders one "<label>: N lbs" row per warmup
// and NO "Per side" line anywhere. Two absences carry the weight here: no
// "Per side" proves the plate-splitting branch is unreachable for this id, and
// no "Pin:" proves it took the plain branch rather than the overflow one —
// WorkoutView only emits a literal "Pin:" row when a set overflows a capped
// stack, the way cable wrist curls do above 97.5. The real machine DOES cap,
// but the max is not known yet, so `true` (uncapped) is the honest config and
// the no-"Pin:" assertion below is what will fail loudly once a maxPin is
// added — at which point this case wants an overflow arm, not a deletion.
//
// At 200 lbs: warmup 70% = 140, warmup 90% = 180 — both already land on the
// 5 lb stack, so no micro-plate is involved.
//
// Also guards the matching PR increment. 5 was chosen back when this was
// two-sided (= 2.5/side); it survives the move because 5 is also exactly one
// pin-stack step. The increment and the classification have to be read
// together — that pairing is why both are asserted here.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

function extractLiteral(source, name) {
    const start = source.indexOf(`const ${name} =`);
    if (start === -1) throw new Error(`could not find ${name} in config.js`);
    const openIdx = source.indexOf('{', start);
    const closeIdx = source.indexOf('};', openIdx);
    return new Function(`return ${source.slice(openIdx, closeIdx + 1)}`)();
}

(async () => {
    const configSrc = fs.readFileSync(path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const PLATE_LOADED = extractLiteral(configSrc, 'PLATE_LOADED_EXERCISES');
    const PIN_STACK = extractLiteral(configSrc, 'PIN_STACK_EXERCISES');
    const INCREMENTS = extractLiteral(configSrc, 'PR_WEIGHT_INCREMENTS');

    // Config-level invariants, before touching the browser.
    eq(PIN_STACK['hip-adduction'], true,
        'hip-adduction (Leg Press) is registered as a plain pin stack');
    ok(!PLATE_LOADED['hip-adduction'],
        'hip-adduction is no longer in PLATE_LOADED_EXERCISES (would shadow the pin branch)');
    eq(INCREMENTS['hip-adduction'], 5,
        'hip-adduction PR increment is 5, exactly one pin-stack step');

    // The counterpart move in the same trip: Back Extensions went single-plate
    // -> two-side. Asserted here because the two changes shipped together and a
    // half-applied swap is the failure worth catching.
    eq(PLATE_LOADED['leg-curls'] && PLATE_LOADED['leg-curls'].type, 'two-sided',
        'leg-curls (Back Extensions) is two-sided plate-loaded');
    ok(!PIN_STACK['leg-curls'],
        'leg-curls is not also registered as a pin stack');

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
        await selectDayType(page, 'lower');

        const interacted = await page.evaluate(() => {
            const card = Array.from(document.querySelectorAll('.exercise-card'))
                .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === 'Leg Press');
            if (!card) return false;
            const input = card.querySelector('input[type="number"]');
            if (!input) return false;
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, '200');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const btn = Array.from(card.querySelectorAll('button'))
                .find(b => b.textContent.includes('Weight Breakdown'));
            if (!btn) return false;
            btn.click();
            return true;
        });
        ok(interacted, 'set Leg Press to 200 and opened its Weight Breakdown');
        await new Promise(r => setTimeout(r, 300));

        const text = await page.evaluate(() => {
            const card = Array.from(document.querySelectorAll('.exercise-card'))
                .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === 'Leg Press');
            return card ? card.textContent : '';
        });

        contains(text, 'Warmup Set #1 (~70%): 140 lbs',
            'warmup #1 = 70% of 200 = 140, already on the stack');
        contains(text, 'Warmup Set #2 (~90%): 180 lbs',
            'warmup #2 = 90% of 200 = 180, already on the stack');

        // The plate-loaded branch is what renders "Per side". Its absence is
        // what proves the reclassification actually took effect rather than
        // both branches somehow rendering.
        ok(!/Per side/.test(text),
            'no two-sided plate rendering remains on Leg Press');
        ok(!/Pin:/.test(text),
            'plain pin stack, not the capped-overflow branch');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Leg Press renders a pin-stack breakdown with a matching increment.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
