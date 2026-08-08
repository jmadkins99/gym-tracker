// What this test covers
// ----------------------
// The Weight Breakdown button must appear on an exercise card if and only if
// that exercise is classified as plate-loaded (PLATE_LOADED_EXERCISES) or
// pin-loaded (PIN_STACK_EXERCISES) — the exact condition WorkoutView uses:
//   hasWeightBreakdown = isPlateLoaded || isPinStack
//
// This guards against the failure mode where a newly added exercise is left
// out of BOTH config maps and silently renders with no breakdown button
// (which is how curls-shoulder-extension / overhead-tricep-extensions first
// shipped). The expected classification is parsed straight out of config.js
// so this stays correct as the rotation and the maps evolve.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readCards, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// Pull an object/array literal out of config.js by name and eval it. The
// values in these maps are pure literals (true / { maxPin, overflowPlateMode })
// and the DEFAULT_EXERCISES array elements are plain objects, so this is safe.
function extractLiteral(source, name, open, close) {
    const start = source.indexOf(`const ${name} =`);
    if (start === -1) throw new Error(`could not find ${name} in config.js`);
    const openIdx = source.indexOf(open, start);
    const closeIdx = source.indexOf(close + ';', openIdx);
    const literal = source.slice(openIdx, closeIdx + 1);
    return new Function(`return ${literal}`)();
}

(async () => {
    const configSrc = fs.readFileSync(
        path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const PLATE_LOADED = extractLiteral(configSrc, 'PLATE_LOADED_EXERCISES', '{', '}');
    const PIN_STACK = extractLiteral(configSrc, 'PIN_STACK_EXERCISES', '{', '}');
    const DEFAULT_EXERCISES = extractLiteral(configSrc, 'DEFAULT_EXERCISES', '[', ']');

    // Build name -> expected-breakdown map from the source of truth.
    const expectedByName = new Map();
    for (const ex of DEFAULT_EXERCISES) {
        const classified = !!(PLATE_LOADED[ex.id] || PIN_STACK[ex.id]);
        expectedByName.set(ex.name, classified);
    }

    // Sanity: the rotation should contain at least one plate-loaded and one
    // pin-loaded exercise, otherwise the invariant below is vacuous.
    const plateInRotation = DEFAULT_EXERCISES.filter(e => PLATE_LOADED[e.id]);
    const pinInRotation = DEFAULT_EXERCISES.filter(e => PIN_STACK[e.id]);
    ok(plateInRotation.length > 0, 'rotation has at least one plate-loaded exercise');
    ok(pinInRotation.length > 0, 'rotation has at least one pin-loaded exercise');

    // Pin-stack caps, asserted straight off the literal. Only Leg Press
    // (`hip-adduction`) and Calf Raises are capped — at 390 and 405
    // respectively, two different machines that happen to land close
    // together; every other pin stack is bare `true`. Cable Wrist Curls in
    // particular lost its 97.5 cap in Aug 2026 and must stay uncapped. The
    // overflow *rendering* is covered by 08-personal-app-pin-stack-overflow.
    eq(PIN_STACK['hip-adduction'], { maxPin: 390 }, 'Leg Press pin stack caps at 390');
    eq(PIN_STACK['calf-raise'], { maxPin: 405 }, 'Calf Raises pin stack caps at 405');
    eq(PIN_STACK['cable-wrist-curls'], true, 'Cable Wrist Curls is an uncapped pin stack');

    // `overflowPlateMode` was dropped in Aug 2026 — it was written alongside
    // maxPin but never read. Guard against it creeping back in unwired.
    for (const [id, value] of Object.entries(PIN_STACK)) {
        ok(value === true || (typeof value === 'object' && Object.keys(value).join() === 'maxPin'),
            `PIN_STACK['${id}'] is either true or exactly { maxPin }`);
    }

    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // The rotation is split across two days now, so sweep both — a card
        // that only appears on Lower would otherwise never be classified.
        await selectDayType(page, 'lower');
        const lowerCards = await readCards(page);
        await selectDayType(page, 'upper');
        const upperCards = await readCards(page);
        const cards = [...lowerCards, ...upperCards];

        ok(cards.length === DEFAULT_EXERCISES.length,
            `rendered ${DEFAULT_EXERCISES.length} cards across both days (got ${cards.length})`);

        // The core invariant, checked for every card: a Weight Breakdown button
        // is present exactly when the exercise is plate- or pin-loaded.
        for (const card of cards) {
            ok(expectedByName.has(card.name),
                `card "${card.name}" is a known rotation exercise`);
            eq(card.hasWeightBreakdown, expectedByName.get(card.name),
                `"${card.name}" breakdown button presence matches plate/pin classification`);
        }

        // Explicit regression guard for the two pin-loaded exercises that
        // originally shipped unclassified (no button).
        for (const name of ['Recline Curls', 'Overhead Tricep Extensions']) {
            const card = cards.find(c => c.name === name);
            ok(card && card.hasWeightBreakdown,
                `"${name}" (pin-loaded) shows a Weight Breakdown button`);
        }

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Weight Breakdown button presence matches pin/plate classification.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
