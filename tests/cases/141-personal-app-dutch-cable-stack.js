// What this test covers
// ----------------------
// The "Dutch gym cable stack PR adjustment" switch (Nov 2026): a per-exercise
// `cableStack` field for the work gym's 6, 10, 14 … 82 lb stack plus two 1.25
// lb microplates. On, getSimplePR rounds a bump UP to a weight that stack can
// make, capped at 84.5 (82 + both 1.25s).
//
// What is asserted, in order:
//   - the rule itself, through getSimplePR: 50→51.25, 51.25→52.5 and
//     52.5→54 on a 1.25 step (54 is Josh's real example), 52.5→55.25 on a 2.5
//     step, 83.75 capped to 84.5, and nothing at all from 84.5;
//   - off is the old behaviour (52.5→53.75), and on a plate-loaded exercise
//     the field is inert;
//   - the switch is in the pencil form on a Pin-loaded row only, with its
//     label and hint, and Save writes `cableStack: true` to that one exercise;
//   - the card then suggests 54 after 52.5 and its hero tag says the real
//     +1.5, not the +1.25 step;
//   - at 84.5 the card carries weight and reps forward like a 0 increment,
//     and six sessions there raise no "Plateau detected" banner, while a
//     control on a normal stack still gets it from the same history;
//   - the field survives migrateExerciseConfig on a version bump.
//
// To verify this test is real: in plateauLogic.js drop the
// resolveCableStack(...) block from getSimplePR. The card then reads 53.75
// where this expects 54, and 84.5 bumps to 86.25.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType, waitFor, tap } = require('../lib/browser');
const { ACTIVE, readDeckCard } = require('../lib/deck');
const { seedPersonalApp, seedExerciseConfig, workoutEntry } = require('../lib/state');
const { eq } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const TARGET = 'pecs-transverse-shoulder-adduction';   // Chest Flies, pin
const CONTROL = 'calves-ankle-extension';               // Calf Raises, pin, switch left off
const PLATE = 'quads-knee-extension-during-hip-flexion'; // Squats, set plate-loaded below

function daysAgo(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
}

const rowSel = (id) => `.exercise-row[data-exercise-id="${id}"]`;

async function openManageExercises(page) {
    await tap(page, '.settings-btn');
    await tap(page, '.modal-btn', { text: /Manage Exercises/ });
    await waitFor(page, 'the exercise rows',
        () => document.querySelectorAll('.exercise-row').length > 0);
}

// Edit swaps the row's Edit button for Save and Cancel, and either of those
// swaps it back, so the press has landed once the other button shows.
async function clickRowButton(page, id, label) {
    const next = label === 'Edit' ? 'Save' : 'Edit';
    await tap(page, rowSel(id) + ' button', { text: label });
    await waitFor(page, `${label} on ${id} to show its ${next} button`, (sel, next) =>
        Array.from(document.querySelectorAll(sel + ' button'))
            .some(b => b.textContent.trim() === next), rowSel(id), next);
}

const readForm = (page, id) => page.evaluate((sel) => {
    const row = document.querySelector(sel);
    const form = row.querySelector('[data-field="cable-stack-form"]');
    const box = row.querySelector('input[data-field="cableStack"]');
    const hint = row.querySelector('[data-field="cable-stack-hint"]');
    return {
        hasForm: !!form,
        label: form ? form.querySelector('label').textContent.trim() : null,
        on: box ? box.checked : null,
        hint: hint ? hint.textContent.trim() : null,
    };
}, rowSel(id));

