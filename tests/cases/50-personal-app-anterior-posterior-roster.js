// What this test covers
// ----------------------
// The canonical Anterior/Posterior roster, as declared in DEFAULT_EXERCISES.
// This is the single source-level pin on the August 2026 switch away from
// Upper/Lower: which day every one of the 19 movements lives on, in what
// order, and with a `category` that agrees with its `day`.
//
// Deliberately source-only — it parses config.js and never opens a browser, so
// it runs in well under a second. That makes it the first thing to run after
// any edit to the roster, ahead of the browser cases that take ~10s each.
//
// The id/name mismatches below are frozen and intentional. Workout history
// references ids, so an id can never be renamed to match its label:
//   leg-curls              renders as Back Extensions
//   leg-extensions         renders as Hip Adduction
//   hip-adduction          renders as Leg Press
//   actual-leg-extensions  renders as Leg Extensions (the real one)
//   hammer-row             renders as Sagittal Plane Pullovers
//   tricep-pushdown        renders as Tricep Extensions
//   curls-shoulder-extension renders as Recline Curls
//
// If you are here because you intentionally moved an exercise between days or
// reordered one: update the tables below AND bump EXERCISE_CONFIG_VERSION in
// config.js. A fresh install reads DEFAULT_EXERCISES directly and looks right
// either way, but any device with a saved config keeps its old layout until
// the version changes — see test 54, which is the pin on that.

const path = require('path');
const fs = require('fs');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// [id, display name], in render order. Anterior is the first block.
const ANTERIOR = [
    // Moved to the front of the day, Sep 2026.
    ['tricep-pushdown', 'Tricep Extensions'],
    ['chest-press', 'Chest Press'],
    ['incline-chest-press', 'Incline Chest Press'],
    ['chest-flies', 'Chest Flies'],
    ['shoulder-press', 'Shoulder Press'],
    ['lateral-raises', 'Lateral Raises'],
    ['overhead-tricep-extensions', 'Overhead Tricep Extensions'],
    ['ab-crunch', 'Ab Crunches'],
    // Quad-dominant, so the two leg movements close the day. Its id is
    // `hip-adduction`; the movement actually named Hip Adduction is
    // `leg-extensions`, on Posterior. Both mismatches are frozen.
    ['hip-adduction', 'Leg Press'],
    ['actual-leg-extensions', 'Leg Extensions'],
];

const POSTERIOR = [
    ['curls-shoulder-extension', 'Recline Curls'],
    // Renamed from Preacher Curls, Sep 2026. The id is frozen.
    ['preacher-curls', 'Shoulder Flexion Curls'],
    // Renamed from Sagittal Plane Pulldowns, Sep 2026. The id is frozen and has
    // not described the movement for far longer than the name did.
    ['hammer-row', 'Sagittal Plane Pullovers'],
    ['upper-back-row', 'Transverse Plane Rows'],
    ['kelso-shrugs', 'Kelso Shrugs'],
    // Down from second to sixth, Sep 2026.
    ['frontal-pulldowns', 'Frontal Plane Pulldowns'],
    // The wrist pair sat here — moved over from Anterior in Aug 2026, directly
    // after the curls — until Sep 2026 dropped both from the program. They took
    // the 5-8 rep range with them, which had been built for those two alone.
    ['leg-curls', 'Back Extensions'],
    // Adductor magnus is a hip extensor, which is why this sits with the
    // posterior chain rather than with the quads.
    ['leg-extensions', 'Hip Adduction'],
    ['calf-raise', 'Calf Raises'],
];

function extractLiteral(source, name, open, close) {
    const start = source.indexOf(`const ${name} =`);
    if (start === -1) throw new Error(`could not find ${name} in config.js`);
    const openIdx = source.indexOf(open, start);
    const closeIdx = source.indexOf(close + ';', openIdx);
    return new Function(`return ${source.slice(openIdx, closeIdx + 1)}`)();
}

(() => {
    const configSrc = fs.readFileSync(
        path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const exercises = extractLiteral(configSrc, 'DEFAULT_EXERCISES', '[', ']');

    // 1. Nothing was added or dropped by the reassignment.
    eq(exercises.length, 19, 'the program is 19 movements');

    // 2. Every id lands on the right day. One assertion, whole reassignment.
    const expectedDayById = {};
    for (const [id] of ANTERIOR) expectedDayById[id] = 'anterior';
    for (const [id] of POSTERIOR) expectedDayById[id] = 'posterior';
    const actualDayById = {};
    for (const ex of exercises) actualDayById[ex.id] = ex.day;
    eq(actualDayById, expectedDayById,
        'every one of the 19 ids is assigned to its canonical day');

    // 3. Each day renders its movements in canonical order.
    const anterior = exercises.filter(e => e.day === 'anterior');
    const posterior = exercises.filter(e => e.day === 'posterior');
    eq(anterior.map(e => e.name), ANTERIOR.map(([, n]) => n),
        `Anterior holds its ${ANTERIOR.length} movements in canonical order`);
    eq(posterior.map(e => e.name), POSTERIOR.map(([, n]) => n),
        `Posterior holds its ${POSTERIOR.length} movements in canonical order`);

    // 4. `category` must agree with `day`. Nothing else checks this: category
    // is copied onto every logged workout row, so a mismatch quietly poisons
    // history rather than showing up on screen.
    const mismatched = exercises
        .filter(e => e.category !== (e.day === 'anterior' ? 'Anterior' : 'Posterior'))
        .map(e => `${e.id}: day=${e.day} category=${e.category}`);
    eq(mismatched, [], 'every exercise category agrees with its day');

    // 5. `order` is a dense 0..18 run and the two days are contiguous blocks
    // with Anterior first. moveExercise reindexes across the flat list and the
    // load-time sort is a plain numeric sort, so both properties are load-bearing.
    eq(exercises.map(e => e.order), Array.from({ length: 19 }, (_, i) => i),
        'order is a dense 0..18 run');
    const firstPosterior = exercises.findIndex(e => e.day === 'posterior');
    // Derived, not hardcoded: the boundary has moved twice already (the wrist
    // pair went to Posterior in Aug 2026, then left the program in Sep) and a
    // literal here just goes stale.
    eq(firstPosterior, ANTERIOR.length,
        `the Anterior block is the first ${ANTERIOR.length} entries`);
    ok(exercises.slice(firstPosterior).every(e => e.day === 'posterior'),
        'the two days are contiguous blocks — no Anterior entry after the split point');

    // 6. The old day literals are gone from the roster entirely.
    const stale = exercises.filter(e => e.day === 'upper' || e.day === 'lower');
    eq(stale, [], 'no exercise still carries an upper/lower day');

    console.log(`PASS: the Anterior/Posterior roster is canonical — ${ANTERIOR.length} + ${POSTERIOR.length}, in order.`);
})();
