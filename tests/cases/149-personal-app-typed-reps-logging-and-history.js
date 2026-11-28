// What this test covers
// ----------------------
// Logging and History for an exercise at a PR increment of 0, which has no rep
// range and takes typed reps (spec #27, ticket #29; case 148 covers Settings
// and the box itself). Every entry goes in with real keystrokes and every
// assertion reads what the screen shows or what was saved.
//   - A first session with no history: LOG is refused until both weight and
//     reps are in, then saves them stamped noRange.
//   - One-tap LOG of the pre-filled, untouched reps saves those reps.
//   - Invalid reps (3.5, -5, 1e2, 0, blank) are shown as typed but never
//     logged; a valid number then logs.
//   - A heavier set with fewer reps is a PR; two sets in a row that beat the
//     one before make a streak of 2 on the card and in History.
//   - History edit: filling a placeholder stamps it noRange; editing a set
//     that is already logged keeps its stamp (a range stamp stays a range
//     stamp); invalid or blank reps never overwrite a saved rep count.
//   - Switching an exercise from 0 to a ranged step drops the typed reps that
//     the dropdown does not offer, so LOG saves a value that is shown.
// (Custom-range verdicts and backup restore are case 150.)
//
// To verify this test is real: in App.jsx logExercise stop reading the typed
// box (the untouched-LOG step fails); in EditWorkoutModal.jsx drop the stamping
// in handleSave (the placeholder step fails).

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType, waitFor, openSettings, setNow, tap } = require('../lib/browser');
const { ACTIVE, goToCardById, revealCard, logCard } = require('../lib/deck');
const { seedPersonalApp, seedExerciseConfig, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const TARGET = 'pecs-transverse-shoulder-adduction';   // Chest Flies, anterior-2
const CONTROL = 'pecs-shoulder-flexion';              // Low to High Flies, anterior-2

// The page clock is pinned to a Phoenix evening, after midnight UTC, when a
// workout's ISO date is already the next day. Slicing that date and comparing
// it with the local date is what broke this case after 17:00 Phoenix (#48), so
// days are compared by local date and the case runs at that hour every time.
const NOW = '2026-11-25T20:00:00-07:00';
function daysAgo(n) {
    const d = new Date(NOW);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.toISOString();
}
const localDate = (iso) => new Date(iso).toDateString();

const flies = (daysBack, weight, reps, extra = {}) => workoutEntry({
    date: daysAgo(daysBack), day: 'anterior-2',
    exercises: [{ id: TARGET, name: 'Chest Flies', weight, reps, ...extra }] });

async function setup(page, VERSION, history, overrides = { increment: 0 }) {
    await seedPersonalApp(page, { workoutHistory: history });
    await seedExerciseConfig(page, { overrides: { [TARGET]: overrides }, version: VERSION });
    await page.reload({ waitUntil: 'networkidle0' });
    await waitForApp(page);
    await selectDayType(page, 'anterior-2');
    await goToCardById(page, TARGET);
    await revealCard(page);
}

// Focus, clear and type with the keyboard, then wait for the box to show it.
async function typeInto(page, selector, text) {
    await page.focus(selector);
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    if (text) await page.keyboard.type(text);
    await waitFor(page, `${selector} to show "${text}"`, (s, t) => document.querySelector(s).value === t, selector, text);
}
const REPS = ACTIVE + ' input[data-field="reps"]';
const WEIGHT = ACTIVE + ' input[inputmode="decimal"]';
const value = (page, selector) => page.evaluate((s) => document.querySelector(s).value, selector);

const readStore = (page) => page.evaluate((ns) =>
    JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory')) || [], NS);
async function todaysSet(page, id = TARGET) {
    const w = (await readStore(page)).find(w => localDate(w.date) === localDate(NOW));
    const e = w && w.exercises.find(e => e.id === id);
    return e && (e.weight || e.reps) ? e : null;
}

// LOG, and check whether the card ended up logged.
async function pressLog(page, { expectLogged }) {
    await logCard(page);
    if (expectLogged) await goToCardById(page, TARGET);
    eq(await page.evaluate((sel) => !!document.querySelector(sel + ' .logged-chip'), ACTIVE), expectLogged,
        expectLogged ? 'the card shows as logged' : 'the card is not logged');
}

// The callers wait for what they need from the destination view.
async function bottomTo(page, label) {
    await tap(page, '.bottom-nav-btn', { text: new RegExp(label) });
}

// The Chest Flies row's PR badge (its streak, 'PR' for a lone one, null for
// none) in every History week, newest first.
async function readHistory(page) {
    await bottomTo(page, 'History');
    await waitFor(page, 'the week navigation', () => !!document.querySelector('.week-nav'));
    const snapshot = () => page.evaluate(() => document.querySelector('.week-nav').parentElement.textContent);
    const readWeek = () => page.evaluate(() => Array.from(document.querySelectorAll('.history-item'))
        .flatMap(item => Array.from(item.querySelectorAll('.history-exercise'))
            .filter(r => r.querySelector('.history-exercise-name').textContent.trim() === 'Chest Flies')
            .map(r => {
                const b = r.querySelector('[data-pr-badge]');
                return b ? (b.getAttribute('data-streak') || 'PR') : null;
            })));
    const rows = await readWeek();
    for (;;) {
        const before = await snapshot();
        // The first week button is Prev.
        if (await page.$eval('.week-nav-btn', (b) => b.disabled)) break;
        await tap(page, '.week-nav-btn');
        await waitFor(page, 'the previous week to show', (prev) =>
            document.querySelector('.week-nav').parentElement.textContent !== prev, before);
        rows.push(...await readWeek());
    }
    return rows;
}

// Opens the edit modal on the newest History entry and tags Chest Flies' two boxes.
async function openEdit(page) {
    await bottomTo(page, 'History');
    await waitFor(page, 'History rows', () => document.querySelectorAll('.history-item').length > 0);
    // The first match is in the first, newest, entry.
    await tap(page, '.history-item button', { text: 'Edit' });
    await waitFor(page, 'the edit modal', () => !!document.querySelector('.modal [data-field="reps"]'));
    await page.evaluate(() => {
        const block = Array.from(document.querySelectorAll('.modal > div')).find(d =>
            d.firstElementChild && d.firstElementChild.textContent.trim() === 'Chest Flies');
        block.querySelector('input[type="number"]:not([data-field])').setAttribute('data-t', 'w');
        block.querySelector('[data-field="reps"]').setAttribute('data-t', 'r');
    });
}
async function saveEdit(page) {
    await tap(page, '.modal-btn.primary');
    await waitFor(page, 'the edit modal to close', () => !document.querySelector('.modal'));
}

async function changeIncrement(page, step) {
    await openSettings(page);
    await tap(page, '.modal-btn', { text: /Manage Exercises/ });
    await waitFor(page, 'the exercise rows', () => document.querySelectorAll('.exercise-row').length > 0);
    const row = `.exercise-row[data-exercise-id="${TARGET}"]`;
    await tap(page, row + ' button', { text: 'Edit' });
    await waitFor(page, 'the increment field', (row) => !!document.querySelector(row + ' select[data-field="increment"]'), row);
    await page.evaluate((row, step) => {
        const s = document.querySelector(row + ' select[data-field="increment"]');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, step);
        s.dispatchEvent(new Event('change', { bubbles: true }));
    }, row, step);
    await tap(page, row + ' button', { text: 'Save' });
    await waitFor(page, 'the form to close', (row) => !document.querySelector(row + ' select[data-field="increment"]'), row);
    await tap(page, '.modal button', { text: /Back to Settings/ });
    await waitFor(page, 'the Settings menu', () => Array.from(document.querySelectorAll('.modal .modal-btn'))
        .some(b => b.textContent.trim() === 'Close'));
    await tap(page, '.modal .modal-btn', { text: 'Close' });
    await waitFor(page, 'Settings to close', () => !document.querySelector('.modal'));
}

(async () => {
    const server = await start({ root: ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await setNow(page, NOW);
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        const VERSION = await page.evaluate(() => EXERCISE_CONFIG_VERSION);

        // --- First session ---------------------------------------------------
        await setup(page, VERSION, []);
        eq(await value(page, REPS), '', 'a first session starts with an empty reps box');
        await pressLog(page, { expectLogged: false });
        await typeInto(page, WEIGHT, '100');
        await pressLog(page, { expectLogged: false });
        eq(await todaysSet(page), null, 'LOG with no reps saves nothing');
        await typeInto(page, REPS, '5');
        await pressLog(page, { expectLogged: true });
        let set = await todaysSet(page);
        eq([set.weight, set.reps, set.noRange], ['100', '5', true], 'weight and typed reps saved, stamped noRange');

        // --- Untouched repeat -----------------------------------------------
        await setup(page, VERSION, [flies(7, '200', '8')]);
        eq([await value(page, WEIGHT), await value(page, REPS)], ['200', '8'], 'the card shows last session');
        await pressLog(page, { expectLogged: true });
        set = await todaysSet(page);
        eq([set.weight, set.reps, set.noRange], ['200', '8', true], 'one-tap LOG saves the pre-filled reps');

        // --- Invalid and blank ----------------------------------------------
        await setup(page, VERSION, [flies(7, '200', '8')]);
        for (const bad of ['3.5', '-5', '1e2', '0', '']) {
            await typeInto(page, REPS, bad);
            await pressLog(page, { expectLogged: false });
            eq(await value(page, REPS), bad, `"${bad}" is still shown as typed`);
            eq(await todaysSet(page), null, `"${bad}" is not logged`);
        }
        await typeInto(page, REPS, '4');
        await pressLog(page, { expectLogged: true });
        eq((await todaysSet(page)).reps, '4', 'a valid number then logs');

        // --- A leading zero is still a whole number --------------------------------
        await setup(page, VERSION, [flies(7, '200', '8')]);
        await typeInto(page, REPS, '05');
        await pressLog(page, { expectLogged: true });
        eq((await todaysSet(page)).reps, '5', '"05" logs as 5 reps');

        // --- A heavier, lower-rep set is a PR ---------------------------------
        await setup(page, VERSION, [flies(7, '200', '6', { noRange: true })]);
        await typeInto(page, WEIGHT, '210');
        await typeInto(page, REPS, '2');
        await pressLog(page, { expectLogged: true });
        ok(await page.evaluate((sel) => !!document.querySelector(sel + ' [data-logged-pr-badge]'), ACTIVE),
            '210 x 2 over 200 x 6 shows the PR badge on the card');

        // --- A two-PR streak --------------------------------------------------
        await setup(page, VERSION, [flies(7, '200', '3', { noRange: true }), flies(14, '200', '2', { noRange: true })]);
        await typeInto(page, REPS, '4');
        await pressLog(page, { expectLogged: true });
        eq(await page.evaluate((sel) => document.querySelector(sel + ' [data-logged-pr-badge]')
            .getAttribute('data-streak'), ACTIVE), '2', 'the card shows a streak of 2');
        eq(await readHistory(page), ['2', 'PR', null], 'History shows the same streak, then the first PR, then the baseline');

        // --- History edit: placeholder, stamp, invalid input ---------------------
        await setup(page, VERSION, [flies(7, '200', '2', { noRange: true }),
            workoutEntry({ date: daysAgo(14), day: 'anterior-2', exercises: [
                { id: TARGET, name: 'Chest Flies', weight: '190', reps: '5', repMin: 4, repMax: 6 }] })]);
        // Logging the other exercise creates today's workout with blank rows.
        await goToCardById(page, CONTROL);
        await revealCard(page);
        await typeInto(page, WEIGHT, '100');
        await page.evaluate((sel) => {
            const s = document.querySelector(sel + ' select[data-field="reps"]');
            Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, '5');
            s.dispatchEvent(new Event('change', { bubbles: true }));
        }, ACTIVE);
        await logCard(page);
        eq((await todaysSet(page, CONTROL)) !== null, true, 'the other exercise is logged');
        eq(await todaysSet(page), null, 'Chest Flies is still a blank row');
        await openEdit(page);
        await typeInto(page, '[data-t="w"]', '200');
        await typeInto(page, '[data-t="r"]', '3');
        await saveEdit(page);
        set = await todaysSet(page);
        eq([set.weight, set.reps, set.noRange, set.repMin], ['200', '3', true, undefined],
            'a placeholder filled in History is stamped noRange');
        eq((await readHistory(page))[0], '2', '200 x 3 is a PR in History, the second in a row after 190 x 5 and 200 x 2');

        for (const bad of ['3.5', '-5', '1e2', '0', '']) {
            await openEdit(page);
            await typeInto(page, '[data-t="r"]', bad);
            eq(await value(page, '[data-t="r"]'), bad, `History shows "${bad}" as typed`);
            await saveEdit(page);
            set = await todaysSet(page);
            eq([set.reps, set.noRange], ['3', true], `saving "${bad}" keeps the saved 3 and its stamp`);
        }
        await openEdit(page);
        await typeInto(page, '[data-t="w"]', '205');
        await saveEdit(page);
        set = await todaysSet(page);
        eq([set.weight, set.noRange], ['205', true], 'editing a logged noRange set keeps its stamp');

        // A legacy row has no `type` and renders as a standard exercise, so Save
        // treats it the same way.
        await setup(page, VERSION, []);
        const week = await page.evaluate(() => Number(document.body.innerText.match(/Week (\d+)/)[1]));
        const legacyRow = (row) => [{ ...workoutEntry({
            date: daysAgo(0), day: 'upper', submitted: false, exercises: [
                { id: TARGET, name: 'Chest Flies', type: undefined, ...row }] }), week }];
        await setup(page, VERSION, legacyRow({ weight: '200', reps: '8' }));
        await openEdit(page);
        await typeInto(page, '[data-t="r"]', '3.5');
        await saveEdit(page);
        eq((await todaysSet(page)).reps, '8', 'a legacy row keeps its saved reps when the box holds 3.5');
        await openEdit(page);
        await typeInto(page, '[data-t="r"]', '05');
        await saveEdit(page);
        eq((await todaysSet(page)).reps, '5', 'a legacy row saves "05" as 5');
        await setup(page, VERSION, legacyRow({ weight: '', reps: '' }));
        await openEdit(page);
        await typeInto(page, '[data-t="w"]', '200');
        await typeInto(page, '[data-t="r"]', '3');
        await saveEdit(page);
        set = await todaysSet(page);
        eq([set.reps, set.noRange, set.repMin], ['3', true, undefined],
            'a legacy placeholder filled in History is stamped noRange');

        // A set logged under a range keeps that stamp when edited at 0.
        // Seeded as today's unsubmitted workout, in the week the app is showing.
        await setup(page, VERSION, []);
        const thisWeek = await page.evaluate(() => Number(document.body.innerText.match(/Week (\d+)/)[1]));
        await setup(page, VERSION, [{ ...workoutEntry({
            date: daysAgo(0), day: 'anterior-2', submitted: false, exercises: [
                { id: TARGET, name: 'Chest Flies', weight: '200', reps: '5', repMin: 4, repMax: 6 }] }), week: thisWeek }]);
        await openEdit(page);
        await typeInto(page, '[data-t="w"]', '205');
        await saveEdit(page);
        set = await todaysSet(page);
        eq([set.weight, set.noRange, set.repMin, set.repMax], ['205', undefined, 4, 6],
            'editing a set logged under a range keeps the range stamp, not noRange');

        // --- Switching from 0 to a ranged step -----------------------------------
        await setup(page, VERSION, [flies(7, '200', '8')]);
        await typeInto(page, REPS, '15');
        await changeIncrement(page, '2.5');
        await goToCardById(page, TARGET);
        const dropdown = await page.evaluate((sel) => {
            const s = document.querySelector(sel + ' select[data-field="reps"]');
            return s ? { value: s.value, options: Array.from(s.options).map(o => o.value) } : null;
        }, ACTIVE);
        ok(dropdown, 'the ranged step brings the Reps dropdown back');
        ok(dropdown.options.includes(dropdown.value) && dropdown.value !== '15',
            'the dropdown shows an offered value, not the typed 15: ' + JSON.stringify(dropdown));
        eq(await page.evaluate((sel) => document.querySelector(sel + ' .hero-reps').textContent.trim(), ACTIVE),
            '× ' + dropdown.value, 'the big rep count shows the same value as the dropdown, not the stale 15');
        await pressLog(page, { expectLogged: true });
        set = await todaysSet(page);
        eq([set.reps, set.noRange, set.repMin !== undefined], [dropdown.value, undefined, true],
            'ranged LOG saves the shown, offered value with a range stamp');

        eq(errors, [], 'no console errors');
        console.log('PASS: typed reps logging and History at a PR increment of 0');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
