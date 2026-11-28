// What this test covers
// ----------------------
// An exercise at a PR increment of 0 has no rep range: its weight never goes
// up, so its reps are typed in (spec #27, ticket #29). Case 139 covers the "no
// bump" half; this covers the rest:
//   - Settings: the 0 option reads "0" with no hint, and while 0 is chosen the
//     form hides Min reps, Max reps and the Dutch switch. They come back, with
//     the values that were saved, when another step is picked; Cancel undoes a
//     switch to 0.
//   - The workout card shows a whole-number box (>= 1, numeric keypad) in place
//     of the Reps dropdown, pre-filled with last session's reps even when that
//     is outside the old range; other exercises keep the dropdown.
//   - History's edit session uses the same box for that exercise (and the
//     dropdown for the others), because both read one shared rule.
//   - Logging stamps the set as logged without a rep range, and that set can't
//     be a Failed set: 3 reps at the same weight beats 2, which the old 3-6
//     range would have called failed. The PR pill and the History badge agree.
//   - Sessions logged before the switch keep their verdicts: a 200 x 3 logged
//     under the old range stays un-badged in History although the exercise is
//     at 0 now.
//   - At 0 the card still carries last weight forward with no green tag.
//
// To verify this test is real: in plateauLogic.js drop the `noRange` line from
// isFailedSet and the new 3-rep set loses its PR; in config.js make
// usesTypedReps return false and the box turns back into a dropdown.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType, waitFor, setNow, tap } = require('../lib/browser');
const { ACTIVE, readDeckCard, goToCardById, revealCard, logCard, waitForDeckToSettle } = require('../lib/deck');
const { seedPersonalApp, seedExerciseConfig, workoutEntry } = require('../lib/state');
const { HISTORY_CARD, HISTORY_SESSION, HISTORY_EDIT, historyGoTo } = require('../lib/history');
const { eq, ok } = require('../lib/assert');

const ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const TARGET = 'pecs-transverse-shoulder-adduction';   // pin stack, Chest Flies on anterior-2
const CONTROL = 'pecs-shoulder-flexion';              // stays on the 2.5 seed

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

const ex = (id, name, weight, reps, extra = {}) => ({ id, name, weight, reps, ...extra });

// Newest first. The 14-day-old 200 x 3 was logged under the default 3-6 range
// (no stamp), so it was a failed set then and still is.
const history = [
    workoutEntry({ date: daysAgo(7), day: 'anterior-2', exercises: [
        ex(TARGET, 'Chest Flies', '200', '2', { noRange: true }),
        ex(CONTROL, 'Low to High Flies', '100', '5')] }),
    workoutEntry({ date: daysAgo(14), day: 'anterior-2', exercises: [
        ex(TARGET, 'Chest Flies', '200', '3')] }),
    workoutEntry({ date: daysAgo(21), day: 'anterior-2', exercises: [
        ex(TARGET, 'Chest Flies', '200', '2')] }),
];

const rowSel = (id) => `.exercise-row[data-exercise-id="${id}"]`;

async function openManageExercises(page) {
    await tap(page, '.settings-btn');
    await tap(page, '.modal-btn', { text: /Manage Exercises/ });
    await waitFor(page, 'the exercise rows', () => document.querySelectorAll('.exercise-row').length > 0);
}

async function clickPencil(page, id) {
    await tap(page, rowSel(id) + ' button', { text: 'Edit' });
    await waitFor(page, `the increment field on ${id}`, (id) => !!document.querySelector(
        `.exercise-row[data-exercise-id="${id}"] select[data-field="increment"]`), id);
}

async function clickRowButton(page, id, label) {
    await tap(page, rowSel(id) + ' button', { text: label });
    // Save and Cancel both close the form, so the increment field going away
    // is the sign the click landed.
    await waitFor(page, `the ${label} click on ${id} to close the form`, (id) => !document.querySelector(
        `.exercise-row[data-exercise-id="${id}"] select[data-field="increment"]`), id);
}

// Flip the Dutch cable stack switch. The checkbox is 0x0; a finger hits the
// track drawn right after it.
async function toggleCableStack(page, id) {
    const box = rowSel(id) + ' input[data-field="cableStack"]';
    const was = await page.$eval(box, (b) => b.checked);
    await tap(page, box + ' + .switch-track');
    await waitFor(page, `the cable stack switch on ${id} to turn ${was ? 'off' : 'on'}`,
        (sel, was) => document.querySelector(sel).checked !== was, box, was);
}

