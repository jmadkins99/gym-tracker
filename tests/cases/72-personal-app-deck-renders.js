// What this test covers
// ----------------------
// What the swipe deck puts on screen, and — more importantly — what it does
// NOT.
//
// The workout screen is one exercise at a time. The front of a card is the
// exercise name and nothing else: no weight, no last session, no streak, no
// digit of any kind. That emptiness is not a style choice, it is the entire
// mechanism. Session timing runs from the Weight Breakdown tap to the LOG, and
// that tap kept not happening because its only reward was a warmup table.
// Putting the working weight behind the same gesture fixes the incentive: you
// cannot see what to load without opening the card, so the clock cannot go
// unstarted. Case 74 proves the stamp; this one proves there is nothing to read
// without making the gesture.
//
// The strongest assertion here is the negative one — no digits on the front
// face. A card that leaked "Last: 200lbs × 6" would still look fine and would
// quietly remove every reason to swipe up, and the damage would show up weeks
// later as asterisked estimates in the Day Breakdown rather than as a bug.
//
// Also pins the surrounding chrome the other cases navigate by: the bottom nav
// (Workout / History), the day toggle, and the "n of m" counter.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { HISTORY_SESSION, dateKey, historyGoTo } = require('../lib/history');
const { eq, ok, contains } = require('../lib/assert');
const {
    ACTIVE, DEFAULT_NS, revealCard, activeName, deckPosition, selectDeckDay, bottomNav,
} = require('../lib/deck');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
// Fixed once, so a run that crosses midnight still visits the date it seeded.
const YESTERDAY = new Date(Date.now() - 86400000);

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // A previous session, so there is genuinely something the front face
        // could leak if it wanted to.
        await seedPersonalApp(page, {
            workoutHistory: [{
                date: YESTERDAY.toISOString(),
                day: 'anterior', week: 1, submitted: true, plateauBusters: [],
                exercises: [
                    // Whatever leads the day has to be in here: section 3
                    // below asserts the OPEN card shows last session's weight,
                    // so the active card needs history to show. Recline Curls
                    // leads the Posterior day (v28, Nov 2026), so its 130 is
                    // the number section 3 looks for. The session's old
                    // 'anterior' day is another program's, so it does not
                    // decide the day; the case picks Posterior itself.
                    { id: 'triceps-elbow-extension', name: 'Tricep Extensions', category: 'Anterior',
                      type: 'standard', weight: '200', reps: '6' },
                    { id: 'pecs-transverse-shoulder-adduction-with-elbow-extension', name: 'Chest Press', category: 'Anterior',
                      type: 'standard', weight: '110', reps: '5' },
                    { id: 'biceps-elbow-flexion-with-shoulder-extension', name: 'Recline Curls', category: 'Anterior',
                      type: 'standard', weight: '130', reps: '5' },
                ],
            }],
        });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), DEFAULT_NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDeckDay(page, 'posterior-2');

        // === 1. One card, not a list ===================================
        eq(await page.$$eval('.deck-slot', (els) => els.length) >= 1, true,
            'the deck mounts at least the active card');
        eq(await page.$$eval(ACTIVE + ' .card', (els) => els.length), 1,
            'exactly one card is active at a time — this is not a list any more');

        // === 2. The front face is a nameplate ==========================
        ok(await page.$(ACTIVE + ' .card-front'), 'the active card starts closed');
        const front = await page.evaluate((sel) =>
            document.querySelector(sel + ' .card-front').innerText, ACTIVE);

        // Recline Curls leads the Posterior day since v28 (Nov 2026).
        eq(await activeName(page), 'Recline Curls', 'it names the first movement of the day');
        eq(/\d/.test(front), false,
            'THE POINT: no digit appears on the front face — no weight, no reps, no ' +
            'last session. Leaking any of them removes the reason to swipe up, and ' +
            'the loss shows up later as estimated timings rather than as a bug');
        contains(front.toLowerCase(), 'swipe up', 'and it says how to open the card');

        eq(await page.$$eval(ACTIVE + ' .card input, ' + ACTIVE + ' .card select',
            (els) => els.length), 0,
            'no inputs exist until the card is opened, so LOG cannot be reached without ' +
            'the gesture that starts the clock');
        eq(await page.$$eval(ACTIVE + ' .breakdown', (els) => els.length), 0,
            'and no warmup breakdown is visible either');

        // === 3. Opening it reveals the numbers =========================
        await revealCard(page);
        ok(await page.$(ACTIVE + ' .card-open'), 'swiping up opens the card');
        ok(await page.$(ACTIVE + ' .hero-weight'), 'the working weight appears');
        ok(await page.$(ACTIVE + ' .breakdown'), 'the warmup breakdown appears');
        ok(await page.$(ACTIVE + ' input[type="number"][inputmode="decimal"]'),
            'the weight input appears, with the attributes logExercise scrapes');
        ok(await page.$(ACTIVE + ' select[data-field="reps"]'),
            'the reps select appears, with the data-field logExercise scrapes');
        ok(await page.$(ACTIVE + ' .card[data-exercise-id]'),
            'the card root still carries data-exercise-id, which is how logExercise ' +
            'finds untouched default values');
        contains(await page.evaluate((sel) =>
            document.querySelector(sel + ' .card-last').textContent, ACTIVE),
            '130', 'last session shows once the card is open, not before');

        // === 4. The chrome the rest of the suite navigates by ==========
        eq(await page.$$eval('.bottom-nav-btn', (els) =>
            els.map((e) => e.textContent.replace(/[^A-Za-z]/g, ''))),
            ['Workout', 'History'], 'the nav sits at the bottom with two tabs');
        // The day toggle moved to Settings in Nov 2026 (case 143 covers it
        // there), so the workout screen carries no day hooks of its own.
        eq(await page.$$eval('[data-day-type]', (els) => els.length), 0,
            'the workout screen renders no day toggle');
        // Derived: the roster has changed size several times already.
        const dayCount = await page.evaluate(() =>
            DEFAULT_EXERCISES.filter((e) => e.day === 'posterior-2').length);
        eq(await deckPosition(page), '1 of ' + dayCount,
            'the counter reports position in the day');

        // === 5. History still reachable ================================
        await bottomNav(page, 'History');
        // History opens on today, a rest day; the seeded session is yesterday's.
        await historyGoTo(page, dateKey(YESTERDAY));
        ok(await page.$(HISTORY_SESSION), 'the History tab still renders past sessions');
        await bottomNav(page, 'Workout');
        ok(await page.$('.deck-stage'), 'and the deck comes back');

        eq(errors.length, 0, `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: the deck shows one exercise, and its front face gives nothing away.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
