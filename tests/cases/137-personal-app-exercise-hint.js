// What this test covers
// ----------------------
// The per-exercise hint (Oct 2026): a one-line note typed under the name in
// Settings > Manage Exercises > pencil, shown in small gray text under the
// name on the card's OPEN face — cable height, bench angle, seat setting.
//
//   - The field sits under the name box, above Save, caps at 60 characters,
//     and is committed by Save and undone by Cancel.
//   - A blank or whitespace-only hint saves as no hint at all, and a card
//     with no hint renders no hint element: nothing, not an empty line.
//   - On the open face the hint is gray, smaller than the name, and directly
//     under it. The FRONT face never shows it: hints carry numbers ("pin 7"),
//     and case 72's rule is that the front has no digit of any kind.
//   - Clearing the hint removes it from the card.
//   - It is user-owned, so a version bump keeps it.
//
// To verify this test is real: drop the `hint` line from the result.push in
// migrateExerciseConfig. The version-bump half fails with the hint gone.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { ACTIVE, goToCard, revealCard } = require('../lib/deck');
const { seedPersonalApp, seedExerciseConfig, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const LATERAL = 'delts-shoulder-abduction-stop-at-90-degrees';
const HINT = 'cable pin 7, seat 3';
const GRAY = 'rgb(92, 92, 116)';   // #5c5c74, the "Last:" line's gray

const rowSel = (id) => `.exercise-row[data-exercise-id="${id}"]`;
const hintSel = (id) => rowSel(id) + ' input[data-field="hint"]';

async function openManageExercises(page) {
    await page.click('.settings-btn');
    await sleep(200);
    await page.evaluate(() => Array.from(document.querySelectorAll('.modal-btn'))
        .find(b => b.textContent.includes('Manage Exercises')).click());
    await sleep(300);
}

async function closeSettings(page) {
    for (const label of ['Back to Settings', 'Close']) {
        await page.evaluate((l) => {
            const b = Array.from(document.querySelectorAll('.modal-btn')).find(x => x.textContent.includes(l));
            if (b) b.click();
        }, label);
        await sleep(250);
    }
}

async function rowButton(page, id, label) {
    const clicked = await page.evaluate((sel, label) => {
        const btn = Array.from(document.querySelector(sel).querySelectorAll('button'))
            .find(b => b.textContent.trim() === label);
        if (!btn) return false;
        btn.click();
        return true;
    }, rowSel(id), label);
    ok(clicked, `clicked ${label} on ${id}`);
    await sleep(250);
}

// Type for real, so the field's maxLength applies the way it does on a phone.
async function typeHint(page, id, text) {
    await page.click(hintSel(id), { clickCount: 3 });
    await page.keyboard.press('Backspace');
    if (text) await page.type(hintSel(id), text);
}

async function saveHint(page, id, text) {
    await rowButton(page, id, '✏️');
    await typeHint(page, id, text);
    await rowButton(page, id, 'Save');
}

const savedHint = (page, id) => page.evaluate((ns, id) => {
    const e = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig')).exercises.find(x => x.id === id);
    return 'hint' in e ? e.hint : '(absent)';
}, NS, id);

// The open card's hint, and where it sits relative to the name.
async function readCardHint(page, name) {
    await goToCard(page, name);
    await revealCard(page);
    return page.evaluate((sel) => {
        const card = document.querySelector(sel + ' .card');
        const el = card.querySelector('.card-open-hint');
        if (!el) return null;
        const nameEl = card.querySelector('.card-open-name');
        const style = getComputedStyle(el);
        return {
            text: el.textContent,
            color: style.color,
            smaller: parseFloat(style.fontSize) < parseFloat(getComputedStyle(nameEl).fontSize),
            underName: el.getBoundingClientRect().top >= nameEl.getBoundingClientRect().bottom - 1,
            aboveWeight: el.getBoundingClientRect().bottom <= card.querySelector('.hero-weight').getBoundingClientRect().top,
        };
    }, ACTIVE);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        const version = await page.evaluate(() => EXERCISE_CONFIG_VERSION);
        const history = [workoutEntry({
            date: new Date(Date.now() - 86400000).toISOString(), day: 'full-body',
            exercises: [{ id: LATERAL, name: 'Lateral Raises', weight: '130', reps: '5' }],
        })];
        await seedPersonalApp(page, { workoutHistory: history });
        await seedExerciseConfig(page, { version });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // === 1. The field ===================================================
        await openManageExercises(page);
        await rowButton(page, LATERAL, '✏️');
        const field = await page.evaluate((sel) => {
            const row = document.querySelector(sel);
            const inputs = Array.from(row.querySelectorAll('input'));
            const hint = row.querySelector('input[data-field="hint"]');
            const save = Array.from(row.querySelectorAll('button')).find(b => b.textContent.trim() === 'Save');
            return {
                exists: !!hint,
                afterName: inputs.indexOf(hint) === 1 && inputs[0].type === 'text',
                beforeSave: !!hint && !!(hint.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING),
                maxLength: hint ? hint.maxLength : null,
                value: hint ? hint.value : null,
            };
        }, rowSel(LATERAL));
        eq(field, { exists: true, afterName: true, beforeSave: true, maxLength: 60, value: '' },
            'a blank 60-character hint field sits under the name, above Save');

        // In the long list, iOS scrolled the modal to the focused field and then
        // panned the screen as well, which the app undoes, so on a phone the field
        // landed above the top edge. So while editing, that exercise is the only
        // row, pinned to the top, and its fields sit where a keyboard never reaches.
        const layout = await page.evaluate((sel) => {
            const hint = document.querySelector(sel);
            return {
                rows: document.querySelectorAll('.modal .exercise-row').length,
                hintInTopThird: hint.getBoundingClientRect().bottom < window.innerHeight / 3,
                scrolled: hint.closest('.modal').scrollTop,
            };
        }, hintSel(LATERAL));
        eq(layout, { rows: 1, hintInTopThird: true, scrolled: 0 },
            'editing shows only that exercise, at the top, with its hint field high on the screen');
        await typeHint(page, LATERAL, HINT);
        await rowButton(page, LATERAL, 'Cancel');
        eq(await savedHint(page, LATERAL), '(absent)', 'Cancel writes nothing');

        await saveHint(page, LATERAL, HINT);
        eq(await savedHint(page, LATERAL), HINT, 'Save writes the hint');
        await saveHint(page, 'triceps-elbow-extension', '     ');
        eq(await savedHint(page, 'triceps-elbow-extension'), '(absent)', 'a whitespace-only hint saves as none');
        await saveHint(page, 'traps-scapular-retraction', 'x'.repeat(70));
        eq(await savedHint(page, 'traps-scapular-retraction'), 'x'.repeat(60), 'typing stops at 60 characters');
        await rowButton(page, LATERAL, '✏️');
        eq(await page.evaluate((s) => document.querySelector(s).value, hintSel(LATERAL)), HINT,
            'the field reopens on the saved hint');
        await rowButton(page, LATERAL, 'Cancel');
        await closeSettings(page);

        // === 2. The card ====================================================
        await goToCard(page, 'Lateral Raises');
        const front = await page.evaluate((sel) => document.querySelector(sel + ' .card-front').innerText, ACTIVE);
        ok(!front.includes(HINT) && !/\d/.test(front), 'the front face shows no hint and still no digit');

        eq(await readCardHint(page, 'Lateral Raises'),
            { text: HINT, color: GRAY, smaller: true, underName: true, aboveWeight: true },
            'the open face shows the hint in gray, smaller than the name, under it and above the weight');
        eq(await readCardHint(page, 'Tricep Extensions'), null,
            'a card with no hint renders no hint element at all');

        // === 3. Clearing it =================================================
        await openManageExercises(page);
        await saveHint(page, LATERAL, '');
        eq(await savedHint(page, LATERAL), '(absent)', 'clearing the field removes the hint');
        await closeSettings(page);
        eq(await readCardHint(page, 'Lateral Raises'), null, 'and the card shows nothing');

        // === 4. It survives a version bump ==================================
        await seedExerciseConfig(page, { version: version - 1, overrides: { [LATERAL]: { hint: HINT } } });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        eq(await savedHint(page, LATERAL), HINT, 'the hint survives a version bump');

        eq(errors, [], 'no console errors');
        console.log('PASS: the hint is a blank-by-default gray line under the name on the open card.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
