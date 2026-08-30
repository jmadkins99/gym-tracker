// What this test covers
// ----------------------
// That a user's chosen loadType survives migrateExerciseConfig — specifically
// the preservation line in js/migrations.js, which rebuilds every entry from
// DEFAULT_EXERCISES and keeps only the fields named there.
//
// This is the sole pin on that line. Before loadType, `name` was the only
// user-owned field, and the comment above the rebuild said so outright:
// "everything else (category, type, order) comes from defaults". A loadType
// that is not named there works perfectly — the dropdown writes it, the
// breakdown reads it, cases 57 and 58 pass — right up until the next unrelated
// version bump months later, at which point every choice silently reverts.
// Cases 40, 43 and 54 all stay green under that mutation, because none of them
// has a loadType to lose.
//
// Two halves, because there are two ways to arrive at the rebuild:
//
//   1. An override on a config stamped with an OLD version. The bump forces the
//      rebuild; the override must come through it.
//   2. A config from before the field existed, with no loadType key at all.
//      That is what every pre-v15 device and every old backup looks like, and
//      it must pick up the code seed rather than landing undefined. This is the
//      half that fails if the preservation is written without the `??` fallback.
//
// To verify this test is real: revert migrations.js to
// `result.push({ ...defaultEx, name: saved.name })`. The first half fails with
// 'pin' where 'plate-two-sided' was expected.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { setWeightAndOpen } = require('../lib/deck');
const { seedPersonalApp, seedExerciseConfig } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

function extractLiteral(source, name, open, close) {
    const start = source.indexOf(`const ${name} =`);
    if (start === -1) throw new Error(`could not find ${name} in config.js`);
    const openIdx = source.indexOf(open, start);
    const closeIdx = source.indexOf(close + ';', openIdx);
    return new Function(`return ${source.slice(openIdx, closeIdx + 1)}`)();
}

function currentConfigVersion(src) {
    const m = src.match(/const EXERCISE_CONFIG_VERSION\s*=\s*(\d+)/);
    if (!m) throw new Error('could not find EXERCISE_CONFIG_VERSION in config.js');
    return Number(m[1]);
}

async function readSavedConfig(page) {
    return page.evaluate((ns) => {
        const raw = localStorage.getItem(ns + 'gymExerciseConfig');
        if (!raw) return null;
        const cfg = JSON.parse(raw);
        return {
            version: cfg.version,
            loadTypeById: Object.fromEntries(
                (cfg.exercises || []).map(e => [e.id, e.loadType])),
            nameById: Object.fromEntries(
                (cfg.exercises || []).map(e => [e.id, e.name])),
        };
    }, NS);
}

(async () => {
    const configSrc = fs.readFileSync(
        path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const DEFAULT_EXERCISES = extractLiteral(configSrc, 'DEFAULT_EXERCISES', '[', ']');
    const VERSION = currentConfigVersion(configSrc);
    const seededById = Object.fromEntries(DEFAULT_EXERCISES.map(e => [e.id, e.loadType]));

    ok(VERSION > 14, `the config version is past 14 (got ${VERSION})`);
    eq(seededById['chest-flies'], 'pin',
        'chest-flies seeds as a pin stack, so a two-sided override is distinguishable');

    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // === Half 1: an override on a stale-versioned config ================
        await seedPersonalApp(page, { workoutHistory: [] });
        await seedExerciseConfig(page, {
            version: VERSION - 1,
            overrides: {
                'chest-flies': { loadType: 'plate-two-sided', name: 'My Renamed Flies' },
                'calf-raise': { loadType: 'plate-one-sided' },
            },
            ns: NS,
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        let saved = await readSavedConfig(page);
        ok(saved, 'a config is in localStorage after the migration');
        eq(saved.version, VERSION,
            'the migration ran and stamped the current version');
        eq(saved.loadTypeById['chest-flies'], 'plate-two-sided',
            'the chosen load type survived the version bump');
        eq(saved.loadTypeById['calf-raise'], 'plate-one-sided',
            'a second override survived too — this is not a one-id special case');
        eq(saved.nameById['chest-flies'], 'My Renamed Flies',
            'the rename still survives as well (the pre-existing half of that line)');

        // Untouched exercises keep their seeds rather than being blanked.
        const drifted = Object.entries(saved.loadTypeById)
            .filter(([id, lt]) => !['chest-flies', 'calf-raise'].includes(id)
                && lt !== seededById[id])
            .map(([id, lt]) => `${id}: ${lt} (seeded ${seededById[id]})`);
        eq(drifted, [], 'every other exercise kept its seeded load type');

        // And it is not just storage — the breakdown really renders two-sided.
        await selectDayType(page, 'anterior');
        // The card has to be navigated to and opened before it has a weight
        // input or a breakdown at all.
        // The rename is a user-owned field that survives the version bump, so
        // the card is found by its NEW name — which is half of what this case
        // is proving.
        const text = await setWeightAndOpen(page, 'My Renamed Flies', 200);
        ok(text.length > 0, 'found the renamed card on Anterior and opened it');
        await new Promise(r => setTimeout(r, 300));
        contains(text, '70/side',
            'the preserved setting reaches the render, not just localStorage — a ' +
            'per-side figure only appears for a two-sided machine');

        // === Half 2: a config from before the field existed =================
        // Every pre-v15 device and every old backup looks like this.
        await seedPersonalApp(page, { workoutHistory: [] });
        await seedExerciseConfig(page, {
            version: VERSION - 1,
            dropFields: ['loadType'],
            ns: NS,
        });

        const beforeReload = await readSavedConfig(page);
        ok(Object.values(beforeReload.loadTypeById).every(lt => lt === undefined),
            'the seeded config genuinely has no loadType on any entry');

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        saved = await readSavedConfig(page);
        const missing = Object.entries(saved.loadTypeById)
            .filter(([id, lt]) => lt !== seededById[id])
            .map(([id, lt]) => `${id}: ${lt} (expected seed ${seededById[id]})`);
        eq(missing, [],
            'a config with no loadType picks up the code seed for every exercise');

        eq(errors, [], 'no console errors');
        console.log('PASS: load type survives the migration, and absent means seed');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
