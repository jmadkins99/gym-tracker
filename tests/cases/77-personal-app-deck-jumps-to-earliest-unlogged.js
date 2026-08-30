// What this test covers
// ----------------------
// Where the deck lands after a LOG: the EARLIEST unlogged card in the roster,
// wherever it is, and the finish card only when there is nothing left.
//
// Logging used to move on by one, which put you on something already done
// whenever you had worked out of order — and working out of order is normal,
// because machines get taken. An earlier rule preferred anything ahead of you
// and only wrapped when nothing was left forward; that read well but meant a
// machine skipped early stayed skipped for most of the session.
//
// Earliest-first instead. The roster order is the order the program intends, so
// filling the earliest hole keeps the day in sequence and makes "what is left"
// always the thing in front of you. A useful consequence: arriving at Submit
// Day now means the day is genuinely complete, not merely that you reached the
// end of the list.
//
// The subtle part is that `loggedExercises` has not updated when the jump is
// computed — `logExercise` sets it — so the card just logged has to be treated
// as done explicitly, or the scan finds it still unlogged and jumps straight
// back onto it. That is what the first assertion here would catch.
//
// Only the post-log jump skips. Manual swiping still steps exactly one card,
// because swiping is how you browse the day and a swipe that vaulted three
// cards would make the deck unreadable.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const {
    ACTIVE, DEFAULT_NS, revealCard, logCard, deckIndex, deckPosition,
    onFinishCard, stepTo, selectDeckDay, isRevealed,
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

        const total = parseInt((await deckPosition(page)).split(' ')[2], 10);
        eq(total, 12, 'the Anterior day has 12 movements');

        // === 1. In order: log 1, land on 2 =============================
        eq(await deckIndex(page), 1, 'starting on the first card');
        await revealCard(page);
        await logCard(page);
        eq(await deckIndex(page), 2,
            'logging card 1 lands on card 2 — and NOT back on card 1, which is what ' +
            'happens if the just-logged card is not treated as done explicitly');

        // === 2. Out of order: it goes BACKWARDS to the hole ============
        await stepTo(page, 3);
        await revealCard(page);
        await logCard(page);
        eq(await deckIndex(page), 2,
            'logging card 3 while card 2 is outstanding jumps BACK to card 2 — the ' +
            'earliest hole wins, not the nearest thing ahead');

        // === 3. And skips over what is already logged ==================
        await revealCard(page);
        await logCard(page);
        eq(await deckIndex(page), 4,
            'logging card 2 then skips card 3, which is already done, and lands on 4');

        // === 4. Manual navigation never skips ==========================
        await stepTo(page, 3);
        eq(await deckIndex(page), 3, 'the arrows can still reach a logged card');
        eq(await isRevealed(page), true, 'which shows as a review');
        await page.evaluate(() => {
            const a = document.querySelectorAll('.deck-arrow');
            a[a.length - 1].click();
        });
        await new Promise((r) => setTimeout(r, 420));
        eq(await deckIndex(page), 4,
            'and stepping forward moves exactly one card, over the logged one — only the ' +
            'post-log jump skips');

        // === 5. Fill the day: the last log reaches the finish card =====
        for (let guard = 0; guard < 20; guard++) {
            if (await onFinishCard(page)) break;
            await revealCard(page);
            if (!(await logCard(page))) break;
        }
        eq(await onFinishCard(page), true,
            'once nothing is unlogged the deck lands on the finish card');
        eq(await deckPosition(page), 'finish', 'and the counter says so');
        ok(await page.$(ACTIVE + ' .save-btn'), 'which is where Submit Day lives');

        // === 6. Stepping back off the finish card ======================
        await page.evaluate(() => document.querySelectorAll('.deck-arrow')[0].click());
        await new Promise((r) => setTimeout(r, 420));
        eq(await deckIndex(page), total, 'stepping back from finish lands on the last card');

        eq(errors.length, 0, `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: after a LOG the deck goes to the earliest thing left, then to Submit Day.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
