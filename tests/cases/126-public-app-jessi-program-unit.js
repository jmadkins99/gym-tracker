// What this test covers
// ----------------------
// Jessi's Sep 2026 switch from Anterior/Posterior to one Full Body day, and —
// above all — that nobody else's program can be touched by his code. No
// browser: this loads public-gym-app's clients.js and migrations.jessi.js into
// a vm context and drives them directly, so it can afford a wide matrix of
// client states in well under a second. Test 125 is the same switch through
// the real UI; test 127 installs every other client through the real wizard.
//
// Locks in:
//   1. Every OTHER client is untouched, in every state. Lexi, Grace
//      (graciepoo), Noah, Shawn and Ian — each with and without the
//      `coachPreset` stamp (it only exists since 27 Aug 2026, so older installs
//      lack it), with the legacy one-shot flags cleared and set — plus
//      self-serve wizard programs named Full Body, Day 1, Anterior/Posterior,
//      Torso/Limbs, Push/Pull/Legs, Upper/Lower and five days. Three simulated
//      loads, in App.jsx's order, must leave config and schedule byte-identical.
//      Before this change several of these WERE rewritten: the local one-shots
//      renamed and reordered an unstamped Grace, deleted Lateral Raises from a
//      self-serve "Full Body" day, collapsed two- and three-day self-serve
//      programs into one, and turned an unstamped Ian into Jessi's program.
//   2. Every other client's coach preset is byte-identical to the snapshot in
//      fixtures/public-app-other-client-presets.json, captured before the
//      change, and every coach code still resolves to the same client.
//   3. Jessi's program is one Full Body day of 19, in the personal app's
//      order, and his weekday map sends all seven days to it.
//   4. A revision-15 Anterior/Posterior config (his real ids) becomes that
//      program: ids, names, load types and PR steps are his and survive; only
//      category and order are rewritten; a movement he added himself is kept,
//      even when two share a name; a renamed fixed-id movement keeps its slot;
//      the schedule is rewritten once; a second pass does nothing.
//   5. The schedule rule: rewritten only when missing or when it names a day
//      the program no longer has. A valid one-day map he has edited survives.
//   6. A config stamped with a LATER revision is never rewritten, so an old
//      cached build can't drag a device backwards.
//   7. Drift guard: the preset (fresh install) and the migration (existing
//      device) produce the same program. The old check in test 33 could not
//      fail, because the preset stamps the current revision and the migration
//      returns early on it — so this rewinds the stamp by one and migrates.
//   8. The retired one-shots survive only as no-op stubs, so an old cached
//      App.jsx that still calls them keeps loading.
//
// To verify this test is real: put `migrateJessiToFullBody();` back into a
// simulated load with its old body, or drop the `typeof splitRevision` gate in
// migrateJessiSplit — section 1 fails on the unstamped Grace / Ian rows.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { PUBLIC_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'public-app-other-client-presets.json');

const EXPECTED_FULL_BODY = [
    'Tricep Extensions', 'Lateral Raises', 'Recline Curls', 'Shoulder Flexion Curls',
    'Chest Flies', 'Chest Press', 'Incline Chest Press', 'Overhead Tricep Extensions',
    'Ab Crunches', 'Sagittal Plane Pullovers', 'Kelso Shrugs', 'Transverse Plane Rows',
    'Frontal Plane Pulldowns', 'Shoulder Press', 'Back Extensions', 'Leg Press',
    'Hip Adduction', 'Calf Raises', 'Leg Extensions',
];

// ---- loading the app's plain-JS modules --------------------------------

