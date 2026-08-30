// What this test covers
// ----------------------
// That a logged card opens by itself, and that doing so does not collide with
// the close-on-leave rule in case 75.
//
// Once a set is recorded the card is a record, not a prompt, so it renders its
// revealed face unconditionally — making you swipe up again to read back what
// you just wrote is friction for nothing.
//
// The interesting part is why it needs no special case against case 75.
// `isRevealed` is `logged || expanded`, and by the time `isLogged` is true
// `logExercise` has already dropped the anchor and cleared
// `expandedWeightBreakdown`. So a logged card is open BY VIRTUE OF BEING LOGGED
// rather than by holding an anchor — and the close-on-leave rule only ever
// fires for the card currently holding one. The exemption is structural.
//
// Get that wrong and the review flickers shut a third of a second after you
// land on it, which is baffling to diagnose from the symptom, so the case waits
// out the close timer deliberately rather than asserting immediately.
//
// Two consequences follow and are checked: swiping up on a review cannot stamp
// a fresh anchor (there is no set about to happen), and an unlogged card must
// still close behind you, or this rule has simply disabled case 75.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const {
    ACTIVE, DEFAULT_NS, swipe, revealCard, isRevealed, logCard, activeName,
    selectDeckDay, startAnchors, stepTo,
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

        // === 1. Before logging: a nameplate ============================
        eq(await isRevealed(page), false, 'an unlogged card starts closed');
        eq(await page.$$eval(ACTIVE + ' .logged-chip', (e) => e.length), 0,
            'and carries no review marker');

        await revealCard(page);
        const logged = await activeName(page);
        await logCard(page);

        // === 2. Come back to it: open, as a review =====================
        await stepTo(page, 1);
        eq(await activeName(page), logged, 'back on the card that was logged');
        eq(await isRevealed(page), true, 'a logged card opens by itself');
        eq(await page.$$eval(ACTIVE + ' .logged-chip', (e) => e.length), 1,
            'and says it is a review');
        eq(await page.evaluate((s) =>
            document.querySelector(s + ' .log-btn').disabled, ACTIVE), true,
            'its LOG button is spent');
        eq(await page.evaluate((s) =>
            document.querySelector(s + ' input[type="number"]').disabled, ACTIVE), true,
            'and its inputs are locked');

        // === 3. Leaving and returning must NOT close it ================
        await swipe(page, -180, 0);
        await swipe(page, 180, 0);
        eq(await activeName(page), logged, 'still the same card');
        eq(await isRevealed(page), true, 'the review survived leaving and returning');

        // Wait past the close-on-leave timer, which is where a broken
        // exemption would show up.
        await new Promise((r) => setTimeout(r, 800));
        eq(await isRevealed(page), true,
            'and it is STILL open once the close timer would have fired — the exemption ' +
            'holds because a logged card never holds the anchor that rule targets');

        // === 4. Swiping up on a review cannot restart a clock ==========
        const before = await startAnchors(page);
        await swipe(page, 0, -180);
        eq(await startAnchors(page), before,
            'swiping up on a review stamps nothing — there is no set about to happen');

        // === 5. An unlogged card still closes behind you ===============
        // Without this the rule above would just have disabled case 75.
        await swipe(page, -180, 0);
        const fresh = await activeName(page);
        ok(fresh !== logged, 'moved to a different, unlogged card');
        await revealCard(page);
        eq(await isRevealed(page), true, 'it opens on the gesture');
        eq(await page.$$eval(ACTIVE + ' .logged-chip', (e) => e.length), 0,
            'and is not marked as a review');
        await swipe(page, -180, 0);
        await swipe(page, 180, 0);
        eq(await isRevealed(page), false,
            'an unlogged card is still closed on return — the review exemption did not ' +
            'quietly switch off close-on-leave for everything');

        eq(errors.length, 0, `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: a logged card is a review that stays open; an unlogged one still shuts.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
