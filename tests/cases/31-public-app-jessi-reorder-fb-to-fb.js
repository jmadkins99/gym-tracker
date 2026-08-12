// What this test covers
// ----------------------
// The migration path that ACTUALLY runs on Jessi's phone for the July 2026
// reorder. His device is already Full Body with the previous flag set, so
// bumping to jessiFullBodyMigrationApplied5 re-enters migrateJessiToFullBody
// through the `isFB` branch — not the Torso/Limbs branch that tests 01/06/12
// exercise. Nothing covered that branch's ORDER before this test.
//
// Seeds his current 14-exercise roster using the real exercise ids from the
// 2026-06-09 backup (ids survive every migration via `{ ...ex }`), plus
// history keyed to those ids, then asserts:
//
//   1. The exercises come out in the canonical order.
//   2. History still resolves by id — each card's default weight is its OWN
//      last session, so the reorder didn't scramble anyone's data. This is
//      the assertion we can't get from the config-only backup fixture.
//   3. "Preacher Curls" renames to "Recline Curls" and classifies as a
//      PIN STACK (label "Warmup Set #1 (~70%):", no "lbs - ~70%" plate label,
//      no Top Set line since a plain pin stack never overflows).
//   4. Every exercise shows a Weight Breakdown button — the regression
//      from 90028e6, where renamed exercises silently lost theirs.
//   5. An exercise we don't rank (999 bucket) lands at the BOTTOM rather
//      than being deleted.
//   6. Re-running is idempotent: a second reload leaves order untouched.
//
// As of the Aug 2026 Upper/Lower split this is a TWO-STAGE path, and the
// assertions describe the end of it. migrateJessiToFullBody still runs first
// and still produces the canonical 14-slot Full Body list — that is the
// branch under test, and stage 3 (the rename) belongs to it — but
// migrateJessiToUpperLower fires on the same load and reshapes the result
// into Upper + Lower, restoring four movements and adding Preacher Curls.
// Full Body is therefore never the stored end state, so the expectations
// below are the split ones. Test 41 covers the split in isolation.
//
// To verify this is real: swap any two returns in getDesiredOrder (e.g. make
// /kelso|shrug/ return 5 and /sagittal/ return 4). Assertion 1 should fail
// with the two names transposed. Or delete the /recline/ line from
// getWeightBreakdownConfig — assertion 3/4 should fail with a missing button.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiDefaultSchedule, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const { PUBLIC_APP_ROOT } = require('../lib/paths');

// Real ids from fixtures/jessi-backup-2026-06-09-config.json. Back Extensions
// and Leg Press keep the ids of the movements they were renamed from on his
// device (Stiff Legged Deadlifts / Pendulum Squats), so their history follows.
const ID = {
    chestFlies: '8acc159e-fc2a-4d5a-9c61-e75908ca1928',
    reclineCurls: 'd989eb9d-921d-4135-8e72-57006d76e3e3', // was Preacher Curls
    inclinePress: '93de12cc-1835-4d83-bf75-b4335a4ff35a',
    transverseRows: 'db4fb026-d3f0-4653-b4e9-4968d52df293',
    kelsoShrugs: '6f1a174a-9892-4a7f-ba94-f9278df18fc3',
    sagittalPulldowns: '9df5161d-45c8-4435-8bef-0875a94dc41c',
    tricepExt: '676b6dcc-4d13-4cd3-8fb4-6987788ceabd', // was Tricep Pushdown
    frontalPulldowns: '121551d4-91ae-440f-9f22-266039ea5e20',
    abCrunches: '770cfe8d-e09c-40c7-b6c8-1676d9c64a02', // was Ab Crunch Machine
    shoulderPress: '1c627b58-1227-46bb-9daf-9fe78e6b95f5', // was Shoulder Press Machine
    calfRaises: '107ecf47-ae8c-4b68-90da-f2b930118983',
    hipAdduction: 'c65da494-c391-47b3-a742-e6ca5184d60d', // was Leg Extensions
    backExtensions: 'e6d80fad-07d0-464b-90bc-ab4d7e059b86', // was Stiff Legged Deadlifts
    legPress: 'f6dde47c-e085-485a-b446-a4d1cfd566f1', // was Pendulum Squats
};

