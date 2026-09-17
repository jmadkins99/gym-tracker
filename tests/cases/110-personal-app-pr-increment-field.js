// What this test covers
// ----------------------
// The PR increment dropdown in Settings > Manage Exercises: that it only appears
// once the pencil is clicked, that it sits below the load-type dropdown, that it
// opens on the exercise's own increment, that Save writes a legal step to
// localStorage for that one exercise (stamped with the current config version)
// and it survives a reload, that it offers exactly the four plate steps, that
// Cancel discards, and that the saved number actually reaches the card's PR
// suggestion.
//
// The increment is the third USER-owned field on an exercise, after `name` and
// `loadType`. Absent means "use the seed in PR_WEIGHT_INCREMENTS", so an
// exercise nobody edits must not grow an `increment` key — that is asserted
// too, because a save path that copied every seed in would freeze them and
// quietly stop code-side seed changes from ever landing.
//
// The end-to-end half is the one that matters most. The field writing to
// localStorage proves nothing if getSimplePR is still reading the id map.
//
// Case 61 covers the two-sided doubling of a saved 1.25; this case stays on a
// pin stack so the number typed is the number suggested.
//
// To verify this test is real: in config.js make resolveIncrement return
// PR_WEIGHT_INCREMENTS[exercise.id] unconditionally. The reopen after a reload
// reads 2.5 where it expects 5, and the card reads 202.5 where it expects 205.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType, waitFor } = require('../lib/browser');
const { readDeckCard } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const TARGET = 'chest-flies';   // seeds 2.5, pin stack
const CONTROL = 'calf-raise';   // seeds 5 — the non-vacuity pair

function daysAgo(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
}

async function openManageExercises(page) {
    await page.click('.settings-btn');
    await waitFor(page, 'the Manage Exercises button',
        () => Array.from(document.querySelectorAll('.modal-btn'))
            .some(b => b.textContent.includes('Manage Exercises')));
    await page.evaluate(() => {
        Array.from(document.querySelectorAll('.modal-btn'))
            .find(b => b.textContent.includes('Manage Exercises')).click();
    });
    await waitFor(page, 'the exercise rows',
        () => document.querySelectorAll('.exercise-row').length > 0);
}

async function clickPencil(page, id) {
    await page.evaluate((id) => {
        const row = document.querySelector(`.exercise-row[data-exercise-id="${id}"]`);
        Array.from(row.querySelectorAll('button'))
            .find(b => b.textContent.includes('✏')).click();
    }, id);
    await waitFor(page, `the increment field on ${id}`,
        (id) => !!document.querySelector(
            `.exercise-row[data-exercise-id="${id}"] select[data-field="increment"]`), id);
}

async function clickRowButton(page, id, label) {
    await page.evaluate((id, label) => {
        const row = document.querySelector(`.exercise-row[data-exercise-id="${id}"]`);
        Array.from(row.querySelectorAll('button'))
            .find(b => b.textContent.trim() === label).click();
    }, id, label);
    await new Promise(r => setTimeout(r, 100));
}

// Native setter + change event: React ignores a plain `.value =` assignment.
async function chooseIncrement(page, id, value) {
    await page.evaluate((id, value) => {
        const select = document.querySelector(
            `.exercise-row[data-exercise-id="${id}"] select[data-field="increment"]`);
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, 'value').set;
        setter.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }, id, value);
    await new Promise(r => setTimeout(r, 50));
}

const readRow = (page, id) => page.evaluate((id) => {
    const row = document.querySelector(`.exercise-row[data-exercise-id="${id}"]`);
    const field = row.querySelector('select[data-field="increment"]');
    const loadType = row.querySelector('select[data-field="loadType"]');
    const below = field && loadType
        ? !!(loadType.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING)
        : null;
    return {
        value: field ? field.value : null,
        options: field ? Array.from(field.options).map(o => o.value) : null,
        below,
    };
}, id);

