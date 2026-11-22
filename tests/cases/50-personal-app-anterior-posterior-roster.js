// What this test covers
// ----------------------
// The canonical roster, as declared in DEFAULT_EXERCISES and PROGRAM_DAYS.
// This is the single source-level pin on the Nov 2026 (v28) switch from one
// Full Body day to alternating Anterior / Posterior days: every movement, in
// what order, on a day PROGRAM_DAYS declares, with a `category` that agrees
// with it.
//
// Deliberately source-only — it parses config.js and never opens a browser, so
// it runs in well under a second. That makes it the first thing to run after
// any edit to the roster, ahead of the browser cases that take ~10s each.
//
// Sep–Nov 2026 this was the Full Body roster, and before that the Aug 2026
// Anterior/Posterior one; git history has both.
//
// Since v25 (Oct 2026) every id names the muscle and joint action, so ids and
// labels no longer contradict each other. Workout history references ids, so
// a different movement takes a new id rather than reusing an old one — which is
// why High to Low Flies is `pecs-shoulder-adduction` and not the retired Lat
// Pullover's id it replaced on the day.
//
// If you are here because you intentionally reordered a day or moved an
// exercise between days: update the tables below AND bump
// EXERCISE_CONFIG_VERSION in config.js. A fresh install reads DEFAULT_EXERCISES
// directly and looks right either way, but any device with a saved config
// keeps its old layout until the version changes — test 124 is the pin on that.

const path = require('path');
const fs = require('fs');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// [id, display name], in render order, per day.
const ANTERIOR = [
    ['pecs-transverse-shoulder-adduction', 'Chest Flies'],
    ['pecs-shoulder-flexion', 'Low to High Flies'],
    ['pecs-shoulder-adduction', 'High to Low Flies'],
    ['pecs-transverse-shoulder-adduction-with-elbow-extension', 'Chest Press'],
    ['triceps-elbow-extension', 'Tricep Extensions'],
    ['delts-shoulder-abduction-stop-at-90-degrees', 'Lateral Raises'],
    ['triceps-elbow-extension-with-shoulder-flexion', 'Overhead Tricep Extensions'],
    ['delts-shoulder-abduction-above-90-degrees', 'Lu Raises'],
    ['triceps-elbow-extension-during-shoulder-flexion', 'JM Press'],
    ['quads-knee-extension', 'Leg Extensions'],
    ['quads-knee-extension-during-hip-flexion', 'Squats'],
];
const POSTERIOR = [
    ['biceps-elbow-flexion-with-shoulder-extension', 'Recline Curls'],
    ['biceps-elbow-flexion-with-shoulder-flexion', 'Preacher Curls'],
    ['biceps-wrist-supination', 'Supinations'],
    ['lats-sagittal-shoulder-extension', 'Sagittal Pulldowns'],
    ['lats-frontal-shoulder-adduction', 'Frontal Pulldowns'],
    ['abs-spinal-flexion', 'Ab Crunches'],
    ['traps-scapular-retraction', 'Kelso Shrugs'],
    ['brachioradialis-elbow-flexion', 'Reverse Wrist Curls'],
    ['forearm-wrist-flexion', 'Wrist Curls'],
    ['calves-ankle-extension', 'Calf Raises'],
    ['erectors-spinal-extension', 'Stiff Legged Deadlift'],
];

// Retired in v28. Their history stays; they must not come back on the roster.
const RETIRED_V28 = [
    'lats-sagittal-shoulder-extension-above-120-degrees',  // Dumbbell Lat Pullover
    'delts-transverse-shoulder-abduction-with-elbow-flexion',  // Transverse Rows
    'adductors-transverse-hip-adduction',  // Hip Adduction
];

// Every day literal an earlier program stored. None may be reused by the
// current program, or History would render an old session as a current one.
const PAST_DAY_IDS = ['anterior', 'posterior', 'upper', 'lower', 'fullbody', 'full-body', 'cardio'];

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

    // 1. The program: Anterior then Posterior, on day ids no earlier era used.
    eq(programDays, [{ id: 'anterior-2', label: 'Anterior' }, { id: 'posterior-2', label: 'Posterior' }],
        'the program is an Anterior day and a Posterior day');
    for (const d of programDays) {
        ok(!PAST_DAY_IDS.includes(d.id), `"${d.id}" is not a day id an earlier era stored`);
    }

    // 2. The roster, in order.
    const onDay = (day) => exercises.filter(e => e.day === day).map(e => [e.id, e.name]);
    eq(onDay('anterior-2'), ANTERIOR, 'the Anterior day, in canonical order');
    eq(onDay('posterior-2'), POSTERIOR, 'the Posterior day, in canonical order');
    eq(exercises.length, ANTERIOR.length + POSTERIOR.length,
        `the program is ${ANTERIOR.length + POSTERIOR.length} movements`);
    eq(exercises.filter(e => RETIRED_V28.includes(e.id)).map(e => e.id), [],
        'Lat Pullover, Transverse Rows and Hip Adduction are off the roster');

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

    console.log(`PASS: the Anterior/Posterior roster is canonical — ${exercises.length} movements, in order.`);
})();