// His roster as stored TODAY: already Full Body, already self-renamed to
// Back Extensions / Leg Press, but still holding the pre-reorder positions
// and the pre-rename "Preacher Curls" display name.
function jessiCurrentFullBodyConfig() {
    const rows = [
        [ID.reclineCurls, 'Preacher Curls'],
        [ID.tricepExt, 'Tricep Extensions'],
        [ID.chestFlies, 'Chest Flies'],
        [ID.inclinePress, 'Incline Chest Press'],
        [ID.sagittalPulldowns, 'Sagittal Plane Pulldowns'],
        [ID.frontalPulldowns, 'Frontal Plane Pulldowns'],
        [ID.transverseRows, 'Transverse Plane Rows'],
        [ID.kelsoShrugs, 'Kelso Shrugs'],
        [ID.abCrunches, 'Ab Crunches'],
        [ID.shoulderPress, 'Shoulder Press'],
        [ID.calfRaises, 'Calf Raises'],
        [ID.hipAdduction, 'Hip Adduction'],
        [ID.backExtensions, 'Back Extensions'],
        [ID.legPress, 'Leg Press'],
        // Not in getDesiredOrder — stands in for anything Jessi adds himself.
        ['jcustom', 'Face Pulls'],
    ];
    return {
        version: 2,
        categories: ['Full Body'],
        minimalistPrTracking: true,
        gympinMode: true,
        days: {
            1: rows.map(([id, name], order) => ({
                id, name, category: 'Full Body', order,
                type: 'standard', minReps: 6, maxReps: 8,
            })),
        },
    };
}

// Distinct weight per id so a scrambled lookup is unmistakable.
const HISTORY_WEIGHTS = {
    [ID.chestFlies]: 95,
    [ID.reclineCurls]: 67.5,
    [ID.inclinePress]: 250,
    [ID.transverseRows]: 115,
    [ID.kelsoShrugs]: 215,
    [ID.sagittalPulldowns]: 130,
    [ID.tricepExt]: 55,
    [ID.frontalPulldowns]: 85,
    [ID.abCrunches]: 105,
    [ID.shoulderPress]: 75,
    [ID.calfRaises]: 160,
    [ID.hipAdduction]: 140,
    [ID.backExtensions]: 45,
    [ID.legPress]: 320,
};

// The terminal state. migrateJessiToFullBody still produces the canonical
// 14-slot Full Body list first — that is the branch under test — but
// migrateJessiToUpperLower now runs on the same load and re-shapes it, so
// Full Body is never what ends up stored. Asserting the intermediate would be
// asserting a value no device can ever hold.
const EXPECTED_UPPER = [
    'Chest Flies',
    'Incline Chest Press',
    'Recline Curls',
    'Overhead Tricep Extensions',
    'Chest Press',
    'Lateral Raises',
    'Shoulder Press',
    'Frontal Plane Pulldowns',
    'Transverse Plane Rows',
    'Kelso Shrugs',
    'Sagittal Plane Pulldowns',
    'Tricep Extensions',
    'Preacher Curls',
];

const EXPECTED_LOWER = [
    'Back Extensions', // came up off the end of Lower to open the day, Aug 2026
    'Reverse Wrist Curls',
    'Cable Wrist Curls',
    'Ab Crunches',
    'Leg Extensions', // added by JESSI_NEW_EXERCISES
    'Hip Adduction', // moved ahead of Calf Raises, Aug 2026
    'Calf Raises',
    'Leg Press', // moved to the end of Lower, Aug 2026
    // Unranked -> bottom of Lower, NOT dropped. Still below Leg Press even
    // though Leg Press is now last among the RANKED movements: an unranked
    // client addition sorts after everything with a rank, which is the
    // distinction this row exists to pin.
    'Face Pulls',
];

async function readOrder(page) {
    return page.evaluate(() => {
        const cfg = JSON.parse(localStorage.getItem('gym-local:gymExerciseConfig'));
        return {
            upper: (cfg.days[1] || []).map(e => e.name),
            lower: (cfg.days[2] || []).map(e => e.name),
        };
    });
}

