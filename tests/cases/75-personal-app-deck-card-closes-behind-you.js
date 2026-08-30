// What this test covers
// ----------------------
// That leaving an opened card closes it, and that reopening restarts the clock.
//
// This is a timing rule wearing a UI costume. The reveal stamps `startedAt`, so
// a card left open across half a session would let you log against an anchor
// from several movements ago — a duration that is not merely wrong but
// confidently wrong, which is exactly the dishonest measurement the deck exists
// to prevent. Closing it forces a fresh reveal, and the fresh reveal restamps.
//
// That matches what the app has always intended: coming back to a machine means
// the set starts when you come back, not when you first glanced at the panel.
// Case 68 established the rule for the old button; this keeps it true when the
// gesture is a swipe and the card is one of three mounted at a time.
//
// The close is deliberately NOT cancelled by a fast return. Swiping away and
// straight back must still find the card shut, because "returning finds it
// closed" is the whole point — a race that preserved it would reintroduce the
// stale anchor through the back door.
//
// It is also scheduled rather than immediate, because the rail keeps the
// outgoing card on screen for the length of the slide. Closing on the spot
// snaps it from open to nameplate in full view.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const {
    ACTIVE, DEFAULT_NS, swipe, revealCard, isRevealed, activeName,
    selectDeckDay, startAnchors,
} = require('../lib/deck');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const anchorOf = async (page) => {
    const a = await startAnchors(page);
    const k = Object.keys(a)[0];
    return k ? { id: k, at: a[k] } : null;
};

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

        // === 1. Swipe away, come back: closed ==========================
        await revealCard(page);
        const opened = await activeName(page);
        eq(await isRevealed(page), true, 'the card is open before leaving');

        await swipe(page, -180, 0);
        await swipe(page, 180, 0);
        eq(await activeName(page), opened, 'back on the same card');
        eq(await isRevealed(page), false, 'and it closed behind us');

        // === 2. Arrows do it too =======================================
        await revealCard(page);
        eq(await isRevealed(page), true, 'reopened');
        await page.evaluate(() => {
            const a = document.querySelectorAll('.deck-arrow');
            a[a.length - 1].click();
        });
        await new Promise((r) => setTimeout(r, 520));
        await page.evaluate(() => document.querySelectorAll('.deck-arrow')[0].click());
        await new Promise((r) => setTimeout(r, 520));
        eq(await isRevealed(page), false, 'arrow navigation closes it as well');

        // === 3. An immediate return still finds it shut ================
        await revealCard(page);
        eq(await isRevealed(page), true, 'open again');
        await swipe(page, -180, 0, { settle: 60 });
        await swipe(page, 180, 0, { settle: 800 });
        eq(await isRevealed(page), false,
            'swiping straight back STILL finds it closed — the close is not cancelled ' +
            'by a fast return, or a stale anchor would survive through the back door');

        // === 4. Reopening restarts the clock ===========================
        await revealCard(page);
        const first = await anchorOf(page);
        ok(first, 'reopening stamps an anchor');
        await new Promise((r) => setTimeout(r, 1100));
        await swipe(page, -180, 0);
        await swipe(page, 180, 0);
        await revealCard(page);
        const second = await anchorOf(page);

        eq(Object.keys(await startAnchors(page)).length, 1,
            'still exactly one anchor — opening a card replaces rather than accumulates');
        eq(second.id, first.id, 'and it belongs to the same exercise');
        ok(new Date(second.at) > new Date(first.at),
            'the clock RESTARTED rather than resuming the old stamp: walking back to a ' +
            'machine means the set starts now');

        // === 5. Switching day closes it too ============================
        await revealCard(page);
        await selectDeckDay(page, 'posterior');
        eq(await page.$$eval(ACTIVE + ' .card-open', (e) => e.length), 0,
            'switching day leaves no card open — the whole roster changed underneath');

        eq(errors.length, 0, `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: a card closes behind you, and reopening starts a fresh clock.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
