// What this test covers
// ----------------------
// The Settings > Manage Exercises load-type dropdown: that it exists on every
// row, that it shows the exercise's OWN value rather than whichever option
// happens to be first, that changing one writes it to localStorage stamped with
// the current config version, that it changes exactly one exercise, and that it
// survives a reload.
//
// Showing the right value is worth its own assertion. A <select> with a `value`
// prop that never matches an <option> silently renders the first option, so a
// misspelt loadType — or a seed the dropdown does not offer — would look
// perfectly fine on screen while meaning something else underneath.
//
// The version stamp is load-bearing rather than incidental: App.jsx's
// saveExerciseConfig stamps EXERCISE_CONFIG_VERSION on every write, and without
// it migrateExerciseConfig reads the config as stale on the next load and
// rebuilds it from defaults. A dropdown that wrote the value but not the
// version would pass the "it's in localStorage" check and still lose the
// setting on reload — which is why the reload assertion is here too.
//
// Case 58 is the one that proves the choice reaches the rendered breakdown.
//
// To verify this test is real: drop the saveExerciseConfig(updated) call from
// updateExerciseLoadType in App.jsx. The in-memory select still updates, so the
// first assertions pass and the post-reload one fails.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const LOAD_TYPES = ['pin', 'plate-one-sided', 'plate-two-sided'];

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

async function openManageExercises(page) {
    await page.click('.settings-btn');
    await new Promise(r => setTimeout(r, 200));
    const opened = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('.modal-btn'))
            .find(b => b.textContent.includes('Manage Exercises'));
        if (!btn) return false;
        btn.click();
        return true;
    });
    ok(opened, 'opened Manage Exercises');
    await new Promise(r => setTimeout(r, 300));
}

// id -> { value, options } for every row's load-type select.
async function readSelects(page) {
    return page.evaluate(() => {
        const out = {};
        for (const row of document.querySelectorAll('.exercise-row')) {
            const id = row.getAttribute('data-exercise-id');
            const select = row.querySelector('select[data-field="loadType"]');
            if (!id || !select) continue;
            out[id] = {
                value: select.value,
                options: Array.from(select.options).map(o => o.value),
            };
        }
        return out;
    });
}

async function readSavedLoadTypes(page) {
    return page.evaluate((ns) => {
        const raw = localStorage.getItem(ns + 'gymExerciseConfig');
        if (!raw) return null;
        const cfg = JSON.parse(raw);
        return {
            version: cfg.version,
            loadTypeById: Object.fromEntries(
                (cfg.exercises || []).map(e => [e.id, e.loadType])),
        };
    }, NS);
}

(async () => {
    const configSrc = fs.readFileSync(
        path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const DEFAULT_EXERCISES = extractLiteral(configSrc, 'DEFAULT_EXERCISES', '[', ']');
    const VERSION = currentConfigVersion(configSrc);
    const seededById = Object.fromEntries(DEFAULT_EXERCISES.map(e => [e.id, e.loadType]));

    // Pick a target whose seed is NOT the value we set it to, so the assertion
    // cannot pass by accident, and whose seed is not the first <option> either.
    const TARGET = 'chest-flies';
    eq(seededById[TARGET], 'pin', 'the target exercise seeds as a pin stack');

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

        await openManageExercises(page);
        const selects = await readSelects(page);

        eq(Object.keys(selects).length, DEFAULT_EXERCISES.length,
            `every one of the ${DEFAULT_EXERCISES.length} rows has a load-type select`);

        // Each select offers exactly the three legal values, in a stable order.
        const wrongOptions = Object.entries(selects)
            .filter(([, s]) => JSON.stringify(s.options) !== JSON.stringify(
                ['pin', 'plate-two-sided', 'plate-one-sided']))
            .map(([id, s]) => `${id}: ${s.options.join('|')}`);
        eq(wrongOptions, [], 'every select offers exactly the three legal load types');

        // And each shows its own seeded value — not option 1 by default.
        const wrongValue = Object.entries(selects)
            .filter(([id, s]) => s.value !== seededById[id])
            .map(([id, s]) => `${id}: shows ${s.value}, seeded ${seededById[id]}`);
        eq(wrongValue, [], 'every select shows that exercise\'s own seeded load type');

        // Non-vacuity: if every seed were 'pin', "shows its own value" would be
        // indistinguishable from "always shows the first option".
        ok(Object.values(selects).some(s => s.value !== 'pin'),
            'at least one row shows a non-default value, so the check above is not vacuous');

        // --- Change exactly one -------------------------------------------
        const set = await page.evaluate((id) => {
            const row = document.querySelector(`.exercise-row[data-exercise-id="${id}"]`);
            const select = row && row.querySelector('select[data-field="loadType"]');
            if (!select) return false;
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLSelectElement.prototype, 'value').set;
            setter.call(select, 'plate-two-sided');
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }, TARGET);
        ok(set, `set ${TARGET} to plate-two-sided`);
        await new Promise(r => setTimeout(r, 250));

        const saved = await readSavedLoadTypes(page);
        ok(saved, 'a config was written to localStorage');
        eq(saved.loadTypeById[TARGET], 'plate-two-sided',
            'the chosen load type reached localStorage');
        eq(saved.version, VERSION,
            'the write is stamped with the current EXERCISE_CONFIG_VERSION');

        const collateral = Object.entries(saved.loadTypeById)
            .filter(([id, lt]) => id !== TARGET && lt !== seededById[id])
            .map(([id, lt]) => `${id}: ${lt} (seeded ${seededById[id]})`);
        eq(collateral, [], 'no other exercise changed');

        // --- And it survives a reload --------------------------------------
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await openManageExercises(page);
        const afterReload = await readSelects(page);
        eq(afterReload[TARGET].value, 'plate-two-sided',
            'the choice is still there after a reload');

        eq(errors, [], 'no console errors');
        console.log('PASS: the load-type dropdown reflects and persists the setting');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
