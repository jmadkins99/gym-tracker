// What this test covers
// ----------------------
// The Gympin setting in Settings > Manage Exercises (Sep 2026): a switch and a
// "Stack tops out at" number in the pencil form, offered ONLY on a pin-loaded
// exercise, saved by Save and undone by Cancel, and read by the card's Weight
// Breakdown. It replaced PIN_STACK_CAPS as the authority — the table is now the
// seed the form starts from, so the four capped machines show up already on.
//
// What is asserted, in order:
//   - the list view says at a glance which stacks the Gympin takes over
//     ("Gympin past 260 lbs" on Back Extensions) and nothing on the others;
//   - the form on a seeded machine opens ON with the seed filled in;
//   - a plate-loaded machine (Leg Press) gets no form at all;
//   - turning it on for a never-capped stack (Chest Flies at 150) writes
//     exactly {gympin: true, stackMax: 150} to that one exercise, stamped
//     with the config version, and the card then renders "pin 150 · 10, 5"
//     at 165;
//   - turning a seeded one off (Back Extensions) writes {gympin: false} and
//     the same card that rendered "pin 260" at 270 renders no Top set row;
//   - Cancel writes nothing;
//   - switching a Gympin'd stack to plate-loaded hides the line, the form and
//     the overflow, and switching it back restores all three from the fields
//     that were never deleted.
//
// To verify this test is real: in ExerciseCard.jsx, pass PIN_STACK_CAPS[exercise.id]
// to calculatePinStackBreakdown instead of resolveGympin(exercise).max. Settings
// still writes, but Chest Flies never overflows and Back Extensions never stops.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { setWeightAndOpen } = require('../lib/deck');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function currentConfigVersion(src) {
    const m = src.match(/const EXERCISE_CONFIG_VERSION\s*=\s*(\d+)/);
    if (!m) throw new Error('could not find EXERCISE_CONFIG_VERSION in config.js');
    return Number(m[1]);
}

async function openManageExercises(page) {
    await page.click('.settings-btn');
    await sleep(200);
    const opened = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('.modal-btn'))
            .find(b => b.textContent.includes('Manage Exercises'));
        if (!btn) return false;
        btn.click();
        return true;
    });
    ok(opened, 'opened Manage Exercises');
    await sleep(300);
}

async function closeSettings(page) {
    await page.evaluate(() => {
        const back = Array.from(document.querySelectorAll('.modal-btn'))
            .find(b => b.textContent.includes('Back to Settings'));
        if (back) back.click();
    });
    await sleep(200);
    await page.evaluate(() => {
        const close = Array.from(document.querySelectorAll('.modal-btn'))
            .find(b => b.textContent.trim() === 'Close');
        if (close) close.click();
    });
    await sleep(300);
}

const rowSel = (id) => `.exercise-row[data-exercise-id="${id}"]`;

async function rowButton(page, id, label) {
    const clicked = await page.evaluate((sel, label) => {
        const row = document.querySelector(sel);
        const btn = row && Array.from(row.querySelectorAll('button'))
            .find(b => b.textContent.trim() === label);
        if (!btn) return false;
        btn.click();
        return true;
    }, rowSel(id), label);
    ok(clicked, `clicked ${label} on ${id}`);
    await sleep(250);
}

// The Gympin controls as the user sees them on one row.
async function readGympinForm(page, id) {
    return page.evaluate((sel) => {
        const row = document.querySelector(sel);
        const form = row.querySelector('[data-field="gympin-form"]');
        const status = row.querySelector('[data-field="gympin-status"]');
        const box = row.querySelector('input[data-field="gympin"]');
        const max = row.querySelector('input[data-field="stackMax"]');
        const hint = row.querySelector('[data-field="gympin-hint"]');
        return {
            hasForm: !!form,
            status: status ? status.textContent.trim() : null,
            on: box ? box.checked : null,
            hasMaxInput: !!max,
            max: max ? max.value : null,
            hint: hint ? hint.textContent.trim() : null,
        };
    }, rowSel(id));
}

async function setSwitch(page, id, on) {
    await page.evaluate((sel, on) => {
        const box = document.querySelector(sel + ' input[data-field="gympin"]');
        if (box.checked !== on) box.click();
    }, rowSel(id), on);
    await sleep(150);
}

async function setValue(page, selector, value) {
    await page.evaluate((sel, v) => {
        const el = document.querySelector(sel);
        const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    }, selector, String(value));
    await sleep(200);
}