const countIncrementFields = (page) =>
    page.evaluate(() => document.querySelectorAll('[data-field="increment"]').length);

const readRawConfig = (page) =>
    page.evaluate((ns) => localStorage.getItem(ns + 'gymExerciseConfig'), NS);

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Last session hit the top of the range, so the card suggests a bump.
        const history = [workoutEntry({
            date: daysAgo(7),
            day: 'anterior',
            exercises: [{ id: TARGET, name: 'Chest Flies', weight: '200', reps: '6' }],
        })];
        await seedPersonalApp(page, { workoutHistory: history });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        const VERSION = await page.evaluate(() => EXERCISE_CONFIG_VERSION);

        // Control: before any edit the card uses the 2.5 seed.
        await selectDayType(page, 'anterior');
        let flies = await readDeckCard(page, 'Chest Flies');
        eq(flies.weightValue, '202.5',
            'before editing, the card suggests the 2.5 seed: 200 + 2.5');
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // --- Edit mode only -----------------------------------------------
        await openManageExercises(page);
        eq(await countIncrementFields(page), 0, 'no increment field is shown before the pencil');

        await clickPencil(page, CONTROL);
        let row = await readRow(page, CONTROL);
        eq(row.value, '5', 'Calf Raises opens on its own seed, 5');
        eq(row.below, true, 'the increment dropdown sits below the load-type dropdown');
        // Exactly the four plate steps, and no blank: every exercise has a seed,
        // so the "—" placeholder must not render.
        eq(row.options, ['1.25', '2.5', '5', '10'], 'the dropdown offers exactly the four plate steps');
        eq(await countIncrementFields(page), 1, 'only the row being edited shows the field');

        // --- Cancel discards ----------------------------------------------
        await chooseIncrement(page, CONTROL, '10');
        await clickRowButton(page, CONTROL, 'Cancel');
        eq(await countIncrementFields(page), 0, 'Cancel closes the field');
        await clickPencil(page, CONTROL);
        eq((await readRow(page, CONTROL)).value, '5', 'after Cancel it reopens on the old 5');
        await clickRowButton(page, CONTROL, 'Cancel');

        await clickPencil(page, TARGET);
        eq((await readRow(page, TARGET)).value, '2.5', 'Chest Flies opens on its own seed, 2.5');

        // --- A step saves ----------------------------------------------------
        await chooseIncrement(page, TARGET, '5');
        await clickRowButton(page, TARGET, 'Save');
        eq(await countIncrementFields(page), 0, 'a legal Save closes the row');

        const saved = JSON.parse(await readRawConfig(page));
        const byId = Object.fromEntries(saved.exercises.map(e => [e.id, e]));
        eq(byId[TARGET].increment, 5, 'the 5 reached localStorage as a number');
        eq(saved.version, VERSION, 'stamped with the current EXERCISE_CONFIG_VERSION');
        eq(byId[TARGET].name, 'Chest Flies', 'the name is untouched');
        const stray = saved.exercises
            .filter(e => e.id !== TARGET && e.increment !== undefined)
            .map(e => `${e.id}: ${e.increment}`);
        eq(stray, [], 'no other exercise gained an increment — seeds stay unsaved');

        // --- It survives a reload, and reaches the card ----------------------
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await openManageExercises(page);
        await clickPencil(page, TARGET);
        eq((await readRow(page, TARGET)).value, '5', 'after a reload the field reads 5');

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior');
        flies = await readDeckCard(page, 'Chest Flies');
        eq(flies.weightValue, '205', 'the card now suggests 200 + 5');
        const tag = await page.evaluate(() => {
            const t = document.querySelector('.deck-slot:not([aria-hidden="true"]) .hero-tag.up');
            return t ? t.textContent.trim() : null;
        });
        eq(tag, '+5 lbs', 'and the hero tag reads +5 lbs');

        eq(errors, [], 'no console errors');
        console.log('PASS: the PR increment field edits, validates, persists and reaches the card');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