function loadApp() {
    const store = new Map();
    let uuid = 0;
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        storage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: (k) => store.delete(k),
        },
        generateUUID: () => 'uuid-' + (++uuid),
    };
    vm.createContext(sandbox);
    const src = ['clients.js', 'migrations.jessi.js']
        .map(f => fs.readFileSync(path.join(PUBLIC_APP_ROOT, 'js', f), 'utf8')).join('\n;\n');
    const names = ['getPresetTemplate', 'verifyDoomId', 'migrateJessiSplit',
        'migrateJessiToAnteriorPosterior', 'migrateJessiToFullBody', 'enableRepsDropdownForJessi',
        'JESSI_SPLIT_REVISION', 'JESSI_SPLIT_SCHEDULE', 'JESSI_PROGRAM', 'buildJessiPreset'];
    const exp = names.map(n => `${n}: typeof ${n} === 'undefined' ? undefined : ${n}`).join(',');
    vm.runInContext(src + `\n;this.__app = { ${exp} };`, sandbox);
    return { app: sandbox.__app, store };
}

// SetupWizard.handleCoachIdVerified's writer (SetupWizard.jsx), reproduced so
// a preset can be turned into exactly the state a coach-code install saves.
function presetToState(preset, identifier, { stamped = true } = {}) {
    const numWorkoutDays = Object.keys(preset.workoutDays).length;
    const workoutDays = preset.scheduleDays
        ? preset.scheduleDays.map(d => ({ ...d }))
        : (preset.schedule || ['Monday', 'Wednesday', 'Friday']).map((day, i) => ({
            dayOfWeek: day, workoutDayNumber: (i % numWorkoutDays) + 1 }));
    const schedule = { version: 2, workoutDays, totalWorkoutDays: numWorkoutDays,
        scheduleIsExplicit: !!(preset.schedule || preset.scheduleDays) };
    const days = {}; const cats = new Set(); let n = 0;
    Object.entries(preset.workoutDays).forEach(([dayNum, dayData]) => {
        days[dayNum] = dayData.exercises.map((ex, idx) => ({
            id: ex.id || `${identifier}-${++n}`,
            name: ex.name, category: dayData.name, typeId: 'standard',
            sets: ex.sets || 3, minReps: ex.minReps || 8, maxReps: ex.maxReps || 12,
            ...(ex.startingWeight ? { startingWeight: ex.startingWeight } : {}),
            ...(ex.loadType ? { loadType: ex.loadType } : {}),
            ...(ex.increment ? { increment: ex.increment } : {}),
            order: idx,
        }));
        cats.add(dayData.name);
    });
    const config = {
        version: 2, days, categories: Array.from(cats),
        prTracking: preset.prTracking || false,
        advancedPrTracking: preset.advancedPrTracking || false,
        minimalistPrTracking: preset.minimalistPrTracking || false,
        ...(stamped ? { coachPreset: identifier } : {}),
        repsDropdown: preset.repsDropdown || null,
        ...(preset.splitRevision !== undefined ? { splitRevision: preset.splitRevision } : {}),
    };
    return { config, schedule };
}

// A self-serve wizard program (handleComplete writes no stamp and no flags).
function selfServe(dayNames) {
    const days = {}; let n = 0;
    dayNames.forEach((name, i) => {
        days[i + 1] = [1, 2, 3].map(j => ({ id: `self-${++n}`, name: `${name} Move ${j}`,
            category: name, typeId: 'standard', sets: 3, minReps: 8, maxReps: 12, order: j - 1 }));
    });
    // A Full Body day that shares names with the patterns the old one-shots
    // matched on — Lateral Raises was deleted outright, Leg Extensions renamed.
    if (dayNames.length === 1 && dayNames[0] === 'Full Body') {
        days[1] = ['Leg Extensions', 'Lateral Raises', 'Preacher Curls', 'Leg Press', 'Squat']
            .map((name, j) => ({ id: `self-fb-${j}`, name, category: 'Full Body', typeId: 'standard',
                sets: 3, minReps: 8, maxReps: 12, order: j }));
    }
    return {
        config: { version: 2, days, categories: dayNames.slice(),
            prTracking: true, advancedPrTracking: false, minimalistPrTracking: false },
        schedule: { version: 2, totalWorkoutDays: dayNames.length, scheduleIsExplicit: false,
            workoutDays: ['Monday', 'Wednesday', 'Friday'].map((d, i) => ({
                dayOfWeek: d, workoutDayNumber: (i % dayNames.length) + 1 })) },
    };
}

