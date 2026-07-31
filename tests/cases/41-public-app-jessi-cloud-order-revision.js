// What this test covers
// ----------------------
// How a code-side reorder reaches Jessi now that he is SIGNED IN.
//
// Every reorder before 2026-07-26 worked by bumping a sentinel
// (jessiFullBodyMigrationApplied<N>) so migrateJessiToFullBody would re-run.
// That entire block lives inside `if (repo.mode === 'local')` (index.html
// ~:3538), added by e4aa6f8 the day after the last reorder shipped. On a
// signed-in device repoReady resolves to a Firestore repo on the FIRST load,
// so the block never executes and the sentinel lever is disconnected.
//
// reconcileFullBodyOrder replaces it: a pure function applied to the config
// AFTER loadAll, in BOTH modes, gated on `orderRevision` rather than on a
// localStorage sentinel.
//
// The suite has no Firestore emulator, so this exercises the seam in local
// mode with the sentinel already set to 'true' — migrateJessiToFullBody bails
// on its first line, which reproduces exactly what a cloud-mode device sees:
// nothing but reconcileFullBodyOrder can reorder anything.
//
// Asserted here:
//   1. The order changes despite the sentinel being spent (the whole point).
//   2. `orderRevision` is stamped, and a second load is a no-op.
//   3. History still resolves BY ID — a reorder must never hand a card its
//      neighbour's weight. This is the "don't break Jessi" assertion.
//   4. Every exercise keeps its Weight Breakdown button (the 90028e6 /
//      5cad8f8 regression, twice burned).
//   5. A program that is NOT Jessi's is left alone — the reconcile is scoped
//      to configs containing all 14 canonical names, so other coach-code
//      clients and self-setup users are untouched.
//
// To verify this is real: revert getDesiredOrder's /frontal/ rank to 7 and
// drop the reconcile call — assertion 1 fails with Frontal Plane Pulldowns
// back down at slot 8.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiDefaultSchedule, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PUBLIC_APP_ROOT = path.resolve(__dirname, '..', '..', '..', 'public_gym_app');

// Real ids straight out of his Firestore exerciseConfig doc.
const ID = {
    chestFlies: '8acc159e-fc2a-4d5a-9c61-e75908ca1928',
    reclineCurls: 'd989eb9d-921d-4135-8e72-57006d76e3e3',
    inclinePress: '93de12cc-1835-4d83-bf75-b4335a4ff35a',
    transverseRows: 'db4fb026-d3f0-4653-b4e9-4968d52df293',
    kelsoShrugs: '6f1a174a-9892-4a7f-ba94-f9278df18fc3',
    sagittalPulldowns: '9df5161d-45c8-4435-8bef-0875a94dc41c',
    tricepExt: '676b6dcc-4d13-4cd3-8fb4-6987788ceabd',
    frontalPulldowns: '121551d4-91ae-440f-9f22-266039ea5e20',
    abCrunches: '770cfe8d-e09c-40c7-b6c8-1676d9c64a02',
    shoulderPress: '1c627b58-1227-46bb-9daf-9fe78e6b95f5',
    calfRaises: '107ecf47-ae8c-4b68-90da-f2b930118983',
    hipAdduction: 'c65da494-c391-47b3-a742-e6ca5184d60d',
    backExtensions: 'e6d80fad-07d0-464b-90bc-ab4d7e059b86',
    legPress: 'f6dde47c-e085-485a-b446-a4d1cfd566f1',
};

// His config EXACTLY as it sits in Firestore today (post-5cad8f8 order):
// Frontal Plane Pulldowns down at slot 7, which is what this reorder moves.
const CURRENT_ROWS = [
    [ID.chestFlies, 'Chest Flies'],
    [ID.reclineCurls, 'Recline Curls'],
    [ID.inclinePress, 'Incline Chest Press'],
    [ID.transverseRows, 'Transverse Plane Rows'],
    [ID.kelsoShrugs, 'Kelso Shrugs'],
    [ID.sagittalPulldowns, 'Sagittal Plane Pulldowns'],
    [ID.tricepExt, 'Tricep Extensions'],
    [ID.frontalPulldowns, 'Frontal Plane Pulldowns'],
    [ID.abCrunches, 'Ab Crunches'],
    [ID.shoulderPress, 'Shoulder Press'],
    [ID.calfRaises, 'Calf Raises'],
    [ID.hipAdduction, 'Hip Adduction'],
    [ID.backExtensions, 'Back Extensions'],
    [ID.legPress, 'Leg Press'],
];

// Frontal Plane Pulldowns rises 8 -> 3; the five it passes each shift down one.
const EXPECTED_ORDER = [
    'Chest Flies',
    'Recline Curls',
    'Frontal Plane Pulldowns',
    'Incline Chest Press',
    'Transverse Plane Rows',
    'Kelso Shrugs',
    'Sagittal Plane Pulldowns',
    'Tricep Extensions',
    'Ab Crunches',
    'Shoulder Press',
    'Calf Raises',
    'Hip Adduction',
    'Back Extensions',
    'Leg Press',
];

// Distinct weight per id so a scrambled lookup is unmistakable.
const HISTORY_WEIGHTS = {
    [ID.chestFlies]: 122.5,
    [ID.reclineCurls]: 52.5,
    [ID.inclinePress]: 130,
    [ID.transverseRows]: 130,
    [ID.kelsoShrugs]: 150,
    [ID.sagittalPulldowns]: 117.5,
    [ID.tricepExt]: 32.5,
    [ID.frontalPulldowns]: 130,
    [ID.abCrunches]: 112.5,
    [ID.shoulderPress]: 105,
    [ID.calfRaises]: 220,
    [ID.hipAdduction]: 70,
    [ID.backExtensions]: 25,
    [ID.legPress]: 140,
};

