// What this test covers
// ----------------------
// That the swipe up is what starts the clock, and that both stamps survive to
// the saved record.
//
// This is the case the whole redesign exists to satisfy. Session timing runs
// from `openWeightBreakdown` (which stamps `startedAt`) to `logExercise` (which
// stamps `loggedAt`). The old screen made that first tap optional — its only
// reward was a warmup table — so it kept not happening, and movements fell back
// to "span since the previous log, minus two minutes", rendered an asterisk,
// and reported an estimate instead of a measurement.
//
// What this pins is that the GESTURE reaches that code, and that the deck makes
// the un-anchored path unreachable: LOG exists only on the revealed face, so a
// movement logged from this screen always carries a real start.
//
// The reveal is derived from `expandedWeightBreakdown` rather than held in the
// deck, which is what makes the one-way-open rule and the anchor reset come
// across unchanged — so this also checks re-revealing an already-open card does
// NOT restamp, exactly as re-tapping the old button did not.
//
// This REPLACES 65-personal-app-exercise-timing-capture, which was written
// against the Weight Breakdown button. Almost all of it was about that button —
// that it was one-way, that it had no Hide arm, that re-tapping an open card
// changed nothing, that opening another card closed the first. Those are
// gesture properties now and are asserted here and in case 75. Its remaining
// half logged a movement with no anchor, which the deck makes unreachable: LOG
// exists only on the revealed face. The arithmetic for an un-anchored movement
// is still pinned by cases 66 and 70, neither of which needs the UI to make one.
//
// Mutation to try: drop `data-exercise-id` from the card root, or the
// `inputmode="decimal"` from the weight input. Both make logExercise's DOM
// scrape miss, every prefilled value logs blank, and nothing else in the suite
// notices.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const {
    ACTIVE, DEFAULT_NS, revealCard, logCard, activeName,
    selectDeckDay, startAnchors, todayWorkout, swipe,
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
        await seedPersonalApp(page, {
            workoutHistory: [{
                date: new Date(Date.now() - 86400000).toISOString(),
                day: 'anterior', week: 1, submitted: true, plateauBusters: [],
                exercises: [{ id: 'chest-press', name: 'Chest Press', category: 'Anterior',
                              type: 'standard', weight: '200', reps: '6' }],
            }],
        });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), DEFAULT_NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDeckDay(page, 'anterior');

        // === 1. No anchor until the gesture ============================
        eq(Object.keys(await startAnchors(page)).length, 0,
            'nothing is anchored before the card is opened');

        const name = await activeName(page);
        await revealCard(page);
        const anchors = await startAnchors(page);
        eq(Object.keys(anchors).length, 1,
            'swiping up stamps exactly one startedAt — the gesture reaches openWeightBreakdown');
        const firstStamp = anchors[Object.keys(anchors)[0]];
        ok(firstStamp, 'and the stamp is a real timestamp');

        // === 2. Re-revealing does not restamp ==========================
        // openWeightBreakdown returns early on the card already open. That is
        // what stops "which tap counted?" being ambiguous, and it has to
        // survive being driven by a gesture rather than a button.
        await new Promise((r) => setTimeout(r, 1100));
        await swipe(page, 0, -180);
        const again = await startAnchors(page);
        eq(again[Object.keys(again)[0]], firstStamp,
            'swiping up again on an already-open card does NOT restart the clock');

        // === 3. LOG writes both stamps, with the prefilled values ======
        await logCard(page);
        const workout = await todayWorkout(page);
        ok(workout, 'logging created today\'s workout');

        const logged = workout.exercises.filter((e) => e.loggedAt);
        eq(logged.length, 1, 'exactly one movement is logged');
        eq(logged[0].name, name, 'and it is the card that was open');
        ok(logged[0].startedAt, 'startedAt reached the saved record');
        ok(logged[0].loggedAt, 'loggedAt reached the saved record');
        eq(logged[0].startedAt, firstStamp,
            'the saved start is the one the swipe stamped, not a fresh one');
        ok(new Date(logged[0].loggedAt) > new Date(logged[0].startedAt),
            'and the set ends after it starts');

        // The DOM scrape: these were never typed, they were defaults.
        ok(logged[0].weight && logged[0].weight !== '',
            'the prefilled weight logged rather than a blank — logExercise scrapes it ' +
            'out of the card, so the input attributes are load-bearing');
        ok(logged[0].reps && logged[0].reps !== '',
            'and the prefilled reps logged rather than a blank');

        // === 4. The anchor is dropped once it is banked ================
        eq(Object.keys(await startAnchors(page)).length, 0,
            'the anchor is cleared after logging — it lives in the workout record now, ' +
            'so a second log of the same movement measures itself afresh');

        // === 5. Un-anchored logging is unreachable =====================
        // LOG only exists on the revealed face, so there is no way to record a
        // movement from this screen without a real start. That is the estimate
        // path being designed out rather than merely discouraged.
        eq(await page.$$eval(ACTIVE + ' .card-front .log-btn', (els) => els.length), 0,
            'a closed card offers no LOG button at all');

        eq(errors.length, 0, `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: the swipe starts the clock, and both stamps reach the record.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
