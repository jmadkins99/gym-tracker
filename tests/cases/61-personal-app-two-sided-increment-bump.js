// What this test covers
// ----------------------
// getWeightIncrement's two-sided adjustment, and that the adjusted number
// actually reaches the weight the app suggests after a PR.
//
// A two-sided machine splits its increment across both sides, so the total has
// to land on a real plate. 1.25 would be 0.625/side, which does not exist, so
// it is doubled to 2.5. 2.5 and 5 already halve legally (1.25 and 2.5 a side)
// and must be left alone — the bump is minimal, not a floor.
//
// Aug 2026: every increment was raised to 2.5 or above, so NO exercise on the
// roster triggers the branch any more. It is driven with a synthetic increment
// below instead of being deleted — see the note there.
//
// This is the strengthened heir of a loop that used to live in case 45, which
// swept PLATE_LOADED_EXERCISES asserting every two-sided entry's increment
// halved onto a 1.25 multiple. That loop could not survive loadType becoming a
// user setting: the set of two-sided exercises is no longer knowable from
// config source, since any of the 21 can be set two-sided at runtime. So the
// invariant moved here and got wider — it now runs every exercise through the
// real helper rather than the handful that happened to be two-sided in code.
//
// The third assertion below is the interesting one. It stops someone
// "simplifying" the helper to Math.max(inc, 2.5), which would satisfy the
// halves-onto-a-plate rule while silently coarsening every 1.25 exercise's
// progression even on a pin stack, and would hide a genuinely wrong raw value.
//
// To verify this test is real: delete the 'plate-two-sided' branch from
// getWeightIncrement in config.js. The unit half fails naming every 1.25
// exercise, and the end-to-end half reads 202.5 where it expects 202.5.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { readDeckCard } = require('../lib/deck');
const { seedPersonalApp, seedExerciseConfig, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

// A date far enough back to be "last session" but not today.
function daysAgo(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // --- Unit half: sweep all 21 through the real helper ---------------
        // config.js is loaded as type="text/babel", so its top-level consts land
        // in lexical global scope — bare identifiers here, never window.X.
        const table = await page.evaluate(() => DEFAULT_EXERCISES.map(ex => ({
            id: ex.id,
            raw: PR_WEIGHT_INCREMENTS[ex.id],
            pin: getWeightIncrement(ex.id, 'pin'),
            oneSided: getWeightIncrement(ex.id, 'plate-one-sided'),
            twoSided: getWeightIncrement(ex.id, 'plate-two-sided'),
        })));

        eq(table.length, 21, 'swept all 21 exercises');
        ok(table.every(r => typeof r.raw === 'number'),
            'every exercise has a raw PR increment to adjust');

        // 1. Only two-sided ever changes the number.
        const altered = table
            .filter(r => r.pin !== r.raw || r.oneSided !== r.raw)
            .map(r => `${r.id}: raw=${r.raw} pin=${r.pin} one=${r.oneSided}`);
        eq(altered, [], 'pin and one-sided pass the raw increment through untouched');

        // 2. Set two-sided, every exercise lands on a real per-side plate.
        const bad = table
            .filter(r => r.twoSided === undefined || (r.twoSided / 2) % 1.25 !== 0)
            .map(r => `${r.id}: ${r.raw} -> ${r.twoSided} (= ${r.twoSided / 2}/side)`);
        eq(bad, [],
            'every exercise, set two-sided, gets an increment that halves to a multiple of 1.25');

        // 3. The bump is minimal: only a 1.25 raw increment moves.
        const overBumped = table
            .filter(r => r.raw !== 1.25 && r.twoSided !== r.raw)
            .map(r => `${r.id}: ${r.raw} -> ${r.twoSided}`);
        eq(overBumped, [],
            'only a 1.25 raw increment is bumped; 2.5 and 5 are already legal two-sided steps');

        // Non-vacuity, and the reason this looks the way it does.
        //
        // Since Aug 2026 no exercise ships a 1.25 increment — they were all
        // raised to 2.5 — and the doubling branch ONLY fires for 1.25, because
        // 2.5 and 5 already halve onto real plates. So assertions 2 and 3 above
        // are now satisfied by a helper that does nothing at all, and there is
        // no roster entry left to prove otherwise with.
        //
        // The rule is still worth keeping and still worth testing: loadType is a
        // runtime user setting, so the next 1.25 exercise — a new movement, or
        // one of these dialled back — would suggest 0.625 a side, which is not a
        // plate. PR_WEIGHT_INCREMENTS is a plain object, so a synthetic id is
        // enough to drive the branch directly.
        const synthetic = await page.evaluate(() => {
            PR_WEIGHT_INCREMENTS['synthetic-fine-increment'] = 1.25;
            const out = {
                pin: getWeightIncrement('synthetic-fine-increment', 'pin'),
                oneSided: getWeightIncrement('synthetic-fine-increment', 'plate-one-sided'),
                twoSided: getWeightIncrement('synthetic-fine-increment', 'plate-two-sided'),
            };
            delete PR_WEIGHT_INCREMENTS['synthetic-fine-increment'];
            return out;
        });
        eq(synthetic.twoSided, 2.5,
            'a 1.25 increment on a two-sided machine is doubled to 2.5 — 0.625 a side is ' +
            'not a plate. No exercise ships 1.25 today, so this is the only thing keeping ' +
            'the branch honest');
        eq(synthetic.pin, 1.25, 'and a pin stack keeps the fine increment untouched');
        eq(synthetic.oneSided, 1.25, 'as does a one-sided machine, which needs no halving');

        // Every real exercise is already a legal two-sided step, so nothing on
        // the current roster moves.
        const bumped = table.filter(r => r.twoSided !== r.raw);
        eq(bumped, [],
            'no roster exercise is bumped any more, because none is finer than 2.5');

        // --- End-to-end half: the number reaches the weight input ----------
        // Chest Flies raw increment is 2.5. Last session: 200 x 6 reps, which
        // is what getSimplePR treats as a PR worth adding weight to. It is the
        // same number under both load types now — which is the point of the
        // control pass below rather than a reason to drop it.
        const history = [workoutEntry({
            date: daysAgo(7),
            day: 'anterior',
            exercises: [{ id: 'chest-flies', name: 'Chest Flies', weight: '200', reps: '6' }],
        })];

        // Control pass first: seeded as a pin stack, so no bump.
        await seedPersonalApp(page, { workoutHistory: history });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior');
        // One card at a time now: navigate to it and open it rather than
        // reading every card off the screen at once.
        let flies = await readDeckCard(page, 'Chest Flies');
        ok(flies, 'found the Chest Flies card on Anterior');
        eq(flies.weightValue, '202.5',
            'as a pin stack, a 6-rep PR suggests 200 + 1.25');

        // Now the same history with the exercise set two-sided. Read the
        // version out of the page rather than parsing config.js: the constant
        // is in scope there, and a saved config without the current version is
        // treated as stale and rebuilt, which would undo the override.
        const version = await page.evaluate(() => EXERCISE_CONFIG_VERSION);
        await seedExerciseConfig(page, {
            overrides: { 'chest-flies': { loadType: 'plate-two-sided' } },
            version,
            ns: NS,
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior');
        flies = await readDeckCard(page, 'Chest Flies');
        ok(flies, 'found the Chest Flies card after switching it two-sided');
        eq(flies.weightValue, '202.5',
            'set two-sided, the same 6-rep PR suggests 200 + 2.5 (= 1.25 a side)');

        eq(errors, [], 'no console errors');
        console.log('PASS: two-sided increments bump to a real plate, minimally');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
