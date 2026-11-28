// What this test covers
// ----------------------
// History as a swipe deck of History cards (#38): one card per calendar date,
// from the date of the first session ever logged through today.
//
//   (0) With no sessions at all, the deck is a single rest card for today.
//   (1) It opens on today. Today has no session, so the card is a rest day:
//       the date and "No workout", with no day label, Edit or Time, and the
//       forward controls are disabled.
//   (2) ‹ and › move one date; a session's card shows its full date and day
//       label ("Posterior"), and no "Day N" counter.
//   (3) "← Week" and "Week →" move exactly 7 calendar dates, and a jump that
//       would pass the first date stops on it; at either end the buttons that
//       point off the deck are disabled.
//   (4) A horizontal swipe moves one date each way; a vertical drag does not
//       move the deck.
//   (5) Time and Edit on a past card open that session's modals.
//   (6) Tapping the History tab, from Workout or from History itself, puts the
//       deck back on today.
//   (7) When the date rolls over with History open, the deck gains the new
//       today at the end and stays on the card being read.
//
// The clock starts at Wed 25 Nov 2026, noon in the harness's Phoenix time zone,
// and can be pushed forward by the case, as in case 145.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, tap, waitFor } = require('../lib/browser');
const { bottomNav, swipe } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { HISTORY_CARD, HISTORY_SESSION, shownDate, footDisabled, historyPress, historyGoTo } = require('../lib/history');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const START = Date.parse('2026-11-25T12:00:00-07:00');
const DAY_MS = 24 * 60 * 60 * 1000;

const CURLS = 'biceps-elbow-flexion-with-shoulder-extension';
const FLIES = 'pecs-transverse-shoulder-adduction';

function history() {
    return [
        // The first session ever logged: the deck's first card.
        workoutEntry({ date: '2026-11-02T09:00:00-07:00', day: 'posterior-2',
            exercises: [{ id: CURLS, weight: '100', reps: '6' }] }),
        // Carries loggedAt, so its card offers Time.
        workoutEntry({ date: '2026-11-18T09:00:00-07:00', day: 'anterior-2',
            exercises: [{ id: FLIES, weight: '80', reps: '7',
                startedAt: '2026-11-18T09:00:00-07:00', loggedAt: '2026-11-18T09:04:00-07:00' }] }),
        workoutEntry({ date: '2026-11-24T09:00:00-07:00', day: 'posterior-2',
            exercises: [{ id: CURLS, weight: '105', reps: '6' }] }),
    ];
}

const readCard = (page) => page.evaluate((card, session) => {
    const el = document.querySelector(card);
    const btns = el ? Array.from(el.querySelectorAll('button')).map((b) => b.textContent.trim()) : [];
    return {
        date: el && el.getAttribute('data-history-date'),
        session: !!document.querySelector(session),
        heading: (el && el.querySelector('.history-date-full') || {}).textContent || null,
        label: (el && el.querySelector('.history-day-label') || {}).textContent || null,
        text: el ? el.textContent : '',
        buttons: btns,
    };
}, HISTORY_CARD, HISTORY_SESSION);

const disabled = async (page) => ({
    back: await footDisabled(page, 'back'), prev: await footDisabled(page, 'prev'),
    next: await footDisabled(page, 'next'), forward: await footDisabled(page, 'forward'),
});