// Walk both day tabs and collect every card, so the assertions below are
// weekday-independent and see the whole program rather than today's half.
async function readAllCards(page) {
    return page.evaluate(async () => {
        const out = {};
        const btns = Array.from(document.querySelectorAll('.day-btn'));
        for (const btn of btns) {
            btn.click();
            await new Promise(r => setTimeout(r, 250));
            for (const c of document.querySelectorAll('.exercise-card')) {
                const name = c.querySelector('.exercise-name')?.textContent?.trim();
                if (!name) continue;
                const input = c.querySelector('input[type="number"]');
                out[name] = {
                    weight: input ? input.value : null,
                    hasBreakdown: Array.from(c.querySelectorAll('button'))
                        .some(b => b.textContent.includes('Weight Breakdown')),
                };
            }
        }
        return out;
    });
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
                date: '2026-07-20',
                day: 1,
                // reps 7 sits strictly inside the 6-8 goal range, so minimalist
                // PR tracking neither bumps the weight nor flags stagnation.
                // The default weight is then the raw last-session weight,
                // which is what makes the id-keyed lookup unambiguous.
                exercises: Object.entries(HISTORY_WEIGHTS).map(([id, weight]) => ({
                    id, name: 'x', weight: String(weight), reps: '7',
                })),
            }),
        ];

        await seedPublicApp(page, {
            exerciseConfig: jessiCurrentFullBodyConfig(),
            workoutHistory: history,
            schedule: jessiDefaultSchedule(),
        });
        // Simulate his real device: the PREVIOUS migration already ran.
        await page.evaluate(() => {
            localStorage.setItem('gym-local:jessiFullBodyMigrationApplied4', 'true');
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1500));

        // 1. The re-migration's canonical order, as reshaped by the split.
        const order = await readOrder(page);
        eq(order.upper, EXPECTED_UPPER, 'Upper day after the FB re-migration + split');
        eq(order.lower, EXPECTED_LOWER, 'Lower day after the FB re-migration + split');

        const state = await page.evaluate(() => {
            const cfg = JSON.parse(localStorage.getItem('gym-local:gymExerciseConfig'));
            return {
                flag5: localStorage.getItem('gym-local:jessiFullBodyMigrationApplied5'),
                lowerIds: (cfg.days[2] || []).map(e => e.id),
                count: Object.values(cfg.days).flat().length,
            };
        });
        eq(state.flag5, 'true', 'jessiFullBodyMigrationApplied5 set so the reorder does not re-run');
        // 15 seeded + Preacher Curls + Leg Extensions + Chest Press + the 4
        // the split restores.
        eq(state.count, 22, 'nothing seeded was dropped — 15 in, 22 out');

        // 5. Unranked exercise survives at the bottom of Lower.
        eq(state.lowerIds[state.lowerIds.length - 1], 'jcustom',
            'unranked "Face Pulls" lands at the bottom instead of being deleted');

        // 2. History still resolves by id: each card defaults to its OWN weight.
        const cards = await readAllCards(page);
        const defaults = Object.fromEntries(
            Object.entries(cards).map(([name, c]) => [name, c.weight]));
        const EXPECTED_DEFAULTS = {
            'Chest Flies': '95',
            'Recline Curls': '67.5',
            'Incline Chest Press': '250',
            'Transverse Plane Rows': '115',
            'Kelso Shrugs': '215',
            'Sagittal Plane Pulldowns': '130',
            'Tricep Extensions': '55',
            'Frontal Plane Pulldowns': '85',
            'Ab Crunches': '105',
            'Shoulder Press': '75',
            'Calf Raises': '160',
            'Hip Adduction': '140',
            'Back Extensions': '45',
            'Leg Press': '320',
        };
        for (const [name, weight] of Object.entries(EXPECTED_DEFAULTS)) {
            eq(defaults[name], weight,
                `"${name}" default weight comes from its own id-keyed history, not a neighbour's`);
        }

        // 4. Every exercise across BOTH days still offers a Weight Breakdown
        // button — including the four the split restored and Preacher Curls,
        // which have no history to classify from.
        const missing = [...EXPECTED_UPPER, ...EXPECTED_LOWER]
            .filter(n => n !== 'Face Pulls' && !cards[n]?.hasBreakdown);
        eq(missing, [],
            `every program exercise must show Weight Breakdown (missing: ${JSON.stringify(missing)})`);

        // 3. Recline Curls renders as a PIN STACK, not plate-loaded. It is on
        // Upper, so select that day before looking for the card.
        await page.evaluate(() => document.querySelectorAll('.day-btn')[0].click());
        await new Promise(r => setTimeout(r, 300));
        const recline = await page.evaluate(() => {
            for (const c of document.querySelectorAll('.exercise-card')) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Recline Curls') {
                    const btn = Array.from(c.querySelectorAll('button'))
                        .find(b => b.textContent.includes('Weight Breakdown'));
                    btn?.click();
                    return true;
                }
            }
            return false;
        });
        ok(recline, 'opened Recline Curls Weight Breakdown');
        await new Promise(r => setTimeout(r, 300));

        const reclineText = await page.evaluate(() => {
            for (const c of document.querySelectorAll('.exercise-card')) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Recline Curls') {
                    return c.textContent;
                }
            }
            return '';
        });
        // Pin stack at 67.5: 70% = 47.25 -> 47.5, 90% = 60.75 -> 61.25 (1.25 increments).
        contains(reclineText, 'Warmup Set #1 (~70%): 47.5 lbs',
            'Recline Curls W1 uses pin increments (47.25 -> 47.5), not nearest-10 plate math');
        contains(reclineText, 'Warmup Set #2 (~90%): 61.25 lbs',
            'Recline Curls W2 uses pin increments (60.75 -> 61.25)');
        ok(!/Per side:/.test(reclineText),
            'Recline Curls has no "Per side:" line — it is a pin stack, not plate-loaded');
        ok(!/Top Set/.test(reclineText),
            'plain pin stack shows no Top Set line (it never overflows a cap)');

        // 6. Idempotent: reload again, order unchanged.
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1200));
        eq(await readOrder(page), order,
            'order is stable across a second load — neither migration re-fires');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: FB re-migration feeds the split, keeps id-keyed history, drops nothing.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
