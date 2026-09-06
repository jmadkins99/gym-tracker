// What this test covers
// ----------------------
// A trip to History is a DETOUR, not a restart. Open a card, tap History, tap
// Workout: the same card is in front of you, still open, still holding the
// anchor it stamped when you opened it.
//
// It used not to be. The deck is unmounted while History is on screen
// (`currentView === 'workout' && <SwipeDeck …>`), so the position it held
// internally died with it, and the day-switch effect — which reset the index
// and closed the panel — had no guard against running on MOUNT, so coming back
// ran a day switch that had not happened. You returned to card one with the
// panel shut, and had to find your machine and swipe it up again mid-set.
//
// Both halves matter and they fail separately:
//
//   position   the deck index now lives in App, which stays mounted
//   panel      the day-switch reset only fires when the day actually changes
//
// The anchor assertion is the one with teeth. `startedAt` is stamped when the
// panel opens and it is what session timing measures from, so a reveal that
// survived visually but re-stamped its clock would be worse than the bug: the
// deck would look right and every duration through it would be short.
//
// The last section covers the other direction. Swiping AWAY from an open card
// still closes it, and that close is a 300ms timer — if you tap History inside
// that window the timer is cancelled by the unmount, so it has to be run there
// instead. Otherwise the card you swiped off comes back open with a stale
// anchor, which is the exact measurement the delayed close exists to discard.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const {
    DEFAULT_NS, revealCard, isRevealed, activeName, deckIndex,
    stepTo, selectDeckDay, bottomNav, startAnchors, swipe,
} = require('../lib/deck');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, {});
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), DEFAULT_NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDeckDay(page, 'anterior');

        // === 1. An open card survives the round trip =====================
        // Card 3 rather than card 1: landing on the right card by accident is
        // exactly what the old behaviour did.
        await stepTo(page, 3);
        const name = await activeName(page);
        ok(await revealCard(page), 'the card opened');
        ok(await isRevealed(page), 'and reads as open before leaving');

        const anchorsBefore = await startAnchors(page);
        const anchored = Object.keys(anchorsBefore);
        eq(anchored.length, 1, 'opening the panel stamped exactly one anchor');

        await bottomNav(page, 'History');
        eq(await page.evaluate(() => !!document.querySelector('.deck-stage')), false,
            'the deck is gone while History is up — the state under test is not its own');

        await bottomNav(page, 'Workout');
        eq(await deckIndex(page), 3, 'back on the same card, not card one');
        eq(await activeName(page), name, 'and it is the same exercise by name');
        ok(await isRevealed(page), 'still open, so the set can be logged without swiping again');

        const anchorsAfter = await startAnchors(page);
        eq(Object.keys(anchorsAfter), anchored, 'the same anchor, not a second one');
        eq(anchorsAfter[anchored[0]], anchorsBefore[anchored[0]],
            'and the clock was never restarted — the timing this screen exists to capture is intact');

        // === 2. A day switch still resets ================================
        // The guard is on mounting, not on switching. If it were on both, an
        // index into the Anterior roster would survive into the Posterior one.
        await selectDeckDay(page, 'posterior');
        eq(await deckIndex(page), 1, 'switching day goes back to the first card');
        eq(await isRevealed(page), false, 'and closes the open panel');

        // === 3. Swiping away still closes, even if History interrupts ====
        await selectDeckDay(page, 'anterior');
        await stepTo(page, 2);
        const second = await activeName(page);
        ok(await revealCard(page), 'opened the card to swipe off');

        // Leave it, then go to History INSIDE the 300ms collapse window, so
        // the unmount is what has to finish the close.
        await swipe(page, -220, 0, { steps: 4, settle: 40 });
        await bottomNav(page, 'History');
        await bottomNav(page, 'Workout');

        await stepTo(page, 2);
        eq(await activeName(page), second, 'back on the card that was swiped away from');
        eq(await isRevealed(page), false,
            'which is shut: leaving a card closes it whether or not History interrupted');

        eq(errors, [], 'no console errors');
        console.log('PASS: History is a detour — the deck keeps its card, its open panel and its clock.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
