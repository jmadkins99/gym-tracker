// What this test covers
// ----------------------
// The Aug 2026 Anterior/Posterior split reaching Jessi now that she is SIGNED IN.
//
// Every program change before 2026-07-26 worked by bumping a sentinel
// (jessiFullBodyMigrationApplied<N>) so migrateJessiToFullBody would re-run.
// That whole block lives inside `if (repo.mode === 'local')`, so on a signed-in
// device — where repoReady resolves to a Firestore repo on the first load — it
// never executes and the sentinel lever is disconnected.
//
// migrateJessiSplit is applied to the config AFTER loadAll in BOTH
// modes, gated on `splitRevision`. The suite has no Firestore emulator, so this
// exercises the seam in local mode with the sentinel already spent, which
// reproduces exactly what a cloud device sees: nothing but this function can
// change his program.
//
// Asserted here:
//   1. The single Full Body day becomes Anterior (12) + Posterior (9), in order,
//      despite the sentinel being spent.
//   2. Every surviving movement keeps its ORIGINAL id. A split must never hand
//      a card its neighbour's weight — this is the "don't break Jessi"
//      assertion, and it is checked against his real Firestore ids.
//   3. The four movements dropped in June RECLAIM their original ids out of
//      workoutHistory. Every lookup in this app is by id, so a fresh id would
//      silently orphan years of weights and render a blank card.
//   4. Preacher Curls is genuinely new: stable id, no history, and its weight
//      input pre-fills to the seeded startingWeight of 50.
//   5. The schedule becomes the explicit 7-day weekday map, totalWorkoutDays 2.
//   6. splitRevision is stamped and a second load is a no-op.
//   7. A program that is NOT Jessi's is left completely alone.
//   8. A config already split, on a STALE revision, is re-sorted to the current
//      order — the lever for every future reorder of his program. Client-added
//      movements survive and a customised schedule is left alone.
//
// Day contents are read out of the saved config rather than off-screen, so the
// test is weekday-independent; the on-screen checks drive the day selector
// explicitly for the same reason.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, waitForApp, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const { PUBLIC_APP_ROOT } = require('../lib/paths');
const NS = 'gym-local:';

// Read from the app so a future revision bump doesn't rot this assertion —
// what matters is that the stamp matches whatever the migration currently
// claims, not that it holds any particular number.
function currentSplitRevision() {
    const src = fs.readFileSync(path.join(PUBLIC_APP_ROOT, 'index.html'), 'utf8');
    const m = src.match(/const JESSI_SPLIT_REVISION\s*=\s*(\d+)/);
    if (!m) throw new Error('could not find JESSI_SPLIT_REVISION in index.html');
    return Number(m[1]);
}

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

// Ids of the four movements the June migration dropped. These live ONLY in his
// workoutHistory now — the split has to dig them back out.
const DROPPED_ID = {
    dips: 'aa11bb22-cc33-dd44-ee55-ff6677889900',
    lateralRaises: 'bb22cc33-dd44-ee55-ff66-778899001122',
    reverseWrist: 'cc33dd44-ee55-ff66-7788-990011223344',
    cableWrist: 'dd44ee55-ff66-7788-9900-112233445566',
};

// His config exactly as it sits in Firestore today: one Full Body day of 14.
const CURRENT_ROWS = [
    [ID.chestFlies, 'Chest Flies'],
    [ID.reclineCurls, 'Recline Curls'],
    [ID.frontalPulldowns, 'Frontal Plane Pulldowns'],
    [ID.inclinePress, 'Incline Chest Press'],
    [ID.transverseRows, 'Transverse Plane Rows'],
    [ID.kelsoShrugs, 'Kelso Shrugs'],
    [ID.sagittalPulldowns, 'Sagittal Plane Pulldowns'],
    [ID.tricepExt, 'Tricep Extensions'],
    [ID.abCrunches, 'Ab Crunches'],
    [ID.shoulderPress, 'Shoulder Press'],
    [ID.calfRaises, 'Calf Raises'],
    [ID.hipAdduction, 'Hip Adduction'],
    [ID.backExtensions, 'Back Extensions'],
    [ID.legPress, 'Leg Press'],
];

