// What this test covers
// ----------------------
// The day lock ends at midnight even when the page never reloads.
//
// A phone restores a backgrounded tab rather than reloading it, so the app is
// often still the page that was open at yesterday's workout. The lock and the
// start day were worked out at load and whenever history changed — neither of
// which happens overnight — so the morning after an Anterior session the
// Settings toggle still read "Today is Anterior", locked, and the first LOG
// started today's session on Anterior again: the alternation broken by
// nothing more than not closing the tab.
//
//   1. Log a card on Anterior: locked on Anterior.
//   2. Move the clock a day forward and bring the tab back to the foreground:
//      unlocked, on Posterior (the opposite of yesterday), no note.
//   3. Log a card: a NEW session for today, stamped Posterior, and the toggle
//      locks on Posterior. Yesterday's session is left as it was.
//
// The clock is a Date subclass shifted by an offset, as in case 132, and the
// return to the foreground is a dispatched visibilitychange, as in case 66.
//
// To verify this test is real: remove the visibilitychange listener that
// refreshes App's `today`. (2) fails on the lock.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readDayToggle, waitFor } = require('../lib/browser');
const { ACTIVE, activeName, revealCard, logCard, todayWorkout } = require('../lib/deck');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const DAY_MS = 24 * 60 * 60 * 1000;

async function setVisibility(page, state) {
    await page.evaluate((s) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
        document.dispatchEvent(new Event('visibilitychange'));
    }, state);
}

const historyLength = (page) => page.evaluate((ns) =>
    JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]').length, NS);

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.evaluateOnNewDocument(() => {
            const RealDate = Date;
            let offset = 0;
            class ShiftedDate extends RealDate {
                constructor(...args) {
                    if (args.length === 0) super(RealDate.now() + offset);
                    else super(...args);
                }
                static now() { return RealDate.now() + offset; }
            }
            window.Date = ShiftedDate;
            window.__advanceClock = (ms) => { offset += ms; };
        });

        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // === 1. Yesterday: a LOG on Anterior ==============================
        eq((await readDayToggle(page)).active, 'anterior-2', 'with no history the app opens on Anterior');
        await revealCard(page);
        ok(await logCard(page), 'logged the first Anterior card');
        await waitFor(page, 'the session to reach history', (ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]').length === 1, NS);
        let toggle = await readDayToggle(page);
        eq([toggle.active, toggle.locked], ['anterior-2', true], 'locked on Anterior');

        // === 2. Overnight, without a reload ===============================
        await setVisibility(page, 'hidden');
        await page.evaluate((ms) => window.__advanceClock(ms), DAY_MS);
        await setVisibility(page, 'visible');
        // The listener only sets App's `today`; the day switch follows in a
        // render, so wait for the deck to be rebuilt on Posterior's first card.
        await waitFor(page, 'the deck to roll over to Posterior', (sel) => {
            const slot = document.querySelector(sel);
            const el = slot && (slot.querySelector('.card-open-name') || slot.querySelector('.card-name'));
            return !!el && el.textContent.trim() === 'Recline Curls';
        }, ACTIVE);

        toggle = await readDayToggle(page);
        eq([toggle.active, toggle.locked, toggle.note], ['posterior-2', false, ''],
            'the next morning the toggle is unlocked, on Posterior');
        eq(await activeName(page), 'Recline Curls', 'and the deck is the Posterior day');

        // === 3. Today's first LOG =========================================
        await revealCard(page);
        ok(await logCard(page), 'logged the first Posterior card');
        await waitFor(page, 'a second session to reach history', (ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]').length === 2, NS);
        eq(await historyLength(page), 2, 'today is a new session, not yesterday\'s');
        eq((await todayWorkout(page, NS)).day, 'posterior-2', 'stamped Posterior');
        toggle = await readDayToggle(page);
        eq([toggle.active, toggle.locked, toggle.note],
            ['posterior-2', true, 'Today is Posterior. It switches after Submit Day.'], 'and locked on Posterior');

        eq(errors, [], 'no console errors');
        console.log('PASS: the day lock rolls over at midnight without a reload');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
