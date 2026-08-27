// What this test covers
// ----------------------
// Every exercise declares a legal `loadType`, and every card therefore shows a
// Weight Breakdown button.
//
// Read the second half of that sentence with care: it is no longer the
// discriminating assertion it once was. This case used to check the button
// appeared if and only if the exercise was in one of two config maps, which
// guarded the failure mode where a new exercise was left out of BOTH and
// silently rendered no button (how curls-shoulder-extension and
// overhead-tricep-extensions first shipped). With `loadType` mandatory and
// 'pin' a legal value, that condition is unconditionally true and the browser
// half of this case can only catch a card rendering no button at all.
//
// The teeth moved to two places:
//   - the `untyped` assertion below, which is the direct heir of "left out of
//     both maps" — a missing or misspelled loadType is the same bug wearing a
//     new spelling, and it is caught here at source level;
//   - case 58, which is the only place a CHANGED loadType is proven to change
//     what renders. That is the case to reach for when touching the breakdown.
//
// Also pinned here: the shape of PIN_STACK_CAPS, and that a cap only ever
// names a real, pin-seeded exercise.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readCards, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// Pull an object/array literal out of config.js by name and eval it. The
// DEFAULT_EXERCISES array elements are plain objects and PIN_STACK_CAPS holds
// bare numbers, so this is safe.
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
    const DEFAULT_EXERCISES = extractLiteral(configSrc, 'DEFAULT_EXERCISES', '[', ']');
    const PIN_STACK_CAPS = extractLiteral(configSrc, 'PIN_STACK_CAPS', '{', '}');
    const LOAD_TYPES = ['pin', 'plate-one-sided', 'plate-two-sided'];

    // The heir to "in exactly one of the two maps". Listing the offenders
    // instead of counting them makes the failure message name the id.
    const untyped = DEFAULT_EXERCISES
        .filter(e => !LOAD_TYPES.includes(e.loadType))
        .map(e => `${e.id}: ${JSON.stringify(e.loadType)}`);
    eq(untyped, [], 'every DEFAULT_EXERCISES entry declares one of the three legal loadTypes');

    const loadTypeById = Object.fromEntries(DEFAULT_EXERCISES.map(e => [e.id, e.loadType]));

    // Sanity: both families are seeded, or the assertions elsewhere that rely
    // on a seeded plate machine (26, 46) or a seeded stack (07, 45) are vacuous.
    ok(DEFAULT_EXERCISES.some(e => e.loadType === 'pin'),
        'rotation seeds at least one pin stack');
    ok(DEFAULT_EXERCISES.some(e => e.loadType.startsWith('plate-')),
        'rotation seeds at least one plate-loaded exercise');

    // Every card must show a button — see the header on why this is weak now.
    const expectedByName = new Map(DEFAULT_EXERCISES.map(e => [e.name, true]));

    // Pin-stack caps. Calf Raises is the only capped machine. Cable Wrist Curls
    // lost its 97.5 cap in Aug 2026 and must stay uncapped; Leg Press was
    // briefly capped at 390 while it was classified as a stack. The overflow
    // *rendering* is covered by 08-personal-app-pin-stack-overflow.
    eq(loadTypeById['calf-raise'], 'pin', 'Calf Raises seeds as a pin stack');
    eq(PIN_STACK_CAPS['calf-raise'], 405, 'Calf Raises caps at 405');
    ok(!('cable-wrist-curls' in PIN_STACK_CAPS),
        'Cable Wrist Curls is uncapped');
    eq(Object.keys(PIN_STACK_CAPS), ['calf-raise'],
        'Calf Raises is the only capped stack in the program');

    // A cap is keyed by id and read only when loadType is 'pin', so a cap on a
    // non-pin id — or on an id that does not exist — is dead config that reads
    // as intent. The `typeof cap === 'number'` half is the heir to the old
    // `overflowPlateMode` guard: the moment someone writes { maxPin, ... }
    // again, this fails.
    for (const [id, cap] of Object.entries(PIN_STACK_CAPS)) {
        ok(id in loadTypeById, `PIN_STACK_CAPS['${id}'] names a real exercise id`);
        eq(loadTypeById[id], 'pin', `PIN_STACK_CAPS['${id}'] names a pin-seeded exercise`);
        ok(typeof cap === 'number' && cap > 0 && cap % 5 === 0,
            `PIN_STACK_CAPS['${id}'] is a plain number on a 5 lb stack notch (got ${JSON.stringify(cap)})`);
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
        await selectDayType(page, 'posterior');
        const lowerCards = await readCards(page);
        await selectDayType(page, 'anterior');
        const upperCards = await readCards(page);
        const cards = [...lowerCards, ...upperCards];

        ok(cards.length === DEFAULT_EXERCISES.length,
            `rendered ${DEFAULT_EXERCISES.length} cards across both days (got ${cards.length})`);

        // Every card shows a button, because every exercise carries a loadType.
        for (const card of cards) {
            ok(expectedByName.has(card.name),
                `card "${card.name}" is a known rotation exercise`);
            eq(card.hasWeightBreakdown, true,
                `"${card.name}" shows a Weight Breakdown button`);
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