const LEGACY_FLAGS = ['jessiAPMigrationApplied', 'jessiFullBodyMigrationApplied5', 'jessiRepsDropdownEnabled'];

// One app load in local mode: the legacy one-shots (while they exist, even as
// stubs — an old cached App.jsx would still call them), then migrateJessiSplit.
function simulateLoad(app, store) {
    for (const fn of ['migrateJessiToAnteriorPosterior', 'migrateJessiToFullBody', 'enableRepsDropdownForJessi']) {
        if (typeof app[fn] === 'function') app[fn]();
    }
    const config = JSON.parse(store.get('gymExerciseConfig'));
    const schedule = store.has('gymScheduleConfig') ? JSON.parse(store.get('gymScheduleConfig')) : null;
    const split = app.migrateJessiSplit(config, [], schedule);
    if (split) {
        store.set('gymExerciseConfig', JSON.stringify(split.config));
        if (split.schedule) store.set('gymScheduleConfig', JSON.stringify(split.schedule));
    }
}

// ---- Jessi's revision-15 Anterior/Posterior config ---------------------

// Real ids from his Firestore config and his 9/21 session.
const ID = {
    tricepExt: '676b6dcc-4d13-4cd3-8fb4-6987788ceabd',
    inclinePress: '93de12cc-1835-4d83-bf75-b4335a4ff35a',
    chestFlies: '8acc159e-fc2a-4d5a-9c61-e75908ca1928',
    overheadTricep: 'ab490c47-37fb-436d-aaa9-998fd39887bb',
    abCrunches: '770cfe8d-e09c-40c7-b6c8-1676d9c64a02',
    lateralRaises: 'c6625761-50e1-41ef-8070-567228e1de4f',
    shoulderPress: '1c627b58-1227-46bb-9daf-9fe78e6b95f5',
    legPress: 'f6dde47c-e085-485a-b446-a4d1cfd566f1',
    reclineCurls: 'd989eb9d-921d-4135-8e72-57006d76e3e3',
    sagittal: '9df5161d-45c8-4435-8bef-0875a94dc41c',
    kelsoShrugs: '6f1a174a-9892-4a7f-ba94-f9278df18fc3',
    transverseRows: 'db4fb026-d3f0-4653-b4e9-4968d52df293',
    frontalPulldowns: '121551d4-91ae-440f-9f22-266039ea5e20',
    backExtensions: 'e6d80fad-07d0-464b-90bc-ab4d7e059b86',
    hipAdduction: 'c65da494-c391-47b3-a742-e6ca5184d60d',
    calfRaises: '107ecf47-ae8c-4b68-90da-f2b930118983',
};

// [id, name, loadType, increment?] in revision-15 order. Chest Flies carries
// a load type he chose himself (the seed was pin); it must survive.
const REV15_ANTERIOR = [
    [ID.tricepExt, 'Tricep Extensions', 'pin'],
    ['chest-press', 'Chest Press', 'pin'],
    [ID.inclinePress, 'Incline Chest Press', 'pin'],
    [ID.chestFlies, 'Chest Flies', 'plate-two-sided'],
    [ID.overheadTricep, 'Overhead Tricep Extensions', 'pin'],
    [ID.abCrunches, 'Ab Crunches', 'pin'],
    [ID.lateralRaises, 'Lateral Raises', 'pin'],
    [ID.shoulderPress, 'Shoulder Press', 'pin'],
    [ID.legPress, 'Leg Press', 'plate-two-sided', 5],
    ['actual-leg-extensions', 'Leg Extensions', 'pin'],
];
const REV15_POSTERIOR = [
    [ID.reclineCurls, 'Recline Curls', 'pin'],
    ['actual-preacher-curls', 'Shoulder Flexion Curls', 'pin'],
    [ID.sagittal, 'Sagittal Plane Pullovers', 'pin'],
    [ID.kelsoShrugs, 'Kelso Shrugs', 'plate-one-sided'],
    [ID.transverseRows, 'Transverse Plane Rows', 'plate-one-sided'],
    [ID.frontalPulldowns, 'Frontal Plane Pulldowns', 'plate-one-sided'],
    [ID.backExtensions, 'Back Extensions', 'pin', 5],
    [ID.hipAdduction, 'Hip Adduction', 'pin'],
    [ID.calfRaises, 'Calf Raises', 'pin'],
];