async function readSaved(page) {
    return page.evaluate((ns) => {
        const raw = localStorage.getItem(ns + 'gymExerciseConfig');
        if (!raw) return null;
        const cfg = JSON.parse(raw);
        return {
            version: cfg.version,
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
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // === 1. The list view, untouched ====================================
        await openManageExercises(page);
        let back = await readGympinForm(page, 'leg-curls');
        eq(back.hasForm, false, 'no form outside edit mode');
        eq(back.status, '📌 Gympin past 260 lbs', 'Back Extensions says where the Gympin takes over');
        eq((await readGympinForm(page, 'chest-flies')).status, null,
            'Chest Flies, a stack with no ceiling, says nothing');
        eq((await readGympinForm(page, 'hip-adduction')).status, null,
            'Leg Press, plate-loaded, says nothing');

        // === 2. A seeded machine opens ON with its seed ====================
        await rowButton(page, 'leg-curls', '✏️');
        back = await readGympinForm(page, 'leg-curls');
        eq(back.hasForm, true, 'the form appears on a pin-loaded row in edit mode');
        eq(back.on, true, 'the switch is on for a seeded machine');
        eq(back.max, '260', 'and the seed is filled in');
        eq(back.status, null, 'the at-a-glance line yields to the form while editing');
        await rowButton(page, 'leg-curls', 'Cancel');

        // === 3. A plate-loaded machine gets no form =========================
        await rowButton(page, 'hip-adduction', '✏️');
        const legPress = await readGympinForm(page, 'hip-adduction');
        eq(legPress.hasForm, false, 'Leg Press (plate-two-sided) offers no Gympin controls');
        await rowButton(page, 'hip-adduction', 'Cancel');

        // === 4. Turn it on for Chest Flies at 150 ===========================
        await rowButton(page, 'chest-flies', '✏️');
        let flies = await readGympinForm(page, 'chest-flies');
        eq(flies.on, false, 'Chest Flies opens off');
        eq(flies.hasMaxInput, false, 'and the number is folded away while off');
        await setSwitch(page, 'chest-flies', true);
        flies = await readGympinForm(page, 'chest-flies');
        eq(flies.hasMaxInput, true, 'switching on reveals the number');
        eq(flies.max, '', 'blank, since nothing was ever seeded for it');
        contains(flies.hint, 'Needs the stack', 'and the hint says the number is still wanted');
        await setValue(page, rowSel('chest-flies') + ' input[data-field="stackMax"]', 150);
        flies = await readGympinForm(page, 'chest-flies');
        contains(flies.hint, 'Above 150 lbs', 'the hint turns into a preview once a number is in');
        await rowButton(page, 'chest-flies', 'Save');

        let saved = await readSaved(page);
        eq(saved.version, VERSION, 'the write is stamped with the current EXERCISE_CONFIG_VERSION');
        eq(saved.byId['chest-flies'], { hasGympin: true, gympin: true, hasStackMax: true, stackMax: 150 },
            'Chest Flies saved on at 150');
        const touched = Object.entries(saved.byId)
            .filter(([id, e]) => id !== 'chest-flies' && (e.hasGympin || e.hasStackMax))
            .map(([id]) => id);
        eq(touched, [], 'no other exercise gained a Gympin field');
        eq((await readGympinForm(page, 'chest-flies')).status, '📌 Gympin past 150 lbs',
            'the list now says so');

        // === 5. Turn a seeded one off ======================================
        await rowButton(page, 'leg-curls', '✏️');
        await setSwitch(page, 'leg-curls', false);
        eq((await readGympinForm(page, 'leg-curls')).hasMaxInput, false,
            'switching off folds the number away');
        await rowButton(page, 'leg-curls', 'Save');
        saved = await readSaved(page);
        eq(saved.byId['leg-curls'].gympin, false, 'Back Extensions saved off');
        eq(saved.byId['leg-curls'].stackMax, 260,
            'and keeps its 260, so switching back on needs no retyping');
        eq((await readGympinForm(page, 'leg-curls')).status, null, 'the list line is gone');

        // === 6. Cancel writes nothing ======================================
        await rowButton(page, 'shoulder-press', '✏️');
        await setSwitch(page, 'shoulder-press', false);
        await rowButton(page, 'shoulder-press', 'Cancel');
        saved = await readSaved(page);
        eq(saved.byId['shoulder-press'], { hasGympin: false, gympin: undefined, hasStackMax: false, stackMax: undefined },
            'Cancel left Shoulder Press without a saved field');
        eq((await readGympinForm(page, 'shoulder-press')).status, '📌 Gympin past 250 lbs',
            'and it still reads its seed');

        // === 7. The card reads the setting, across a reload ================
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'full-body');

        const fliesCard = await setWeightAndOpen(page, 'Chest Flies', 165);
        contains(fliesCard, 'TOP SET', 'Chest Flies now has a Top set row');
        contains(fliesCard, 'pin 150', 'pegged at the 150 the user typed');
        contains(fliesCard, '10, 5', 'with the 15 lb excess as a 10 and a 5');

        const backCard = await setWeightAndOpen(page, 'Back Extensions', 270);
        ok(backCard.indexOf('pin 260') === -1, 'Back Extensions no longer pegs at 260');
        ok(backCard.indexOf('TOP SET') === -1, 'and has no Top set row at all — a stack with no ceiling');
        contains(backCard, '190 lbs', 'its warmups are untouched');

        // === 8. Plate-loaded hides everything; pin restores it =============
        await openManageExercises(page);
        await setValue(page, rowSel('chest-flies') + ' select[data-field="loadType"]', 'plate-two-sided');
        eq((await readGympinForm(page, 'chest-flies')).status, null,
            'a plate-loaded Chest Flies shows no Gympin line');
        await rowButton(page, 'chest-flies', '✏️');
        eq((await readGympinForm(page, 'chest-flies')).hasForm, false, 'and no form');
        await rowButton(page, 'chest-flies', 'Cancel');
        saved = await readSaved(page);
        eq(saved.byId['chest-flies'], { hasGympin: true, gympin: true, hasStackMax: true, stackMax: 150 },
            'the fields are kept, not deleted, by the reclassification');
        await closeSettings(page);
        const plateCard = await setWeightAndOpen(page, 'Chest Flies', 165);
        ok(plateCard.indexOf('pin 150') === -1, 'the card renders no pin row on a plate machine');
        contains(plateCard, '/side', 'it renders the two-sided shape instead');

        await openManageExercises(page);
        await setValue(page, rowSel('chest-flies') + ' select[data-field="loadType"]', 'pin');
        eq((await readGympinForm(page, 'chest-flies')).status, '📌 Gympin past 150 lbs',
            'switching back to Pin-loaded brings the line back from the kept fields');
        await closeSettings(page);
        contains(await setWeightAndOpen(page, 'Chest Flies', 165), 'pin 150', 'and the overflow with it');

        eq(errors, [], 'no console errors');
        console.log('PASS: the Gympin is a per-exercise Settings answer, offered on pin stacks only, and the card reads it');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
