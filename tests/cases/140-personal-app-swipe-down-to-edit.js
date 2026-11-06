// What this test covers
// ----------------------
// Swipe down on a card to edit that exercise (Nov 2026): the same one-exercise
// form as Settings > Manage Exercises > pencil, pulled down over the deck.
//
//   - Down on an OPEN card opens the form for that exercise only, and swiping
//     back up saves it and returns to the card still open. The start anchor is
//     untouched, so the set's clock runs from the original swipe up — the
//     point is noting something mid-set without restarting the timing.
//   - The form shows a live clock of time on the exercise, counted from that
//     same anchor. A card never opened has no anchor, so its form has none.
//   - Down on an unopened card works too, and Cancel discards and leaves the
//     card shut with no anchor stamped.
//   - A tap outside the form saves, like the swipe up: either is how you get
//     back to the card, and a typed note must not be lost to it.
//
// To verify this test is real: drop the `onEditExercise(exercise.id)` call in
// SwipeDeck's onPointerUp. Phase 1 fails with no form on screen.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { ACTIVE, swipe, goToCard, revealCard, isRevealed, startAnchors } = require('../lib/deck');
const { seedPersonalApp, seedExerciseConfig } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const LATERAL = 'delts-shoulder-abduction-stop-at-90-degrees';
const TRICEPS = 'triceps-elbow-extension';
const HINT_SEL = '.modal.quick-edit input[data-field="hint"]';

const savedHint = (page, id) => page.evaluate((ns, id) => {
    const e = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig')).exercises.find(x => x.id === id);
    return 'hint' in e ? e.hint : '(absent)';
}, NS, id);

const quickForm = (page) => page.evaluate(() => {
    const modal = document.querySelector('.modal.quick-edit');
    if (!modal) return null;
    return Array.from(modal.querySelectorAll('.exercise-row')).map(r => r.getAttribute('data-exercise-id'));
});

async function typeHint(page, text) {
    await page.click(HINT_SEL, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(HINT_SEL, text);
}

// A mouse drag upward from low on the overlay, below the form.
async function swipeUpOnOverlay(page) {
    const { x, y } = await page.evaluate(() => ({ x: window.innerWidth / 2, y: window.innerHeight - 60 }));
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(x, y - 30 * i);
    await page.mouse.up();
    await sleep(300);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        const version = await page.evaluate(() => EXERCISE_CONFIG_VERSION);
        await seedPersonalApp(page, {});
        await seedExerciseConfig(page, { version });
        await page.evaluate((ns) => localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // === 1. Down on an open card, up to save and return ===============
        await goToCard(page, 'Lateral Raises');
        await revealCard(page);
        const before = await startAnchors(page);
        ok(before[LATERAL], 'opening the card stamped its start');
        await sleep(1100);

        await swipe(page, 0, 180, { settle: 400 });
        eq(await quickForm(page), [LATERAL], 'swiping down opens the form for just this exercise');
        eq(await page.evaluate(() => document.activeElement.tagName), 'BODY',
            'and focuses nothing, so a phone keyboard does not jump up over it');
        const clock = () => page.evaluate(() =>
            document.querySelector('[data-exercise-clock] span')?.textContent ?? null);
        const firstTick = await clock();
        ok(/^0m [1-9]\d?s$/.test(firstTick), `the form shows time on the exercise since it was opened (got ${firstTick})`);
        await sleep(1100);
        ok((await clock()) !== firstTick, 'and the clock is live');
        await typeHint(page, 'seat 3');
        await swipeUpOnOverlay(page);
        eq(await quickForm(page), null, 'swiping up closes the form');
        eq(await savedHint(page, LATERAL), 'seat 3', 'and saves what was typed');
        eq(await isRevealed(page), true, 'back on the card, still open');
        eq(await startAnchors(page), before, 'with the start time exactly as it was');
        ok(await page.evaluate((sel) => document.querySelector(sel + ' .card-open-hint')?.textContent === 'seat 3', ACTIVE),
            'and the new hint on it');

        // === 2. Down on an unopened card, Cancel ===========================
        await goToCard(page, 'Tricep Extensions');
        eq(await isRevealed(page), false, 'the next card starts shut');
        await swipe(page, 0, 180, { settle: 400 });
        eq(await quickForm(page), [TRICEPS], 'swiping down on a shut card opens its form too');
        eq(await page.$('[data-exercise-clock]'), null, 'with no clock, since it has no start');
        await typeHint(page, 'discard me');
        await page.evaluate(() => Array.from(document.querySelectorAll('.modal.quick-edit button'))
            .find(b => b.textContent.trim() === 'Cancel').click());
        await sleep(250);
        eq(await quickForm(page), null, 'Cancel closes it');
        eq(await savedHint(page, TRICEPS), '(absent)', 'and writes nothing');
        eq(await isRevealed(page), false, 'the card is still shut');
        ok(!(await startAnchors(page))[TRICEPS], 'and no start was stamped for it');

        // === 3. A tap outside saves ========================================
        await swipe(page, 0, 180, { settle: 400 });
        await typeHint(page, 'rope');
        await page.mouse.click(195, 820);
        await sleep(250);
        eq(await quickForm(page), null, 'a tap outside closes the form');
        eq(await savedHint(page, TRICEPS), 'rope', 'and saves it');

        eq(errors, [], 'no console errors');
        console.log('PASS: swiping down edits the exercise, swiping up saves and leaves the clock alone.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