const REV14_SCHEDULE = {
    version: 2, totalWorkoutDays: 2, scheduleIsExplicit: true,
    workoutDays: [['Monday', 1], ['Tuesday', 2], ['Wednesday', 1], ['Thursday', 2],
        ['Friday', 2], ['Saturday', 1], ['Sunday', 2]].map(([dayOfWeek, workoutDayNumber]) =>
        ({ dayOfWeek, workoutDayNumber })),
};

function rev15Config({ extras = [], rename = {} } = {}) {
    const row = (category) => ([id, name, loadType, increment], order) => ({
        id, name: rename[id] || name, category, typeId: 'standard', sets: 1, minReps: 6, maxReps: 8,
        loadType, ...(increment ? { increment } : {}), order });
    const posterior = REV15_POSTERIOR.map(row('Posterior'));
    extras.forEach(([id, name]) => posterior.push({ id, name, category: 'Posterior', typeId: 'standard',
        sets: 1, minReps: 6, maxReps: 8, order: posterior.length }));
    return {
        version: 2,
        days: { 1: REV15_ANTERIOR.map(row('Anterior')), 2: posterior },
        categories: ['Anterior', 'Posterior'],
        prTracking: false, advancedPrTracking: false, minimalistPrTracking: true,
        repsDropdown: { min: 5, max: 8 },
        orderRevision: 1, gympinMode: true,
        splitRevision: 15,
    };
}

const strip = (e) => ({ id: e.id, name: e.name, category: e.category, order: e.order,
    loadType: e.loadType, increment: e.increment, startingWeight: e.startingWeight });

