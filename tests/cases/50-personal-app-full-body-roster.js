// What this test covers
// ----------------------
// The canonical roster, as declared in DEFAULT_EXERCISES and PROGRAM_DAYS.
// This is the single source-level pin on the Sep 2026 switch from
// Anterior/Posterior to one Full Body day: all 19 movements, in what order,
// on a day PROGRAM_DAYS declares, with a `category` that agrees with it.
//
// Deliberately source-only — it parses config.js and never opens a browser, so
// it runs in well under a second. That makes it the first thing to run after
// any edit to the roster, ahead of the browser cases that take ~10s each.
//
// Until Sep 2026 this was the Anterior/Posterior roster; its git history has
// the two-day version of every table below.
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
//   preacher-curls         renders as Shoulder Flexion Curls
//
// If you are here because you intentionally reordered the day or moved an
// exercise between days: update the table below AND bump
// EXERCISE_CONFIG_VERSION in config.js. A fresh install reads DEFAULT_EXERCISES
// directly and looks right either way, but any device with a saved config
// keeps its old layout until the version changes — test 124 is the pin on that.

const path = require('path');
const fs = require('fs');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// [id, display name], in render order.
const FULL_BODY = [
    ['tricep-pushdown', 'Tricep Extensions'],
    ['lateral-raises', 'Lateral Raises'],
    ['curls-shoulder-extension', 'Recline Curls'],
    ['preacher-curls', 'Shoulder Flexion Curls'],
    ['chest-flies', 'Chest Flies'],
    ['chest-press', 'Chest Press'],
    ['incline-chest-press', 'Incline Chest Press'],
    ['overhead-tricep-extensions', 'Overhead Tricep Extensions'],
    ['ab-crunch', 'Ab Crunches'],
    ['hammer-row', 'Sagittal Plane Pullovers'],
    ['kelso-shrugs', 'Kelso Shrugs'],
    ['upper-back-row', 'Transverse Plane Rows'],
    ['frontal-pulldowns', 'Frontal Plane Pulldowns'],
    ['shoulder-press', 'Shoulder Press'],
    ['leg-curls', 'Back Extensions'],
    ['hip-adduction', 'Leg Press'],
    ['leg-extensions', 'Hip Adduction'],
    ['calf-raise', 'Calf Raises'],
    ['actual-leg-extensions', 'Leg Extensions'],
];

// Every day literal an earlier program stored. None may be reused by the
// current program, or History would render an old session as a current one.
const PAST_DAY_IDS = ['anterior', 'posterior', 'upper', 'lower', 'fullbody', 'cardio'];

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
    const programDays = extractLiteral(configSrc, 'PROGRAM_DAYS', '[', ']');

    // 1. The program: one Full Body day.
    eq(programDays, [{ id: 'full-body', label: 'Full Body' }], 'the program is one Full Body day');
    for (const d of programDays) {
        ok(!PAST_DAY_IDS.includes(d.id), `"${d.id}" is not a day id an earlier era stored`);
    }

    // 2. The roster, in order.
    eq(exercises.length, FULL_BODY.length, `the program is ${FULL_BODY.length} movements`);
    eq(exercises.map(e => [e.id, e.name]), FULL_BODY, 'every movement in canonical order');

    // 3. Every exercise sits on a declared day, and every declared day is used.
    const dayIds = programDays.map(d => d.id);
    eq(exercises.filter(e => !dayIds.includes(e.day)).map(e => `${e.id}: ${e.day}`), [],
        'every exercise is on a PROGRAM_DAYS day');
    eq(dayIds.filter(id => !exercises.some(e => e.day === id)), [],
        'every PROGRAM_DAYS day has exercises');

    // 4. `category` must agree with the day's label. Nothing else checks this:
    // category is copied onto every logged workout row, so a mismatch quietly
    // poisons history rather than showing up on screen.
    const labelById = Object.fromEntries(programDays.map(d => [d.id, d.label]));
    eq(exercises.filter(e => e.category !== labelById[e.day]).map(e => `${e.id}: ${e.category}`), [],
        'every exercise category agrees with its day');

    // 5. `order` is a dense run and each day is one contiguous block, in
    // PROGRAM_DAYS order. moveExercise reindexes across the flat list and the
    // load-time sort is a plain numeric sort, so both are load-bearing.
    eq(exercises.map(e => e.order), Array.from({ length: exercises.length }, (_, i) => i),
        'order is a dense 0..N run');
    const blocks = exercises.map(e => e.day).filter((d, i, a) => i === 0 || a[i - 1] !== d);
    eq(blocks, dayIds, 'each day is one contiguous block, in PROGRAM_DAYS order');

    console.log(`PASS: the Full Body roster is canonical — ${exercises.length} movements, in order.`);
})();
