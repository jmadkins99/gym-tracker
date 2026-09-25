// What this test covers
// ----------------------
// The path a human actually uses to set Jessi up from scratch: tap "I Have a
// Coach", enter code D1O9O9M2. On that ONE load the device must hold his whole
// program — since Sep 2026 (revision 16) one Full Body day of 19 movements,
// every weekday pointing at it — with each machine's load type, the two 5 lb
// PR steps, the stable ids, the starting weights, the 5-8 reps dropdown and
// the splitRevision stamp that lets a later revision reach it.
//
// Then the drift guard. The coach preset (fresh installs) and
// migrateJessiSplit (existing devices) must produce the same program; they
// once drifted for weeks. The old check here refreshed and compared, which
// could never fail: the preset stamps the CURRENT revision and the migration
// returns early on it. So this rewinds the stamp by one and reloads, forcing
// the migration to rebuild the fresh install — which must change nothing.
// (Both now build from JESSI_PROGRAM, so this is the belt to that brace; test
// 126 checks the same thing in memory.)
//
// Until Sep 2026 this case also pinned resetData clearing Jessi's one-shot
// flags. The one-shots are retired, so those flags gate nothing.
//
// To verify this is real: change one movement's loadType in buildJessiPreset
// only (not JESSI_PROGRAM) — the load-type assertion fails; or drop
// splitRevision from buildJessiPreset — the stamp assertion fails.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, waitFor, waitForStorageKey } = require('../lib/browser');
const { eq, ok } = require('../lib/assert');
const { PUBLIC_APP_ROOT, publicAppSource } = require('../lib/paths');
const { readDeckNames } = require('../lib/deck');

const NS = 'gym-local:';
const JESSI_CODE = 'D1O9O9M2';

const FULL_BODY = [
    'Tricep Extensions', 'Lateral Raises', 'Recline Curls', 'Shoulder Flexion Curls',
    'Chest Flies', 'Chest Press', 'Incline Chest Press', 'Overhead Tricep Extensions',
    'Ab Crunches', 'Sagittal Plane Pullovers', 'Kelso Shrugs', 'Transverse Plane Rows',
    'Frontal Plane Pulldowns', 'Shoulder Press', 'Back Extensions', 'Leg Press',
    'Hip Adduction', 'Calf Raises', 'Leg Extensions',
];

// How each machine is loaded, seeded explicitly rather than left to the name
// guesses. Four disagree with what the names alone would give (Shoulder
// Flexion Curls, Sagittal Plane Pullovers, Back Extensions, Frontal Plane
// Pulldowns): the guesses serve clients who type their own names, and these
// are the machines in the personal app's gym.
const LOAD_TYPES = {
    'Tricep Extensions': 'pin', 'Lateral Raises': 'pin', 'Recline Curls': 'pin',
    'Shoulder Flexion Curls': 'pin', 'Chest Flies': 'pin', 'Chest Press': 'pin',
    'Incline Chest Press': 'pin', 'Overhead Tricep Extensions': 'pin', 'Ab Crunches': 'pin',
    'Sagittal Plane Pullovers': 'pin', 'Kelso Shrugs': 'plate-one-sided',
    'Transverse Plane Rows': 'plate-one-sided', 'Frontal Plane Pulldowns': 'plate-one-sided',
    'Shoulder Press': 'pin', 'Back Extensions': 'pin', 'Leg Press': 'plate-two-sided',
    'Hip Adduction': 'pin', 'Calf Raises': 'pin', 'Leg Extensions': 'pin',
};

const readSaved = (page) => page.evaluate((ns) => ({
    config: JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig')),
    schedule: JSON.parse(localStorage.getItem(ns + 'gymScheduleConfig')),
}), NS);