async function setSelect(page, id, field, value) {
    await page.evaluate((id, field, value) => {
        const s = document.querySelector(`.exercise-row[data-exercise-id="${id}"] select[data-field="${field}"]`);
        Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(s, value);
        s.dispatchEvent(new Event('change', { bubbles: true }));
    }, id, field, value);
    await waitFor(page, `${field} on ${id} to show ${value}`, (id, field, value) => {
        const s = document.querySelector(`.exercise-row[data-exercise-id="${id}"] select[data-field="${field}"]`);
        return !!s && s.value === value;
    }, id, field, value);
}

const readForm = (page, id) => page.evaluate((id) => {
    const row = document.querySelector(`.exercise-row[data-exercise-id="${id}"]`);
    const inc = row.querySelector('select[data-field="increment"]');
    const q = (f) => row.querySelector(`select[data-field="${f}"]`);
    const cable = row.querySelector('input[data-field="cableStack"]');
    return {
        increment: inc.value,
        labels: Array.from(inc.options).map(o => o.textContent.trim()),
        hint: !!row.querySelector('[data-field="increment-hint"]'),
        repMin: q('repMin') ? q('repMin').value : null,
        repMax: q('repMax') ? q('repMax').value : null,
        cable: cable ? cable.checked : null,
    };
}, id);

async function reload(page) {
    await page.reload({ waitUntil: 'networkidle0' });
    await waitForApp(page);
}

const readReps = (page, scope) => page.evaluate((scope) => {
    const el = document.querySelector(scope + ' [data-field="reps"]');
    return el ? {
        tag: el.tagName, type: el.type || null, mode: el.getAttribute('inputmode'),
        min: el.getAttribute('min'), step: el.getAttribute('step'), value: el.value,
    } : null;
}, scope);

// Real keystrokes: focus the box, clear it, type, then wait for the box to
// show what was typed (a controlled input shows what the app kept).
async function typeReps(page, scope, text) {
    await page.focus(scope + ' input[data-field="reps"]');
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    if (text) await page.keyboard.type(text);
    await waitFor(page, `the reps box to show "${text}"`, (scope, text) =>
        document.querySelector(scope + ' input[data-field="reps"]').value === text, scope, text);
}

