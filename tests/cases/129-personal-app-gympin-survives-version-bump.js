// What this test covers
// ----------------------
// Since v25 (Oct 2026) PIN_STACK_CAPS is empty, so "the seed" below is no
// ceiling at all: half 2 now asserts that a config without the fields picks
// up nothing and that Back Extensions renders uncapped.
//
// That the Gympin pair — `gympin` and `stackMax` — survives migrateExerciseConfig
// the way `loadType` (case 59) and `increment` do: the rebuild in
// js/migrations.js keeps only the fields named there, and an unnamed field works
// perfectly right up until the next unrelated version bump, when every answer
// silently reverts to the seed. Case 128 stays green under that mutation; it
// never bumps the version.
//
// Three halves, because there are three states a device can be in:
//
//   1. Saved answers on a config stamped with an OLD version. The bump forces
//      the rebuild; both fields must come through it — including a saved
//      `false`, which is the only way a seeded machine is switched off, and
//      which a `??`-style "truthy wins" preservation would drop.
//   2. A config from before the fields existed, with no key at all. That is
//      every device on the day this lands: the migration must NOT write the
//      seed in (absent means "use the seed", and copying it would freeze it),
//      and the card must still render the seed's overflow.
//   3. A restored backup, which importData saves with no version and so
//      always rebuilds — the same path, entered from the file input, with the
//      fields riding along in the exported config.
//
// To verify this test is real: drop the two Gympin lines from the result.push
// in migrateExerciseConfig. Half 1 fails: Chest Flies loses its 150 and Back
// Extensions turns back on.

const path = require('path');
const fs = require('fs');
const os = require('os');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType, waitFor } = require('../lib/browser');
const { setWeightAndOpen } = require('../lib/deck');
const { seedPersonalApp, seedExerciseConfig } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

function currentConfigVersion(src) {
    const m = src.match(/const EXERCISE_CONFIG_VERSION\s*=\s*(\d+)/);
    if (!m) throw new Error('could not find EXERCISE_CONFIG_VERSION in config.js');
    return Number(m[1]);
}

async function readSaved(page) {
    return page.evaluate((ns) => {
        const raw = localStorage.getItem(ns + 'gymExerciseConfig');
        if (!raw) return null;
        const cfg = JSON.parse(raw);
        return {
            version: cfg.version,
            exercises: cfg.exercises,
            byId: Object.fromEntries((cfg.exercises || []).map(e => [e.id, {
                hasGympin: 'gympin' in e, gympin: e.gympin,
                hasStackMax: 'stackMax' in e, stackMax: e.stackMax,
            }])),
        };
    }, NS);
}

(async () => {
    const configSrc = fs.readFileSync(path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const VERSION = currentConfigVersion(configSrc);

    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // === Half 1: saved answers on a stale-versioned config =============
        await seedPersonalApp(page, { workoutHistory: [] });
        await seedExerciseConfig(page, {
            version: VERSION - 1,
            overrides: {
                'pecs-transverse-shoulder-adduction': { gympin: true, stackMax: 150 },
                'erectors-spinal-extension': { gympin: false },
            },
            ns: NS,
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        let saved = await readSaved(page);
        eq(saved.version, VERSION, 'the migration ran and stamped the current version');
        eq(saved.byId['pecs-transverse-shoulder-adduction'], { hasGympin: true, gympin: true, hasStackMax: true, stackMax: 150 },
            'Chest Flies came through the bump on at 150');
        eq(saved.byId['erectors-spinal-extension'].gympin, false,
            'a saved false came through too — off is an answer, not an absence');
        eq(saved.byId['erectors-spinal-extension'].hasStackMax, false,
            'and a field that was never saved is still absent, not filled from the seed');
        const seededIn = Object.entries(saved.byId)
            .filter(([id, e]) => !['pecs-transverse-shoulder-adduction', 'erectors-spinal-extension'].includes(id) && (e.hasGympin || e.hasStackMax))
            .map(([id]) => id);
        eq(seededIn, [], 'no untouched exercise had the seed written into its config');

        await selectDayType(page, 'full-body');
        contains(await setWeightAndOpen(page, 'Chest Flies', 165), 'pin 150',
            'the card reads the surviving 150');
        const backOff = await setWeightAndOpen(page, 'Back Extensions', 270);
        ok(backOff.indexOf('pin 260') === -1, 'and the surviving false: no pin 260');
        ok(backOff.indexOf('TOP SET') === -1, 'no Top set row at all');

        // === Half 2: a config from before the fields existed ================
        await seedPersonalApp(page, { workoutHistory: [] });
        await seedExerciseConfig(page, { version: VERSION - 1, ns: NS });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        saved = await readSaved(page);
        eq(saved.version, VERSION, 'the migration ran');
        const written = Object.entries(saved.byId)
            .filter(([, e]) => e.hasGympin || e.hasStackMax).map(([id]) => id);
        eq(written, [], 'a pre-Gympin config picks up no fields at all from the rebuild');

        await selectDayType(page, 'full-body');
        const backSeed = await setWeightAndOpen(page, 'Back Extensions', 270);
        ok(backSeed.indexOf('TOP SET') === -1,
            'Back Extensions has no ceiling: nothing is seeded since v25');
        ok((await setWeightAndOpen(page, 'Chest Flies', 165)).indexOf('TOP SET') === -1,
            'and Chest Flies, unseeded, still has no ceiling');

        // === Half 3: a restored backup carries the answers =================
        // Export what half 1 saved, then import it onto a wiped device. The
        // import path saves without a version, so the rebuild runs on the next
        // load; the fields have to be in the file and come through that too.
        await seedPersonalApp(page, { workoutHistory: [] });
        await seedExerciseConfig(page, {
            version: VERSION,
            overrides: { 'pecs-transverse-shoulder-adduction': { gympin: true, stackMax: 150 }, 'erectors-spinal-extension': { gympin: false } },
            ns: NS,
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        const exported = await page.evaluate((ns) => JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig')), NS);
        const backupPath = path.join(os.tmpdir(), `gympin-backup-${process.pid}.json`);
        fs.writeFileSync(backupPath, JSON.stringify({
            workoutHistory: [],
            exerciseConfig: { exercises: exported.exercises },
            exportDate: new Date().toISOString(),
        }));

        await seedPersonalApp(page, { workoutHistory: [] });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await page.click('.settings-btn');
        await new Promise(r => setTimeout(r, 200));
        page.once('dialog', d => d.accept());
        const input = await page.$('input[type="file"]');
        ok(input, 'the import file input is on the Settings modal');
        await input.uploadFile(backupPath);
        await waitFor(page, 'the imported config to carry Chest Flies at 150',
            (ns) => {
                const raw = localStorage.getItem(ns + 'gymExerciseConfig');
                if (!raw) return false;
                const e = JSON.parse(raw).exercises.find(x => x.id === 'pecs-transverse-shoulder-adduction');
                return !!e && e.stackMax === 150;
            }, NS);
        fs.unlinkSync(backupPath);

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        saved = await readSaved(page);
        eq(saved.version, VERSION, 'the post-import reload rebuilt and stamped the config');
        eq(saved.byId['pecs-transverse-shoulder-adduction'].stackMax, 150, 'Chest Flies’ 150 survived the restore');
        eq(saved.byId['erectors-spinal-extension'].gympin, false, 'and Back Extensions’ off did too');
        await selectDayType(page, 'full-body');
        contains(await setWeightAndOpen(page, 'Chest Flies', 165), 'pin 150', 'the card agrees');

        eq(errors, [], 'no console errors');
        console.log('PASS: the Gympin pair survives a version bump, an unversioned import, and a seed-only config');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