function jessiConfig(rows) {
    return {
        version: 2,
        categories: ['Full Body'],
        minimalistPrTracking: true,
        prTracking: false,
        advancedPrTracking: false,
        gympinMode: true,
        repsDropdown: { min: 5, max: 8 },
        days: {
            1: rows.map(([id, name], order) => ({
                id, name, category: 'Full Body', order,
                typeId: 'standard', sets: 1, minReps: 6, maxReps: 8,
            })),
        },
    };
}

function readStored(page) {
    return page.evaluate(() => {
        const cfg = JSON.parse(localStorage.getItem('gym-local:gymExerciseConfig'));
        return {
            names: (cfg.days[1] || []).map(e => e.name),
            ids: (cfg.days[1] || []).map(e => e.id),
            orderRevision: cfg.orderRevision,
            gympinMode: cfg.gympinMode,
            repsDropdown: cfg.repsDropdown,
        };
    });
}

function readCardNames(page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('.exercise-card'))
            .map(c => c.querySelector('.exercise-name')?.textContent?.trim())
            .filter(Boolean));
}

// Seeds, marks the sentinel spent, reloads, settles.
async function loadWith(page, config, history) {
    await seedPublicApp(page, {
        exerciseConfig: config,
        workoutHistory: history,
        schedule: jessiDefaultSchedule(),
    });
    await page.evaluate(() => {
        // The lever a cloud device can no longer pull. Spent on purpose.
        localStorage.setItem('gym-local:jessiFullBodyMigrationApplied5', 'true');
        localStorage.setItem('gym-local:lastBackupReminder', String(Date.now()));
    });
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1500));
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        const history = [
            workoutEntry({
                date: '2026-07-02',
                day: 1,
                // reps 7 sits inside the 6-8 goal range, so minimalist PR
                // tracking neither bumps the weight nor flags stagnation —
                // the default weight is the raw last-session weight.
                exercises: Object.entries(HISTORY_WEIGHTS).map(([id, weight]) => ({
                    id, name: 'x', weight: String(weight), reps: '7',
                })),
            }),
        ];

        // --- 1. The reorder lands despite the spent sentinel -----------------
        await loadWith(page, jessiConfig(CURRENT_ROWS), history);

        eq(await readCardNames(page), EXPECTED_ORDER,
            'cards render in the new order even though the sentinel is spent');

        const stored = await readStored(page);
        eq(stored.names, EXPECTED_ORDER, 'persisted config matches the new order');

        // --- 2. Stamped, and idempotent on the next load ---------------------
        eq(stored.orderRevision, 1, 'orderRevision is stamped on the reconciled config');
        eq(stored.gympinMode, true, 'gympinMode survives the reconcile');
        eq(stored.repsDropdown, { min: 5, max: 8 }, 'repsDropdown survives the reconcile');

        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1500));
        eq(await readCardNames(page), EXPECTED_ORDER, 'second load leaves the order untouched');

        // --- 3. History still resolves by id, not by position ---------------
        const defaults = await page.evaluate(() => {
            const out = {};
            for (const c of document.querySelectorAll('.exercise-card')) {
                const name = c.querySelector('.exercise-name')?.textContent?.trim();
                const input = c.querySelector('input[type="number"]');
                if (name && input) out[name] = input.value;
            }
            return out;
        });
        const EXPECTED_DEFAULTS = {
            'Chest Flies': '122.5',
            'Recline Curls': '52.5',
            'Frontal Plane Pulldowns': '130',
            'Incline Chest Press': '130',
            'Transverse Plane Rows': '130',
            'Kelso Shrugs': '150',
            'Sagittal Plane Pulldowns': '117.5',
            'Tricep Extensions': '32.5',
            'Ab Crunches': '112.5',
            'Shoulder Press': '105',
            'Calf Raises': '220',
            'Hip Adduction': '70',
            'Back Extensions': '25',
            'Leg Press': '140',
        };
        for (const [name, weight] of Object.entries(EXPECTED_DEFAULTS)) {
            eq(defaults[name], weight,
                `"${name}" default weight comes from its own id-keyed history, not a neighbour's`);
        }

        // --- 4. Weight Breakdown survives for all 14 ------------------------
        const withButton = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.exercise-card'))
                .filter(c => Array.from(c.querySelectorAll('button'))
                    .some(b => b.textContent.includes('Weight Breakdown')))
                .map(c => c.querySelector('.exercise-name')?.textContent?.trim()));
        const missing = EXPECTED_ORDER.filter(n => !withButton.includes(n));
        eq(missing, [],
            `all 14 keep their Weight Breakdown button (missing: ${JSON.stringify(missing)})`);

        // --- 5. A different program is NOT touched --------------------------
        // Same shape, same category, but not Jessi's roster. The reconcile is
        // scoped by exercise names, so this must come back in seed order with
        // no orderRevision stamp.
        const otherRows = [
            ['o1', 'Leg Press'],
            ['o2', 'Chest Flies'],
            ['o3', 'Calf Raises'],
            ['o4', 'Face Pulls'],
        ];
        await loadWith(page, jessiConfig(otherRows), []);
        const other = await readStored(page);
        eq(other.names, ['Leg Press', 'Chest Flies', 'Calf Raises', 'Face Pulls'],
            'a non-Jessi Full Body program keeps its own order');
        ok(other.orderRevision === undefined,
            'a non-Jessi program is not stamped with orderRevision');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: code-side reorder reaches a signed-in device via orderRevision.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
