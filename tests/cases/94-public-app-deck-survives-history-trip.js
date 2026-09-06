// What this test covers
// ----------------------
// The public app's half of the same rule case 92 pins on the personal one: a
// trip to History is a DETOUR, not a restart. Open a card, tap History, tap
// Workout — same card, still open, same clock.
//
// The deck is unmounted while History is on screen, so the position it held
// internally died with it, and the day-switch reset had no guard against
// running on MOUNT: coming back ran a day switch that had not happened, and
// you landed on card one with the panel shut.
//
// Two things are specific to this app and are why this is a separate case
// rather than a copy:
//
//   * days are numbered 1..N from the client's own program rather than the
//     personal app's two fixed types, so the reset is keyed on `currentDay`
//     and a two-day config is needed to prove a real switch still resets;
//   * the deck runs syncKeyboardChrome in an effect with no dependency array,
//     and a comment used to justify holding the index locally on the grounds
//     that a card change re-renders the deck and not App. Nothing here is
//     memoised, so App re-rendering re-renders the deck anyway — case 88 is
//     the one that would catch it if that ever stopped being true.
//
// The anchor assertion is the one with teeth. `startedAt` is stamped when the
// panel opens and is what session timing measures from, so a reveal that
// survived visually but re-stamped its clock would be worse than the bug: the
// deck would look right and every duration through it would be short.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPublicApp } = require('../lib/state');
const { PUBLIC_APP_ROOT } = require('../lib/paths');
const {
    bottomNav, deckIndex, activeName, isRevealed, revealCard,
    selectDeckDay, startAnchors, stepTo, swipe,
} = require('../lib/deck');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';

const ex = (id, name, order) => ({
    id, name, category: 'Push', order, type: 'standard', minReps: 5, maxReps: 8,
});

// Two days, so the day-switch reset has something real to switch between.
function publicConfig() {
    return {
        version: 2,
        categories: ['Push'],
        minimalistPrTracking: true,
        days: {
            1: [ex('a1', 'Chest Press', 0), ex('a2', 'Incline Press', 1), ex('a3', 'Chest Flies', 2)],
            2: [ex('b1', 'Lat Pulldown', 0), ex('b2', 'Seated Row', 1)],
        },
    };
}

function twoDaySchedule() {
    return {
        version: 2,
        scheduleIsExplicit: true,
        totalWorkoutDays: 2,
        workoutDays: [
            'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
        ].map(dayOfWeek => ({ dayOfWeek, workoutDayNumber: 1 })),
    };
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPublicApp(page, {
            exerciseConfig: publicConfig(),
            schedule: twoDaySchedule(),
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // === 1. An open card survives the round trip ====================
        // Card 3, not card 1: landing on the right card by accident is exactly
        // what the old behaviour did.
        await stepTo(page, 3);
        const name = await activeName(page);
        ok(await revealCard(page), 'the card opened');

        const anchorsBefore = await startAnchors(page, NS);
        const anchored = Object.keys(anchorsBefore);
        eq(anchored.length, 1, 'opening the panel stamped exactly one anchor');

        await bottomNav(page, 'History');
        eq(await page.evaluate(() => !!document.querySelector('.deck-stage')), false,
            'the deck is gone while History is up — the state under test is not its own');

        await bottomNav(page, 'Workout');
        eq(await deckIndex(page), 3, 'back on the same card, not card one');
        eq(await activeName(page), name, 'and it is the same exercise by name');
        ok(await isRevealed(page), 'still open, so the set can be logged without swiping again');

        const anchorsAfter = await startAnchors(page, NS);
        eq(Object.keys(anchorsAfter), anchored, 'the same anchor, not a second one');
        eq(anchorsAfter[anchored[0]], anchorsBefore[anchored[0]],
            'and the clock was never restarted — the timing this screen captures is intact');

        // === 2. A real day switch still resets ==========================
        // The guard is on mounting, not on switching. If it covered both, an
        // index into day 1 would survive into a day 2 roster half its length.
        await selectDeckDay(page, 2);
        eq(await deckIndex(page), 1, 'switching day goes back to the first card');
        eq(await isRevealed(page), false, 'and closes the open panel');

        // === 3. Swiping away still closes, even if History interrupts ===
        await selectDeckDay(page, 1);
        await stepTo(page, 2);
        const second = await activeName(page);
        ok(await revealCard(page), 'opened the card to swipe off');

        // Leave it, then go to History INSIDE the 300ms collapse window, so the
        // unmount is what has to finish the close.
        await swipe(page, -220, 0, { steps: 4, settle: 40 });
        await bottomNav(page, 'History');
        await bottomNav(page, 'Workout');

        await stepTo(page, 2);
        eq(await activeName(page), second, 'back on the card that was swiped away from');
        eq(await isRevealed(page), false,
            'which is shut: leaving a card closes it whether or not History interrupted');

        eq(errors, [], 'no console errors');
        console.log('PASS: History is a detour on the public app too — card, panel and clock all survive it.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
