// What this test covers
// ----------------------
// A day picked by hand in Settings, before anything is logged:
//
//   1. It switches the deck, and survives a reload. A phone reloads a
//      backgrounded tab on its own, and landing back on the other day before
//      the first set would be the same papercut case 111 fixed for open cards.
//   2. It lasts until midnight only. A pick stamped yesterday is ignored and
//      the day comes from history again, so a pick never outlives the session
//      it was made for. It is device-local, like the open-card anchor, and
//      shares its "today only" storage helper under a key of its own.
//   3. Switching day forgets the open card. Otherwise its anchor would survive
//      the switch and the reload would restore the card — and with it the day
//      you just switched away from.
//
// To verify this test is real: stop App.jsx saving the pick. (1) fails after
// the reload. Or drop the closeWeightBreakdown() from the day switch: (3)
// fails on the anchor, then on the day after the reload.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readDayToggle, selectDayType } = require('../lib/browser');
const { activeName, deckPosition, goToCardById, revealCard, isRevealed, startAnchors } = require('../lib/deck');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

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
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate((ns) => localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), NS);
        await reload(page);
        eq((await readDayToggle(page)).active, 'anterior-2', 'no history: Anterior');

        // === 1. Pick Posterior, reload ======================================
        await selectDayType(page, 'posterior-2');
        eq(await activeName(page), 'Recline Curls', 'picking Posterior switches the deck');
        await reload(page);
        const toggle = await readDayToggle(page);
        eq([toggle.active, toggle.locked], ['posterior-2', false], 'the pick survives a reload, still unlocked');
        eq(await activeName(page), 'Recline Curls', 'and so does the deck');

        // === 2. Yesterday's pick ============================================
        await page.evaluate((ns) => {
            const raw = JSON.parse(localStorage.getItem(ns + 'dayPick'));
            const d = new Date(); d.setDate(d.getDate() - 1);
            localStorage.setItem(ns + 'dayPick', JSON.stringify({ ...raw, date: d.toDateString() }));
        }, NS);
        await reload(page);
        eq((await readDayToggle(page)).active, 'anterior-2', 'a pick from yesterday is ignored');

        // === 3. Switching day forgets the open card =========================
        await goToCardById(page, 'pecs-shoulder-adduction');
        await revealCard(page);
        ok(await isRevealed(page), 'opened High to Low Flies');
        ok((await startAnchors(page, NS))['pecs-shoulder-adduction'], 'and it is anchored');

        await selectDayType(page, 'posterior-2');
        eq(Object.keys(await startAnchors(page, NS)), [], 'switching day dropped the anchor');
        eq(await deckPosition(page), '1 of 11', 'and the deck starts the new day at card one');
        eq(await isRevealed(page), false, 'shut');

        await reload(page);
        eq((await readDayToggle(page)).active, 'posterior-2',
            'after the reload the picked day wins — no anchor pulls it back to Anterior');
        eq(await isRevealed(page), false, 'and no card is reopened');

        eq(errors, [], 'no console errors');
        console.log('PASS: a day pick survives a reload until midnight and forgets the open card');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
