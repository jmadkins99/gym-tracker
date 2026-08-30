// What this test covers
// ----------------------
// That the legacy Full Body one-shot cannot claw back Jessi's current
// Anterior/Posterior program.
//
// migrateJessiToFullBody identifies "Jessi-shaped" by categories alone:
//
//     const isAP = cats.length === 2 && cats.includes('anterior') && cats.includes('posterior');
//     ...
//     if (!isAP && !isTL && !isFB) return;
//
// That was written when Anterior/Posterior meant her EARLY-2026 PPL-derived
// program, the one that migration exists to collapse. Since Aug 2026 it is also
// what the CURRENT split produces, so the two are indistinguishable by
// category — and the only thing standing between them is
// `jessiFullBodyMigrationApplied5`, a one-shot flag.
//
// A flag is not a guarantee. It is absent on a fresh install, and it is absent
// after an import/reset — which is exactly the moment a client is most likely
// to be looking at their program. Without the splitRevision guard, that load
// collapses her two days into one and drops four movements: Lateral Raises,
// both wrist curls and Overhead Tricep Extensions. Silently, with no error.
//
// So this seeds the shape that actually bites: a correct, current
// Anterior/Posterior config with the one-shot flags cleared.
//
// To verify this test is real: delete the `if (config.splitRevision !== undefined)
// return;` guard from migrateJessiToFullBody. This case fails with the program
// collapsed to a single 10-movement Full Body day.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPublicApp, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { PUBLIC_APP_ROOT, publicAppSource } = require('../lib/paths');

const NS = 'gym-local:';

const ANTERIOR = [
    'Chest Press', 'Incline Chest Press', 'Chest Flies', 'Shoulder Press',
    'Lateral Raises', 'Overhead Tricep Extensions', 'Tricep Extensions',
    'Reverse Wrist Curls', 'Cable Wrist Curls', 'Ab Crunches',
    'Leg Extensions', 'Leg Press',
];

const POSTERIOR = [
    'Recline Curls', 'Frontal Plane Pulldowns', 'Sagittal Plane Pulldowns',
    'Transverse Plane Rows', 'Kelso Shrugs', 'Preacher Curls',
    'Back Extensions', 'Hip Adduction', 'Calf Raises',
];

// The movements migrateJessiToFullBody drops. If the guard fails, these are
// what the client loses.
const DROPPED_BY_FB = [
    'Lateral Raises', 'Reverse Wrist Curls', 'Cable Wrist Curls',
    'Overhead Tricep Extensions',
];

function currentSplitRevision() {
    const src = publicAppSource();
    const m = src.match(/const JESSI_SPLIT_REVISION\s*=\s*(\d+)/);
    if (!m) throw new Error('could not find JESSI_SPLIT_REVISION in the public app source');
    return Number(m[1]);
}

// A correct, current-revision split config — what a healthy device holds.
function currentSplitConfig(revision) {
    const mk = (name, i, category) => ({
        id: 'id-' + name.toLowerCase().replace(/\s+/g, '-'),
        name, category, typeId: 'standard', sets: 1, minReps: 6, maxReps: 8, order: i,
    });
    return {
        version: 2,
        categories: ['Anterior', 'Posterior'],
        minimalistPrTracking: true,
        gympinMode: true,
        repsDropdown: { min: 5, max: 8 },
        splitRevision: revision,
        days: {
            1: ANTERIOR.map((n, i) => mk(n, i, 'Anterior')),
            2: POSTERIOR.map((n, i) => mk(n, i, 'Posterior')),
        },
    };
}

(async () => {
    const revision = currentSplitRevision();
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // seedPublicApp clears every jessi* one-shot flag, which is precisely
        // the post-import / fresh-device state this case is about.
        await seedPublicApp(page, {
            exerciseConfig: currentSplitConfig(revision),
            workoutHistory: [],
            schedule: jessiDefaultSchedule(),
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        const saved = await page.evaluate((ns) => {
            const cfg = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig'));
            return {
                categories: cfg.categories,
                dayCount: Object.keys(cfg.days || {}).length,
                day1: (cfg.days[1] || []).map(e => e.name),
                day2: (cfg.days[2] || []).map(e => e.name),
                splitRevision: cfg.splitRevision,
            };
        }, NS);

        eq(saved.dayCount, 2, 'the program is still two days — not collapsed into Full Body');
        eq(saved.categories, ['Anterior', 'Posterior'], 'categories survive the load untouched');
        eq(saved.day1, ANTERIOR, 'Anterior is intact, in order');
        eq(saved.day2, POSTERIOR, 'Posterior is intact, in order');
        eq(saved.splitRevision, revision, 'the split revision stamp is preserved');

        // The specific loss the guard prevents, named so a failure reads as
        // "the client lost these four movements" rather than "an array differs".
        const all = [...saved.day1, ...saved.day2];
        const lost = DROPPED_BY_FB.filter(n => !all.includes(n));
        eq(lost, [], 'the Full Body migration did not strip any movement from the program');

        // And it stays that way — the flags are set on the first load, but the
        // guard, not the flag, is what has to be doing the work.
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        const second = await page.evaluate((ns) => {
            const cfg = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig'));
            return Object.keys(cfg.days || {}).length;
        }, NS);
        eq(second, 2, 'still two days after a second load');

        ok(errors.length === 0, `no console errors during load (${JSON.stringify(errors)})`);
        console.log('PASS: a current split config survives a device with no one-shot flags set.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