const EXPECTED_ANTERIOR = [
    // Added Aug 2026. Shares the plain `chest-press` literal with the personal
    // app — no id collision in either, so no `actual-` prefix.
    ['Chest Press', 'chest-press'],
    ['Incline Chest Press', ID.inclinePress],
    ['Chest Flies', ID.chestFlies],
    ['Shoulder Press', ID.shoulderPress],
    ['Lateral Raises', DROPPED_ID.lateralRaises],
    ['Overhead Tricep Extensions', DROPPED_ID.dips],
    // Abs and quads moved up ahead of Tricep Extensions and the wrist pair,
    // Aug 2026.
    ['Ab Crunches', ID.abCrunches],
    ['Leg Extensions', 'actual-leg-extensions'],
    ['Tricep Extensions', ID.tricepExt],
    // Wrist flexors here, extensors on Posterior. Both keep the ids they
    // reclaimed from history when the Aug 2026 split restored them — changing
    // day must not mint a fresh id any more than reordering may.
    ['Reverse Wrist Curls', DROPPED_ID.reverseWrist],
    ['Cable Wrist Curls', DROPPED_ID.cableWrist],
    // Quad-dominant, so it closes the anterior day. It keeps its recovered id
    // across the move from Lower — the second place that rule is checked.
    ['Leg Press', ID.legPress],
];

const EXPECTED_POSTERIOR = [
    // Biceps group with the pulling work rather than with the other arms.
    ['Recline Curls', ID.reclineCurls],
    ['Frontal Plane Pulldowns', ID.frontalPulldowns],
    ['Sagittal Plane Pulldowns', ID.sagittalPulldowns],
    ['Transverse Plane Rows', ID.transverseRows],
    ['Kelso Shrugs', ID.kelsoShrugs],
    ['Preacher Curls', 'actual-preacher-curls'],
    // Keeps its recovered id across the move from Lower.
    ['Back Extensions', ID.backExtensions],
    // Adductor magnus is a hip extensor, hence the posterior chain.
    ['Hip Adduction', ID.hipAdduction],
    ['Calf Raises', ID.calfRaises],
];

function jessiFullBodyConfig() {
    return {
        version: 2,
        categories: ['Full Body'],
        minimalistPrTracking: true,
        gympinMode: true,
        repsDropdown: { min: 5, max: 8 },
        // Left behind by the retired JESSI_ORDER_REVISION lever, which is what
        // his live config still carries. Seeded deliberately: the split must
        // ignore it rather than mistake it for a splitRevision stamp.
        orderRevision: 1,
        days: {
            1: CURRENT_ROWS.map(([id, name], order) => ({
                id, name, category: 'Full Body', order,
                typeId: 'standard', sets: 1, minReps: 6, maxReps: 8,
            })),
        },
    };
}

// History holding the four dropped movements under the display names they had
// before June, each with the id the split must recover.
function historyWithDroppedMovements() {
    const row = (id, name, weight) => ({
        id, name, category: 'Limbs', type: 'standard',
        weight, reps: '6', minReps: 6, maxReps: 8,
    });
    return [
        {
            date: '2026-06-05T18:00:00.000Z', day: 2, week: 1,
            submitted: true, plateauBusters: [],
            exercises: [
                row(DROPPED_ID.dips, 'Weighted Dips', '75'),
                row(DROPPED_ID.lateralRaises, 'Cable Lateral Raises', '30'),
                row(DROPPED_ID.reverseWrist, 'Reverse Wrist Curls', '40'),
                row(DROPPED_ID.cableWrist, 'Cable Wrist Curls', '85'),
            ],
        },
    ];
}

async function loadWith(page, server, config, history) {
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
    await waitForApp(page);
}