const readStore = (page) => page.evaluate((ns) =>
    JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory')), NS);

(async () => {
    const server = await start({ root: ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await setNow(page, NOW);
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: history });
        await reload(page);
        const VERSION = await page.evaluate(() => EXERCISE_CONFIG_VERSION);

        // --- Settings -------------------------------------------------------
        await openManageExercises(page);
        await clickPencil(page, TARGET);
        let form = await readForm(page, TARGET);
        eq(form.labels, ['0', '1.25', '2.5', '4', '5', '10'], 'the 0 option reads just "0"');
        ok(form.repMin !== null && form.repMax !== null && form.cable !== null,
            'on a real step the rep range and Dutch switch are shown');

        // Save a distinctive rep range and Dutch switch at step 5 first.
        await setSelect(page, TARGET, 'increment', '5');
        await setSelect(page, TARGET, 'repMin', '6');
        await setSelect(page, TARGET, 'repMax', '9');
        await toggleCableStack(page, TARGET);
        await clickRowButton(page, TARGET, 'Save');

        await clickPencil(page, TARGET);
        await setSelect(page, TARGET, 'increment', '0');
        form = await readForm(page, TARGET);
        eq([form.repMin, form.repMax, form.cable, form.hint], [null, null, null, false],
            'at 0 Min reps, Max reps, the Dutch switch and the hint are all gone');
        await setSelect(page, TARGET, 'increment', '2.5');
        form = await readForm(page, TARGET);
        eq([form.repMin, form.repMax, form.cable], ['6', '9', true],
            'picking another step before saving brings them back with their values');

        await clickRowButton(page, TARGET, 'Cancel');

        // Edits made earlier in the same form session are not saved at 0.
        await clickPencil(page, TARGET);
        await setSelect(page, TARGET, 'repMin', '8');
        await toggleCableStack(page, TARGET);
        await setSelect(page, TARGET, 'increment', '0');
        await clickRowButton(page, TARGET, 'Save');
        const kept = (await page.evaluate((ns) => JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig')), NS))
            .exercises.find(e => e.id === TARGET);
        eq([kept.increment, kept.repMin, kept.repMax, kept.cableStack], [0, 6, 9, true],
            'Min, Max and Dutch edits made in the same form session are not saved at 0');
        await clickPencil(page, TARGET);
        await setSelect(page, TARGET, 'increment', '5');
        await clickRowButton(page, TARGET, 'Save');

        await clickPencil(page, TARGET);
        await setSelect(page, TARGET, 'increment', '0');
        await clickRowButton(page, TARGET, 'Cancel');
        await clickPencil(page, TARGET);
        eq((await readForm(page, TARGET)).increment, '5', 'Cancel undoes a switch to 0');
        await setSelect(page, TARGET, 'increment', '0');
        await clickRowButton(page, TARGET, 'Save');
        const saved = await page.evaluate((ns) => JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig')), NS);
        const t = saved.exercises.find(e => e.id === TARGET);
        eq([t.increment, t.repMin, t.repMax, t.cableStack], [0, 6, 9, true],
            'saving at 0 keeps the saved rep range and Dutch setting');
        eq(saved.version, VERSION, 'stamped with the current config version');
        await reload(page);
        await openManageExercises(page);
        await clickPencil(page, TARGET);
        await setSelect(page, TARGET, 'increment', '4');
        form = await readForm(page, TARGET);
        eq([form.repMin, form.repMax, form.cable], ['6', '9', true],
            'switching back from 0 later restores them');

        // --- The card -------------------------------------------------------
        await seedPersonalApp(page, { workoutHistory: history });
        await seedExerciseConfig(page, { overrides: { [TARGET]: { increment: 0 } }, version: VERSION });
        await reload(page);
        await selectDayType(page, 'anterior-2');
        const flies = await readDeckCard(page, 'Chest Flies');
        eq(flies.weightValue, '200', 'weight carries forward at 0');
        eq(flies.repsValue, '2', "the reps box is pre-filled with last session's reps (2, below any range)");
        eq(await readReps(page, ACTIVE),
            { tag: 'INPUT', type: 'number', mode: 'numeric', min: '1', step: '1', value: '2' },
            'a whole-number box with the numeric keypad replaces the dropdown');
        eq(await page.evaluate((sel) => !!document.querySelector(sel + ' .hero-tag.up'), ACTIVE), false,
            'no green bump tag');

        // Invalid input is shown as typed, never rewritten into another number.
        for (const bad of ['3.5', '-5', '1e2', '0']) {
            await typeReps(page, ACTIVE, bad);
            eq((await readReps(page, ACTIVE)).value, bad, `"${bad}" is not turned into a different number`);
        }

        // Other exercises keep the dropdown.
        await goToCardById(page, CONTROL);
        await revealCard(page);
        eq((await readReps(page, ACTIVE)).tag, 'SELECT', 'an exercise on a real step keeps the Reps dropdown');

        // --- Logging and the PR verdict ------------------------------------
        await goToCardById(page, TARGET);
        await revealCard(page);
        await typeReps(page, ACTIVE, '3');
        await logCard(page);
        const todayWorkout = (await readStore(page)).find(w =>
            localDate(w.date) === localDate(NOW) && w.exercises.some(e => e.id === TARGET));
        const logged = todayWorkout.exercises.find(e => e.id === TARGET);
        eq([logged.weight, logged.reps, logged.noRange, logged.repMin], ['200', '3', true, undefined],
            'the set is stamped as logged without a rep range');
        await goToCardById(page, TARGET);
        const pill = await page.evaluate((sel) => {
            const b = document.querySelector(sel + ' .streak-badge');
            return b ? window.pillView(b).visible : null;
        }, ACTIVE);
        ok(pill && /PR/.test(pill), '3 reps beating 2 at the same weight is a PR on the logged card: ' + pill);

        await tap(page, '.bottom-nav-btn', { text: /History/ });
        // One card per date: today's session, then each seeded session, newest first.
        const readFlies = () => page.evaluate((sel) => Array.from(document.querySelectorAll(sel + ' .history-exercise'))
            .filter(r => r.querySelector('.history-exercise-name').textContent.trim() === 'Chest Flies')
            .map(r => !!r.querySelector('[data-pr-badge]')), HISTORY_SESSION);
        const badges = [];
        for (const date of [NOW, ...history.map(w => w.date)]) {
            await historyGoTo(page, date);
            badges.push(...await readFlies());
        }
        eq(badges, [true, false, false, false],
            'History badges today (typed 3 over 2); older sessions keep their verdicts, the unstamped 200 x 3 stays failed');

        // --- History edit uses the same box --------------------------------
        // The Low to High Flies session is the one from 7 days ago.
        await historyGoTo(page, history[0].date);
        await waitForDeckToSettle(page);
        await tap(page, HISTORY_EDIT);
        await waitFor(page, 'the edit modal', () => !!document.querySelector('.modal [data-field="reps"]'));
        const editBoxes = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.modal [data-field="reps"]')).map(el => ({
                tag: el.tagName, type: el.type || null, mode: el.getAttribute('inputmode'), value: el.value })));
        eq(editBoxes[0], { tag: 'INPUT', type: 'number', mode: 'numeric', value: '2' },
            'History edit shows the number box for the 0-increment exercise');
        eq(editBoxes.some(b => b.tag === 'SELECT'), true, 'and the dropdown for the others');

        eq(errors, [], 'no console errors');
        console.log('PASS: typed reps at a PR increment of 0');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
