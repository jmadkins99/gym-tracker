// What this test covers
// ----------------------
// The canonical Anterior/Posterior roster, as declared in DEFAULT_EXERCISES.
// This is the single source-level pin on the August 2026 switch away from
// Upper/Lower: which day every one of the 21 movements lives on, in what
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
//   hammer-row             renders as Sagittal Plane Pulldowns
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
    ['chest-press', 'Chest Press'],
    ['incline-chest-press', 'Incline Chest Press'],
    ['chest-flies', 'Chest Flies'],
    ['shoulder-press', 'Shoulder Press'],
    ['lateral-raises', 'Lateral Raises'],
    ['overhead-tricep-extensions', 'Overhead Tricep Extensions'],
    // Abs and quads moved up ahead of Tricep Extensions and the wrist pair, Aug 2026.
    ['ab-crunch', 'Ab Crunches'],
    ['actual-leg-extensions', 'Leg Extensions'],
    ['tricep-pushdown', 'Tricep Extensions'],
    // The wrist pair used to sit here. It moved to Posterior in Aug 2026 — see
    // the note in POSTERIOR below.
    // Quad-dominant, so it closes the anterior day. Its id is `hip-adduction`;
    // the movement actually named Hip Adduction is `leg-extensions`, on
    // Posterior. Both mismatches are frozen.
    ['hip-adduction', 'Leg Press'],
];

const POSTERIOR = [
    ['curls-shoulder-extension', 'Recline Curls'],
    ['frontal-pulldowns', 'Frontal Plane Pulldowns'],
    ['hammer-row', 'Sagittal Plane Pulldowns'],
    ['upper-back-row', 'Transverse Plane Rows'],
    ['kelso-shrugs', 'Kelso Shrugs'],
    ['preacher-curls', 'Preacher Curls'],
    // The wrist pair, moved here from Anterior in Aug 2026 and placed directly
    // after the curls. They are forearm work done back to back at the same
    // cable, so splitting them flexor/extensor across the two days never earned
    // its keep, and tacking them onto the end of a pressing day was worse.
    ['reverse-wrist-curls', 'Reverse Wrist Curls'],
    ['cable-wrist-curls', 'Cable Wrist Curls'],
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
    eq(exercises.length, 21, 'the program is 21 movements');

    // 2. Every id lands on the right day. One assertion, whole reassignment.
    const expectedDayById = {};
    for (const [id] of ANTERIOR) expectedDayById[id] = 'anterior';
    for (const [id] of POSTERIOR) expectedDayById[id] = 'posterior';
    const actualDayById = {};
    for (const ex of exercises) actualDayById[ex.id] = ex.day;
    eq(actualDayById, expectedDayById,
        'every one of the 21 ids is assigned to its canonical day');

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

    // 5. `order` is a dense 0..20 run and the two days are contiguous blocks
    // with Anterior first. moveExercise reindexes across the flat list and the
    // load-time sort is a plain numeric sort, so both properties are load-bearing.
    eq(exercises.map(e => e.order), Array.from({ length: 21 }, (_, i) => i),
        'order is a dense 0..20 run');
    const firstPosterior = exercises.findIndex(e => e.day === 'posterior');
    // Derived, not hardcoded: the split moved once already (the wrist pair
    // went to Posterior in Aug 2026) and a literal here just goes stale.
    eq(firstPosterior, ANTERIOR.length,
        `the Anterior block is the first ${ANTERIOR.length} entries`);
    ok(exercises.slice(firstPosterior).every(e => e.day === 'posterior'),
        'the two days are contiguous blocks — no Anterior entry after the split point');

    // 6. The old day literals are gone from the roster entirely.
    const stale = exercises.filter(e => e.day === 'upper' || e.day === 'lower');
    eq(stale, [], 'no exercise still carries an upper/lower day');

    console.log(`PASS: the Anterior/Posterior roster is canonical — ${ANTERIOR.length} + ${POSTERIOR.length}, in order.`);
})();