const readConfig = (page) =>
    page.evaluate((ns) => JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig')), NS);

const heroTags = (page) => page.evaluate((sel) => {
    const up = document.querySelector(sel + ' .hero-tag.up');
    const flat = document.querySelector(sel + ' .hero-tag.flat');
    return { up: up ? up.textContent.trim() : null, flat: flat ? flat.textContent.trim() : null };
}, ACTIVE);

async function reload(page) {
    await page.reload({ waitUntil: 'networkidle0' });
    await waitForApp(page);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        await seedPersonalApp(page, {
            workoutHistory: [workoutEntry({
                date: daysAgo(7), day: 'full-body',
                exercises: [{ id: TARGET, name: 'Chest Flies', weight: '52.5', reps: '6' }],
            })],
        });
        await seedExerciseConfig(page, { overrides: {
            [TARGET]: { increment: 1.25 },
            [PLATE]: { loadType: 'plate-one-sided' },
        } });
        await reload(page);
        const VERSION = await page.evaluate(() => EXERCISE_CONFIG_VERSION);

        // --- The rule, through getSimplePR ----------------------------------
        // One max-reps session a week ago at `last`; 6 tops the default range.
        const suggest = (last, cfg) => page.evaluate((last, cfg, date) => {
            const hist = [{ date, day: 'full-body', submitted: true, exercises: [
                { type: 'standard', id: 'probe', name: 'Probe', weight: String(last), reps: '6' }] }];
            const ex = { id: 'probe', loadType: 'pin', ...cfg };
            const pr = getSimplePR(ex, hist, resolveLoadType(ex));
            return pr && { weight: pr.weight, increment: pr.increment };
        }, last, cfg, daysAgo(7));
        const on = (increment) => ({ increment, cableStack: true });

        eq(await suggest(50, on(1.25)), { weight: '51.25', increment: 1.25 }, '50 + 1.25 → 51.25 (one microplate)');
        eq(await suggest(51.25, on(1.25)), { weight: '52.5', increment: 1.25 }, '51.25 + 1.25 → 52.5 (both)');
        eq(await suggest(52.5, on(1.25)), { weight: '54', increment: 1.5 }, '52.5 + 1.25 → 54, the next stack plate');
        eq(await suggest(52.5, on(2.5)), { weight: '55.25', increment: 2.75 }, '52.5 + 2.5 → 55.25 (54 + one)');
        eq(await suggest(83.75, on(1.25)), { weight: '84.5', increment: 0.75 }, 'never above 84.5');
        eq(await suggest(84.5, on(2.5)), null, 'at 84.5 there is no bump to suggest');
        eq(await suggest(52.5, { increment: 1.25 }), { weight: '53.75', increment: 1.25 }, 'off: unchanged');
        eq(await suggest(52.5, { ...on(1.25), loadType: 'plate-one-sided' }), { weight: '53.75', increment: 1.25 },
            'inert on a plate-loaded exercise');

        // --- The switch in Settings -----------------------------------------
        await openManageExercises(page);
        eq((await readForm(page, TARGET)).hasForm, false, 'no switch outside edit mode');
        await clickRowButton(page, PLATE, 'Edit');
        eq((await readForm(page, PLATE)).hasForm, false, 'a plate-loaded row offers no switch');
        await clickRowButton(page, PLATE, 'Cancel');

        await clickRowButton(page, TARGET, 'Edit');
        const form = await readForm(page, TARGET);
        eq(form.label, 'Dutch gym cable stack PR adjustment', 'the switch is labelled');
        eq(form.on, false, 'and opens off');
        eq(form.hint, null, 'with no hint under it (removed at Josh\'s request)');
        // The checkbox is 0x0; a finger hits the track drawn right after it.
        const box = rowSel(TARGET) + ' input[data-field="cableStack"]';
        await tap(page, box + ' + .switch-track');
        await waitFor(page, 'the cable stack switch to turn on', (sel) => document.querySelector(sel).checked, box);
        await clickRowButton(page, TARGET, 'Save');

        let saved = await readConfig(page);
        eq(saved.version, VERSION, 'the write is stamped with the current version');
        eq(saved.exercises.filter(e => 'cableStack' in e).map(e => [e.id, e.cableStack]), [[TARGET, true]],
            'only Chest Flies gained the field, saved true');

        // --- The card -------------------------------------------------------
        await reload(page);
        await selectDayType(page, 'anterior-2');
        const flies = await readDeckCard(page, 'Chest Flies');
        eq(flies.weightValue, '54', 'after 52.5 x 6 the card suggests 54, not 53.75');
        eq((await heroTags(page)).up, '+1.5 lbs', 'and the hero tag says the real jump');

        // --- At the top: carry forward, no banner ---------------------------
        // Written straight to localStorage: seedPersonalApp would clear the
        // saved config and take the switch with it.
        await page.evaluate((ns, hist) => {
            localStorage.setItem(ns + 'gymWorkoutHistory', JSON.stringify(hist));
        }, NS, [7, 14, 21, 28, 35, 42].map(offset => workoutEntry({
            date: daysAgo(offset), day: 'full-body',
            exercises: [
                { id: TARGET, name: 'Chest Flies', weight: '84.5', reps: '6' },
                { id: CONTROL, name: 'Calf Raises', weight: '100', reps: '5' },
            ],
        })));
        await reload(page);
        await selectDayType(page, 'anterior-2');
        const top = await readDeckCard(page, 'Chest Flies');
        eq([top.weightValue, top.repsValue], ['84.5', '6'], 'at 84.5 weight and reps carry forward');
        eq(await heroTags(page), { up: null, flat: null }, 'with no bump tag and no plateau banner');
        await selectDayType(page, 'posterior-2');
        await readDeckCard(page, 'Calf Raises');
        eq((await heroTags(page)).flat, 'Plateau detected', 'while the control still gets the banner');

        // --- Survives a version bump ----------------------------------------
        await seedExerciseConfig(page, { version: VERSION - 1, overrides: { [TARGET]: { cableStack: true } } });
        await reload(page);
        await waitFor(page, 'the migration to stamp the current version',
            (ns, v) => JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig')).version === v, NS, VERSION);
        saved = await readConfig(page);
        eq(saved.exercises.find(e => e.id === TARGET).cableStack, true, 'cableStack survives migrateExerciseConfig');

        eq(errors, [], 'no console errors');
        console.log('PASS: the Dutch cable stack switch rounds PR bumps onto the stack, caps at 84.5, and persists');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