async function readSaved(page) {
    return page.evaluate((ns) => {
        const cfg = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig'));
        const sched = JSON.parse(localStorage.getItem(ns + 'gymScheduleConfig') || 'null');
        const pick = (d) => (cfg.days[d] || []).map(e => [e.name, e.id]);
        return {
            categories: cfg.categories,
            dayCount: Object.keys(cfg.days).length,
            splitRevision: cfg.splitRevision,
            anterior: pick(1),
            posterior: pick(2),
            gympinMode: cfg.gympinMode,
            repsDropdown: cfg.repsDropdown,
            minimalist: cfg.minimalistPrTracking,
            startingWeights: Object.fromEntries(
                Object.values(cfg.days).flat()
                    .filter(e => e.startingWeight !== undefined)
                    .map(e => [e.name, e.startingWeight])),
            schedule: sched && {
                days: sched.workoutDays.map(d => [d.dayOfWeek, d.workoutDayNumber]),
                total: sched.totalWorkoutDays,
                explicit: sched.scheduleIsExplicit,
            },
        };
    }, NS);
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        await loadWith(page, server, jessiFullBodyConfig(), historyWithDroppedMovements());
        const saved = await readSaved(page);

        // 1 + 2 + 3 + 4. The split, with every id accounted for.
        eq(saved.dayCount, 2, 'the single Full Body day became two days');
        eq(saved.categories, ['Anterior', 'Posterior'], 'categories are Anterior and Posterior');
        eq(saved.anterior, EXPECTED_ANTERIOR,
            'Anterior holds 12 movements in order, each with the correct id');
        eq(saved.posterior, EXPECTED_POSTERIOR,
            'Posterior holds 9 movements in order, each with the correct id');

        // Called out separately so a failure names the actual problem.
        for (const [name, id] of [
            ['Overhead Tricep Extensions', DROPPED_ID.dips],
            ['Lateral Raises', DROPPED_ID.lateralRaises],
            ['Reverse Wrist Curls', DROPPED_ID.reverseWrist],
            ['Cable Wrist Curls', DROPPED_ID.cableWrist],
        ]) {
            const found = [...saved.anterior, ...saved.posterior].find(([n]) => n === name);
            eq(found && found[1], id,
                `"${name}" reclaimed its original id from workout history`);
        }

        // Only JESSI_NEW_EXERCISES gets one. A restored movement must NOT —
        // it inherits real logged weight via its reclaimed id, and a
        // startingWeight would paper over a failed id recovery with a plausible
        // number instead of an obviously blank field.
        // Compared as sorted pairs rather than as an object: `eq` is a
        // JSON.stringify deep-compare, so a plain object literal also pins the
        // insertion order, which here is just "Anterior first, then Posterior".
        // That made this assertion fail on the Anterior/Posterior switch purely
        // because Preacher Curls and Leg Extensions swapped days — a false
        // positive about nothing. Which day each is on is already asserted by
        // EXPECTED_ANTERIOR / EXPECTED_POSTERIOR above.
        eq(Object.entries(saved.startingWeights).sort(),
            [['Chest Press', '100'], ['Leg Extensions', '50'], ['Preacher Curls', '50']],
            'only the genuinely-new movements carry a startingWeight');

        // 5. Schedule.
        eq(saved.schedule.days, [
            ['Monday', 2], ['Tuesday', 1], ['Wednesday', 2], ['Thursday', 1],
            ['Friday', 2], ['Saturday', 1], ['Sunday', 1],
        ], 'weekday map is Posterior on Mon/Wed/Fri, Anterior on Tue/Thu/Sat and Sunday');
        eq(saved.schedule.total, 2, 'totalWorkoutDays is 2');
        eq(saved.schedule.explicit, true, 'schedule is explicit so the app opens on today\'s day');

        // Top-level flags must survive untouched.
        eq(saved.gympinMode, true, 'gympinMode survives the split');
        eq(saved.repsDropdown, { min: 5, max: 8 }, 'repsDropdown survives the split');
        eq(saved.minimalist, true, 'minimalistPrTracking survives the split');

        // 6. Stamped, and idempotent.
        eq(saved.splitRevision, currentSplitRevision(),
            'splitRevision is stamped with the current JESSI_SPLIT_REVISION');
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        eq(await readSaved(page), saved, 'a second load changes nothing');

        // On-screen: drive the day selector explicitly so this is weekday-independent.
        const onScreen = await page.evaluate(async () => {
            const out = {};
            const btns = Array.from(document.querySelectorAll('.day-btn'));
            for (let i = 0; i < btns.length; i++) {
                btns[i].click();
                await new Promise(r => setTimeout(r, 250));
                out[i + 1] = Array.from(document.querySelectorAll('.exercise-name'))
                    .map(e => e.textContent.trim());
            }
            return out;
        });
        eq(onScreen[1], EXPECTED_ANTERIOR.map(([n]) => n), 'day 1 renders Anterior on screen');
        eq(onScreen[2], EXPECTED_POSTERIOR.map(([n]) => n), 'day 2 renders Posterior on screen');

        // 4 (cont). The new movement's weight input is seeded with 50.
        const preacherWeight = await page.evaluate(() => {
            const card = Array.from(document.querySelectorAll('.exercise-card'))
                .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === 'Preacher Curls');
            if (!card) return null;
            const input = card.querySelector('input[type="number"]');
            return input ? input.value : null;
        });
        // Day 2 (Posterior) is selected after the loop; hop back to Anterior.
        if (preacherWeight === null) {
            await page.evaluate(() => document.querySelectorAll('.day-btn')[0].click());
            await new Promise(r => setTimeout(r, 300));
        }
        const preacherWeight2 = await page.evaluate(() => {
            const card = Array.from(document.querySelectorAll('.exercise-card'))
                .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === 'Preacher Curls');
            const input = card && card.querySelector('input[type="number"]');
            return input ? input.value : null;
        });
        eq(preacherWeight2, '50',
            'Preacher Curls pre-fills to its startingWeight with no history');

        // Every movement keeps a Weight Breakdown button (the 90028e6 / 5cad8f8
        // regression, twice burned).
        const missingBreakdown = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.exercise-card'))
                .filter(c => !Array.from(c.querySelectorAll('button'))
                    .some(b => b.textContent.includes('Weight Breakdown')))
                .map(c => c.querySelector('.exercise-name')?.textContent?.trim()));
        eq(missingBreakdown, [], 'every Anterior movement keeps its Weight Breakdown button');

        // 7. A program that is not Jessi's must be untouched.
        const otherConfig = {
            version: 2,
            categories: ['Full Body'],
            days: {
                1: [
                    { id: 'x1', name: 'Bench Press', category: 'Full Body', order: 0, typeId: 'standard', sets: 3, minReps: 8, maxReps: 12 },
                    { id: 'x2', name: 'Squat', category: 'Full Body', order: 1, typeId: 'standard', sets: 3, minReps: 8, maxReps: 12 },
                    { id: 'x3', name: 'Deadlift', category: 'Full Body', order: 2, typeId: 'standard', sets: 3, minReps: 8, maxReps: 12 },
                ],
            },
        };
        await loadWith(page, server, otherConfig, []);
        const other = await readSaved(page);
        eq(other.dayCount, 1, 'a non-Jessi program is not split');
        eq(other.anterior.map(([n]) => n), ['Bench Press', 'Squat', 'Deadlift'],
            'a non-Jessi program keeps its exercises and order');
        eq(other.splitRevision, undefined, 'a non-Jessi program is not stamped');

        // 8. The RE-RUN branch: a config this migration already produced, on a
        // stale revision. This is the lever for every future reorder of his
        // program, and it is the branch the single-day guard used to swallow —
        // a bumped JESSI_SPLIT_REVISION hit `dayKeys.length !== 1` and did
        // nothing at all. Seeded at splitRevision 0 with both days scrambled,
        // Preacher Curls removed, and a movement the client added themselves.
        const staleSplitConfig = {
            version: 2,
            categories: ['Upper', 'Lower'],
            gympinMode: true,
            splitRevision: 0,
            days: {
                1: [
                    ['Shoulder Press', ID.shoulderPress],
                    ['Chest Flies', ID.chestFlies],
                    ['Kelso Shrugs', ID.kelsoShrugs],
                    ['Recline Curls', ID.reclineCurls],
                    ['Overhead Tricep Extensions', DROPPED_ID.dips],
                    ['Lateral Raises', DROPPED_ID.lateralRaises],
                    ['Frontal Plane Pulldowns', ID.frontalPulldowns],
                    ['Incline Chest Press', ID.inclinePress],
                    ['Transverse Plane Rows', ID.transverseRows],
                    ['Sagittal Plane Pulldowns', ID.sagittalPulldowns],
                    ['Tricep Extensions', ID.tricepExt],
                ].map(([name, id], order) => ({
                    id, name, category: 'Upper', order,
                    typeId: 'standard', sets: 1, minReps: 6, maxReps: 8,
                })),
                2: [
                    ['Leg Press', ID.legPress],
                    ['Ab Crunches', ID.abCrunches],
                    ['Reverse Wrist Curls', DROPPED_ID.reverseWrist],
                    ['Cable Wrist Curls', DROPPED_ID.cableWrist],
                    ['Calf Raises', ID.calfRaises],
                    ['Hip Adduction', ID.hipAdduction],
                    ['Back Extensions', ID.backExtensions],
                    ['Farmer Carries', 'client-added-1'],
                ].map(([name, id], order) => ({
                    id, name, category: 'Lower', order,
                    typeId: 'standard', sets: 1, minReps: 6, maxReps: 8,
                })),
            },
        };
        const customSchedule = {
            version: 2,
            workoutDays: [
                { dayOfWeek: 'Monday', workoutDayNumber: 1 },
                { dayOfWeek: 'Thursday', workoutDayNumber: 2 },
            ],
            totalWorkoutDays: 2,
        };
        await seedPublicApp(page, {
            exerciseConfig: staleSplitConfig,
            workoutHistory: [],
            schedule: customSchedule,
        });
        await page.evaluate(() => {
            localStorage.setItem('gym-local:jessiFullBodyMigrationApplied5', 'true');
            localStorage.setItem('gym-local:lastBackupReminder', String(Date.now()));
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        const rerun = await readSaved(page);
        eq(rerun.anterior, EXPECTED_ANTERIOR,
            'a stale-revision split config is re-sorted to the current Anterior order');
        eq(rerun.posterior.slice(0, EXPECTED_POSTERIOR.length), EXPECTED_POSTERIOR,
            'a stale-revision split config is re-sorted to the current Posterior order');
        eq(rerun.posterior[EXPECTED_POSTERIOR.length], ['Farmer Carries', 'client-added-1'],
            'a movement the client added themselves is kept, at the bottom of Posterior');
        // All of JESSI_NEW_EXERCISES are absent from the seed above, so this
        // is the assertion that a revision bump actually delivers a newly added
        // movement to a device that already took an earlier revision.
        eq(Object.entries(rerun.startingWeights).sort(),
            [['Chest Press', '100'], ['Leg Extensions', '50'], ['Preacher Curls', '50']],
            'movements missing from a stale config are re-added with their startingWeight');
        eq(rerun.splitRevision, currentSplitRevision(),
            're-run stamps the current splitRevision');
        eq(rerun.gympinMode, true, 're-run leaves top-level flags alone');

        // The schedule is a calendar, not part of the program. A revision bump
        // is a program edit, so a day the client had moved must stay moved.
        eq(rerun.schedule.days, [['Monday', 1], ['Thursday', 2]],
            're-run does NOT overwrite a schedule the client has customised');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: the Anterior/Posterior split reaches a signed-in device, ids intact.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
