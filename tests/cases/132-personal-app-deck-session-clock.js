// What this test covers
// ----------------------
// The live "at the gym" clock above the deck: hidden until the first LOG,
// then counting from that card's opening swipe rather than from the log,
// ticking, and gone once the day is submitted.
//
// The page's clock is frozen at noon today and moved only by the test.
//
//   1. Fresh day, card opened at 12:00: no clock — opening cards alone must
//      not show it.
//   2. Logged at 12:02: the clock appears reading "2m", measured from the
//      12:00 swipe. Starting it at the log would read "0m".
//   3. Five seconds on it reads "2m 5s" without any interaction — it ticks.
//   4. Submit Day: the clock is gone.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { ACTIVE, revealCard, logCard, submitDay } = require('../lib/deck');
const { seedPersonalApp } = require('../lib/state');
const { eq } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const noon = new Date();
noon.setHours(12, 0, 0, 0);
const NOW = noon.getTime();

const readClock = (page) => page.evaluate(() => {
    const el = document.querySelector('[data-session-clock-total]');
    return el ? el.textContent.trim() : null;
});

async function waitForClock(page, expected) {
    await page.waitForFunction((t) => {
        const el = document.querySelector('[data-session-clock-total]');
        return (el ? el.textContent.trim() : null) === t;
    }, { timeout: 8000 }, expected).catch(async () => {
        throw new Error(`clock never read ${JSON.stringify(expected)}; ` +
            `last read ${JSON.stringify(await readClock(page))}`);
    });
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);

        await page.evaluateOnNewDocument((fixed) => {
            const RealDate = Date;
            let offset = 0;
            class FrozenDate extends RealDate {
                constructor(...args) {
                    if (args.length === 0) super(fixed + offset);
                    else super(...args);
                }
                static now() { return fixed + offset; }
            }
            window.Date = FrozenDate;
            window.__advanceClock = (ms) => { offset += ms; };
        }, NOW);

        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate(() =>
            localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // === 1. Opening a card shows nothing ==============================
        await revealCard(page);
        await page.evaluate((sel) => {
            const input = document.querySelector(sel + ' input[type="number"]');
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, '100');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }, ACTIVE);
        await new Promise((r) => setTimeout(r, 1200));
        eq(await readClock(page), null, 'no clock before the first log');

        // === 2. First log: clock counts from the swipe ====================
        await page.evaluate(() => window.__advanceClock(2 * 60000));
        eq(await logCard(page), true, 'the first card logs');
        await waitForClock(page, '2m');

        // === 3. It ticks ==================================================
        await page.evaluate(() => window.__advanceClock(5000));
        await waitForClock(page, '2m 5s');

        // === 4. Submitted: gone ===========================================
        eq(await submitDay(page), true, 'Submit Day is clicked');
        await page.waitForFunction(() => !document.querySelector('[data-session-clock]'),
            { timeout: 8000 });

        eq(errors.length, 0, `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: the deck clock appears at the first log, counts from the swipe, and ends at submit.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