(() => {
    const { app, store } = loadApp();
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

    // === 1. Every other client, every state, untouched ======================
    const states = [];
    for (const who of Object.keys(fixture.presets)) {
        for (const stamped of [true, false]) {
            states.push([`${who}${stamped ? '' : ' (unstamped)'}`,
                presetToState(fixture.presets[who], who, { stamped })]);
        }
    }
    const shapes = {
        'self-serve Full Body': ['Full Body'], 'self-serve Day 1': ['Day 1'],
        'self-serve Anterior/Posterior': ['Anterior', 'Posterior'],
        'self-serve Torso/Limbs': ['Torso', 'Limbs'],
        'self-serve Push/Pull/Legs': ['Push', 'Pull', 'Legs'],
        'self-serve Upper/Lower': ['Upper', 'Lower'], 'self-serve 5-day': ['A', 'B', 'C', 'D', 'E'],
    };
    for (const [name, dayNames] of Object.entries(shapes)) states.push([name, selfServe(dayNames)]);

    const touched = [];
    for (const [name, state] of states) {
        for (const flagsSet of [false, true]) {
            store.clear();
            store.set('gymExerciseConfig', JSON.stringify(state.config));
            store.set('gymScheduleConfig', JSON.stringify(state.schedule));
            if (flagsSet) LEGACY_FLAGS.forEach(f => store.set(f, 'true'));
            const before = [store.get('gymExerciseConfig'), store.get('gymScheduleConfig')];
            for (let i = 0; i < 3; i++) simulateLoad(app, store);
            const after = [store.get('gymExerciseConfig'), store.get('gymScheduleConfig')];
            if (before[0] !== after[0] || before[1] !== after[1]) {
                touched.push(`${name}${flagsSet ? ' [flags set]' : ''}`);
            }
        }
    }
    eq(touched, [], 'no other client or self-serve program is changed by any load, stamped or not');

    // === 2. Other clients' presets and codes, byte-identical ================
    for (const who of Object.keys(fixture.presets)) {
        eq(app.getPresetTemplate(who), fixture.presets[who], `${who}'s coach preset is unchanged`);
    }
    for (const [code, who] of Object.entries(fixture.codes)) {
        eq(app.verifyDoomId(code), who, `coach code ${code} still resolves to ${who}`);
    }

    // === 3. Jessi's program ==================================================
    ok(Array.isArray(app.JESSI_PROGRAM), 'JESSI_PROGRAM is defined');
    eq(app.JESSI_PROGRAM.map(d => d.name), ['Full Body'], 'one day, named Full Body');
    eq(app.JESSI_PROGRAM[0].movements.map(m => m.name), EXPECTED_FULL_BODY,
        'the 19 movements, in the personal app\'s Full Body order');
    const REV = app.JESSI_SPLIT_REVISION;
    ok(REV > 15, `JESSI_SPLIT_REVISION is past 15 (got ${REV})`);
    eq(app.JESSI_SPLIT_SCHEDULE.map(d => d.dayOfWeek),
        ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        'the weekday map lists all seven days');
    eq([...new Set(app.JESSI_SPLIT_SCHEDULE.map(d => d.workoutDayNumber))], [1],
        'every weekday goes to day 1');

    // === 4. His revision-15 device ===========================================
    const extras = [['face-pulls-1', 'Face Pulls'], ['face-pulls-2', 'Face Pulls']];
    const seed = rev15Config({ extras });
    const out = app.migrateJessiSplit(seed, [], REV14_SCHEDULE);
    ok(out, 'a revision-15 config is migrated');
    const cfg = out.config;
    eq(Object.keys(cfg.days), ['1'], 'one day');
    eq(cfg.categories, ['Full Body'], 'categories are Full Body');
    eq(cfg.splitRevision, REV, 'stamped with the new revision');
    const day = cfg.days[1];
    eq(day.map(e => e.name), [...EXPECTED_FULL_BODY, 'Face Pulls', 'Face Pulls'],
        'the program in order, then both of his own same-named movements');
    eq(day.map(e => e.order), day.map((_, i) => i), 'order is dense');
    eq([...new Set(day.map(e => e.category))], ['Full Body'], 'every row is category Full Body');
    const allSeed = [...seed.days[1], ...seed.days[2]];
    const byId = new Map(day.map(e => [e.id, e]));
    eq(day.length, allSeed.length, 'nothing added, nothing dropped');
    for (const s of allSeed) {
        const e = byId.get(s.id);
        ok(e, `${s.name} keeps its id ${s.id}`);
        eq([e.name, e.loadType, e.increment, e.sets, e.minReps, e.maxReps],
            [s.name, s.loadType, s.increment, s.sets, s.minReps, s.maxReps],
            `${s.name}: everything he owns rides through`);
    }
    for (const k of ['repsDropdown', 'minimalistPrTracking', 'prTracking', 'orderRevision', 'gympinMode']) {
        eq(cfg[k], seed[k], `top-level ${k} passes through`);
    }
    eq(out.schedule && out.schedule.totalWorkoutDays, 1, 'the schedule is rewritten to one day');
    eq(out.schedule.workoutDays, app.JESSI_SPLIT_SCHEDULE, 'with his all-days weekday map');
    eq(out.schedule.scheduleIsExplicit, true, 'and marked explicit');
    eq(app.migrateJessiSplit(cfg, [], out.schedule), null, 'a second pass does nothing');

    // A fixed-id movement he renamed keeps its slot and his name.
    const renamed = app.migrateJessiSplit(rev15Config({ rename: { 'chest-press': 'My Chest Press' } }),
        [], REV14_SCHEDULE);
    eq(renamed.config.days[1][5].id, 'chest-press', 'the renamed Chest Press keeps slot 6');
    eq(renamed.config.days[1][5].name, 'My Chest Press', 'and keeps his name for it');
    eq(renamed.config.days[1].length, 19, 'and is not duplicated');

    // A missing fixed-id movement is added once, seeded from the program table.
    const noLegExt = rev15Config();
    noLegExt.days[1] = noLegExt.days[1].filter(e => e.id !== 'actual-leg-extensions');
    const added = app.migrateJessiSplit(noLegExt, [], REV14_SCHEDULE).config.days[1];
    const legExt = added.find(e => e.id === 'actual-leg-extensions');
    ok(legExt && legExt.name === 'Leg Extensions', 'a missing Leg Extensions is restored under its fixed id');
    eq(legExt.startingWeight, '50', 'with its starting weight');

    // === 5. The schedule rule ===============================================
    const oneDayEdited = { version: 2, totalWorkoutDays: 1, scheduleIsExplicit: true,
        workoutDays: app.JESSI_SPLIT_SCHEDULE.filter(d => d.dayOfWeek !== 'Friday') };
    eq(app.migrateJessiSplit({ ...seed, splitRevision: 15 }, [], oneDayEdited).schedule, null,
        'a valid one-day map he edited (Friday off) is left alone');
    ok(app.migrateJessiSplit(seed, [], null).schedule, 'a missing schedule is written');
    const outOfRange = { ...oneDayEdited, totalWorkoutDays: 1,
        workoutDays: [{ dayOfWeek: 'Monday', workoutDayNumber: 2 }] };
    ok(app.migrateJessiSplit(seed, [], outOfRange).schedule, 'a map naming a day that no longer exists is rewritten');

    // === 6. Never backwards ==================================================
    eq(app.migrateJessiSplit({ ...cfg, splitRevision: REV + 1 }, [], out.schedule), null,
        'a config from a later revision is never rewritten');
    eq(app.migrateJessiSplit({ ...seed, splitRevision: undefined }, [], REV14_SCHEDULE), null,
        'a config with no splitRevision is never Jessi\'s');
    eq(app.migrateJessiSplit({ ...seed, coachPreset: 'ian' }, [], REV14_SCHEDULE), null,
        'a config stamped for another client is never Jessi\'s, whatever its revision');

    // === 7. Preset and migration agree =======================================
    const preset = app.getPresetTemplate('jessi');
    eq(preset.splitRevision, REV, 'the preset stamps the current revision');
    const fresh = presetToState(preset, 'jessi');
    eq(Object.keys(fresh.config.days), ['1'], 'a coach-code install is one day');
    eq(fresh.config.days[1].map(e => e.name), EXPECTED_FULL_BODY, 'in the Full Body order');
    eq(fresh.schedule.workoutDays, app.JESSI_SPLIT_SCHEDULE, 'with the all-days weekday map');
    const rewound = app.migrateJessiSplit({ ...fresh.config, splitRevision: REV - 1 }, [], fresh.schedule);
    eq(rewound.config.days[1].map(strip), fresh.config.days[1].map(strip),
        'migrating a fresh install produces exactly the fresh install (preset and migration cannot drift)');
    eq(rewound.schedule, null, 'and leaves its schedule alone');

    // === 8. Stubs =============================================================
    for (const fn of ['migrateJessiToAnteriorPosterior', 'migrateJessiToFullBody', 'enableRepsDropdownForJessi']) {
        eq(typeof app[fn], 'function', `${fn} still exists for a cached old App.jsx`);
    }
    store.clear();
    const graceState = presetToState(fixture.presets.graciepoo, 'graciepoo', { stamped: false });
    store.set('gymExerciseConfig', JSON.stringify(graceState.config));
    const snap = JSON.stringify([...store]);
    app.migrateJessiToAnteriorPosterior(); app.migrateJessiToFullBody(); app.enableRepsDropdownForJessi();
    eq(JSON.stringify([...store]), snap, 'the stubs read and write nothing');

    console.log('PASS: Jessi\'s Full Body program lands, and no other client can be touched.');
})();
