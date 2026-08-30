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
const { eq, ok, contains } = require('../lib/assert');
const {
    ACTIVE, DEFAULT_NS, revealCard, activeName, deckPosition, selectDeckDay, bottomNav,
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

        // A previous session, so there is genuinely something the front face
        // could leak if it wanted to.
        await seedPersonalApp(page, {
            workoutHistory: [{
                date: new Date(Date.now() - 86400000).toISOString(),
                day: 'anterior', week: 1, submitted: true, plateauBusters: [],
                exercises: [
                    { id: 'chest-press', name: 'Chest Press', category: 'Anterior',
                      type: 'standard', weight: '200', reps: '6' },
                    { id: 'incline-chest-press', name: 'Incline Chest Press', category: 'Anterior',
                      type: 'standard', weight: '110', reps: '5' },
                ],
            }],
        });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), DEFAULT_NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDeckDay(page, 'anterior');

        // === 1. One card, not a list ===================================
        eq(await page.$$eval('.deck-slot', (els) => els.length) >= 1, true,
            'the deck mounts at least the active card');
        eq(await page.$$eval(ACTIVE + ' .card', (els) => els.length), 1,
            'exactly one card is active at a time — this is not a list any more');

        // === 2. The front face is a nameplate ==========================
        ok(await page.$(ACTIVE + ' .card-front'), 'the active card starts closed');
        const front = await page.evaluate((sel) =>
            document.querySelector(sel + ' .card-front').innerText, ACTIVE);

        eq(await activeName(page), 'Chest Press', 'it names the first Anterior movement');
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
            '200', 'last session shows once the card is open, not before');

        // === 4. The chrome the rest of the suite navigates by ==========
        eq(await page.$$eval('.bottom-nav-btn', (els) =>
            els.map((e) => e.textContent.replace(/[^A-Za-z]/g, ''))),
            ['Workout', 'History'], 'the nav sits at the bottom with two tabs');
        eq(await page.$$eval('[data-day-type]', (els) =>
            els.map((e) => e.getAttribute('data-day-type'))),
            ['anterior', 'posterior'], 'the day toggle keeps its data-day-type hooks');
        eq(await deckPosition(page), '1 of 12', 'the counter reports position in the day');

        // === 5. History still reachable ================================
        await bottomNav(page, 'History');
        ok(await page.$('.history-item'), 'the History tab still renders past sessions');
        await bottomNav(page, 'Workout');
        ok(await page.$('.deck-stage'), 'and the deck comes back');

        eq(errors.length, 0, `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: the deck shows one exercise, and its front face gives nothing away.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