const program = (cfg) => Object.keys(cfg.days).map(k => cfg.days[k].map(e => ({
    id: e.id, name: e.name, category: e.category, order: e.order,
    loadType: e.loadType, increment: e.increment, startingWeight: e.startingWeight,
    sets: e.sets, minReps: e.minReps, maxReps: e.maxReps })));

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'networkidle0' });
        await waitFor(page, 'the setup wizard to render',
            () => Array.from(document.querySelectorAll('button')).some(b => /have a coach/i.test(b.textContent)));

        // Drive the wizard: "I Have a Coach" -> code -> submit.
        await page.evaluate(() => {
            Array.from(document.querySelectorAll('button')).find(b => /have a coach/i.test(b.textContent)).click();
        });
        await waitFor(page, 'the coach-code input to appear', () => !!document.querySelector('input[type="text"]'));
        const submitted = await page.evaluate((code) => {
            const input = document.querySelector('input[type="text"]');
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, code);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const btn = Array.from(document.querySelectorAll('button'))
                .find(b => !b.disabled && /load|submit|continue|start|next/i.test(b.textContent));
            if (!btn) return false;
            btn.click();
            return true;
        }, JESSI_CODE);
        ok(submitted, `entered coach code ${JESSI_CODE} and submitted`);

        // The config is written BEFORE the ~6s welcome animation finishes, so
        // wait for both it and the workout view.
        await waitForStorageKey(page, NS, 'gymExerciseConfig');
        await waitForApp(page, 12000);

        const { config: cfg, schedule: sched } = await readSaved(page);
        ok(cfg, 'coach code wrote an exerciseConfig');

        // --- The program, on load 1 ---------------------------------------------
        eq(Object.keys(cfg.days), ['1'], 'one day');
        eq(cfg.categories, ['Full Body'], 'named Full Body');
        eq(cfg.days[1].map(e => e.name), FULL_BODY, 'the 19 movements in the Full Body order');
        eq(Object.fromEntries(cfg.days[1].map(e => [e.name, e.loadType])), LOAD_TYPES,
            'every movement is seeded with the load type of the machine it is done on');
        eq(Object.fromEntries(cfg.days[1].filter(e => e.increment !== undefined).map(e => [e.name, e.increment])),
            { 'Back Extensions': 5, 'Leg Press': 5 },
            'only Back Extensions and Leg Press carry a 5 lb PR step (Calf Raises stays 2.5 here)');
        const byName = Object.fromEntries(cfg.days[1].map(e => [e.name, e]));
        eq([byName['Shoulder Flexion Curls'].id, byName['Shoulder Flexion Curls'].startingWeight],
            ['actual-preacher-curls', '50'], 'Shoulder Flexion Curls: stable id and starting weight');
        eq([byName['Chest Press'].id, byName['Chest Press'].startingWeight],
            ['chest-press', '100'], 'Chest Press: stable id and starting weight');
        eq([byName['Leg Extensions'].id, byName['Leg Extensions'].startingWeight],
            ['actual-leg-extensions', '50'], 'Leg Extensions: stable id and starting weight');
        eq(cfg.minimalistPrTracking, true, 'minimalist PR tracking on');
        eq(cfg.repsDropdown, { min: 5, max: 8 }, 'the 5-8 reps dropdown, on the first load');
        eq(cfg.coachPreset, 'jessi', 'stamped as his preset');
        const m = publicAppSource().match(/const JESSI_SPLIT_REVISION\s*=\s*(\d+)/);
        eq(cfg.splitRevision, Number(m[1]), 'stamped with the current revision, so a later one reaches it');

        // --- The weekday map --------------------------------------------------------
        eq(sched.workoutDays.map(d => [d.dayOfWeek, d.workoutDayNumber]), [
            ['Monday', 1], ['Tuesday', 1], ['Wednesday', 1], ['Thursday', 1],
            ['Friday', 1], ['Saturday', 1], ['Sunday', 1],
        ], 'every weekday opens the Full Body day');
        eq([sched.totalWorkoutDays, sched.scheduleIsExplicit], [1, true], 'one day, explicit');

        // --- On screen ------------------------------------------------------------
        const pills = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.day-pill')).map(p => p.textContent.trim()));
        eq(pills, ['Full Body'], 'one day pill');
        eq(await readDeckNames(page), FULL_BODY, 'the deck walks the program in order');

        // --- Drift guard: rewind the stamp, let the migration rebuild it -----------
        const before = program(cfg);
        await page.evaluate((ns) => {
            const c = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig'));
            c.splitRevision -= 1;
            localStorage.setItem(ns + 'gymExerciseConfig', JSON.stringify(c));
        }, NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        const rebuilt = await readSaved(page);
        eq(rebuilt.config.splitRevision, Number(m[1]), 'the migration ran and re-stamped the current revision');
        eq(program(rebuilt.config), before,
            'migrating a fresh install changes nothing — the preset and migration agree exactly');
        eq(rebuilt.schedule, sched, 'and its weekday map is left alone');

        eq(errors, [], 'no console errors');
        console.log('PASS: coach code D1O9O9M2 yields the Full Body program on first load, and the migration agrees.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