async function setVisibility(page, state) {
    await page.evaluate((s) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
        document.dispatchEvent(new Event('visibilitychange'));
    }, state);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.evaluateOnNewDocument((startMs) => {
            const RealDate = Date;
            let offset = startMs - RealDate.now();
            class ShiftedDate extends RealDate {
                constructor(...args) {
                    if (args.length === 0) super(RealDate.now() + offset);
                    else super(...args);
                }
                static now() { return RealDate.now() + offset; }
            }
            window.Date = ShiftedDate;
            window.__advanceClock = (ms) => { offset += ms; };
        }, START);

        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // === (0) No sessions at all: one rest card, today =================
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate((ns) => localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await bottomNav(page, 'History');
        eq(await shownDate(page), '2026-11-25', 'with no sessions History is today');
        ok((await readCard(page)).text.indexOf('No workout') !== -1, 'a rest day');
        eq(await disabled(page), { back: true, prev: true, next: true, forward: true },
            'and the only card, so every footer button is disabled');

        await seedPersonalApp(page, { workoutHistory: history() });
        await page.evaluate((ns) => localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // === (1) Opens on today, a rest day ================================
        await bottomNav(page, 'History');
        eq(await shownDate(page), '2026-11-25', 'History opens on today');
        let card = await readCard(page);
        ok(!card.session, 'today has no session');
        ok(card.text.indexOf('No workout') !== -1, 'a rest day reads "No workout"');
        eq(card.heading, 'Wednesday, November 25, 2026', 'with its full date');
        eq(card.label, null, 'and no day label');
        eq(card.buttons, [], 'and no Edit or Time');
        eq(await disabled(page), { back: false, prev: false, next: true, forward: true },
            'on today only the backward controls are live');

        // === (2) One date back: a session card ============================
        await historyPress(page, 'prev');
        eq(await shownDate(page), '2026-11-24', '‹ moves back one date');
        card = await readCard(page);
        ok(card.session, '24 Nov has its session');
        eq(card.heading, 'Tuesday, November 24, 2026', 'the card shows the full date');
        eq(card.label, 'Posterior', 'and the session\'s day label');
        ok(!/Day \d/.test(card.text), 'and no "Day N" counter');
        eq(card.buttons, ['Edit'], 'a session without timestamps offers Edit only');
        eq(await page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).overflowY, HISTORY_CARD),
            'auto', 'a card taller than the stage scrolls inside itself instead of clipping');

        // === (3) 7-day jumps ===============================================
        await historyPress(page, 'back');
        eq(await shownDate(page), '2026-11-17', '← Week moves exactly 7 dates');
        ok((await readCard(page)).text.indexOf('No workout') !== -1, '17 Nov is a rest day');
        await historyPress(page, 'forward');
        eq(await shownDate(page), '2026-11-24', 'Week → moves exactly 7 dates forward');
        await historyPress(page, 'forward');
        eq(await shownDate(page), '2026-11-25', 'a jump that would pass today stops on today');

        await historyGoTo(page, '2026-11-05');
        await historyPress(page, 'back');
        eq(await shownDate(page), '2026-11-02', 'a jump that would pass the first date stops on it');
        eq((await readCard(page)).label, 'Posterior', 'the first card is the first session');
        eq(await disabled(page), { back: true, prev: true, next: false, forward: false },
            'on the first date only the forward controls are live');
        await historyPress(page, 'forward');
        eq(await shownDate(page), '2026-11-09', 'Week → from the first date moves 7');

        // === (4) Swipes ====================================================
        await historyGoTo(page, '2026-11-18');
        await swipe(page, -220, 0);
        eq(await shownDate(page), '2026-11-19', 'a swipe left moves forward one date');
        await swipe(page, 220, 0);
        eq(await shownDate(page), '2026-11-18', 'a swipe right moves back one date');
        await swipe(page, 0, -160);
        eq(await shownDate(page), '2026-11-18', 'a vertical drag does not move the deck');

        // === (5) Time and Edit =============================================
        card = await readCard(page);
        eq(card.label, 'Anterior', '18 Nov is the Anterior session');
        eq(card.buttons, ['Time', 'Edit'], 'a timed session offers Time and Edit');
        await tap(page, HISTORY_CARD + ' .text-btn', { text: 'Time' });
        await waitFor(page, 'the Time details modal', () => !!document.querySelector('[data-timing-total]'));
        await tap(page, '.modal-btn.primary');
        await waitFor(page, 'the Time details modal to close', () => !document.querySelector('.modal-overlay'));
        await tap(page, HISTORY_CARD + ' .text-btn', { text: 'Edit' });
        await waitFor(page, 'the Edit modal for 18 Nov', () => {
            const t = document.querySelector('.modal-title');
            return !!t && t.textContent.indexOf('Edit Workout') !== -1;
        });
        await page.evaluate(() => document.querySelector('.modal-overlay').dispatchEvent(new MouseEvent('click', { bubbles: true })));
        await waitFor(page, 'the Edit modal to close', () => !document.querySelector('.modal-overlay'));
        eq(await shownDate(page), '2026-11-18', 'the deck stays on the card after the modals');

        // === (6) The History tab puts it back on today =====================
        await bottomNav(page, 'History');
        eq(await shownDate(page), '2026-11-25', 'tapping History while on History returns to today');
        await historyGoTo(page, '2026-11-20');
        await bottomNav(page, 'Workout');
        await bottomNav(page, 'History');
        eq(await shownDate(page), '2026-11-25', 'coming back from Workout opens on today');

        // === (7) Midnight with History open ================================
        await historyGoTo(page, '2026-11-20');
        await page.evaluate((ms) => window.__advanceClock(ms), DAY_MS);
        await setVisibility(page, 'hidden');
        await setVisibility(page, 'visible');
        await waitFor(page, 'the deck to gain 26 Nov', () => {
            const n = document.querySelector('.history-foot [aria-label="Next day"]');
            return !!n && !n.disabled;
        });
        eq(await shownDate(page), '2026-11-20', 'the rollover leaves you on the card you were reading');
        await historyGoTo(page, '2026-11-26');
        ok((await readCard(page)).text.indexOf('No workout') !== -1, 'the new today is a rest day');
        eq((await disabled(page)).forward, true, 'and is the deck\'s last card');

        // Another midnight passes with the app on screen (no visibilitychange):
        // a tap on History still opens on the real today.
        await page.evaluate((ms) => window.__advanceClock(ms), DAY_MS);
        await bottomNav(page, 'History');
        await waitFor(page, 'History to open on 27 Nov',
            () => (document.querySelector('[data-history-shown]') || {}).getAttribute?.('data-history-shown') === '2026-11-27');

        eq(errors, [], 'no page errors');
        console.log('PASS');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error("FAIL:", err.message);
    console.error(err);
    process.exit(1);
});
