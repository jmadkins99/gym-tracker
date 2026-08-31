// What this test covers
// ----------------------
// That the swipe up is what starts a movement's clock in the PUBLIC app, and
// that both stamps survive into the saved workout record.
//
// The public app has computed `const timestamp = new Date().toISOString()` in
// logExercise since long before this feature — and then dropped it on the
// floor, because none of its five exerciseToSave branches copied it out. Per
// exercise time was calculated on every LOG and discarded. This case pins the
// two ends being kept.
//
// This is the case the redesign exists to satisfy. Timing runs from
// openWeightBreakdown (which stamps startedAt) to logExercise (which stamps
// loggedAt). The old screen made that first tap optional — its only reward was
// a warmup table — so it kept not happening, and movements fell back to "span
// since the previous log, minus two minutes" and reported an estimate instead
// of a measurement. On the deck the reveal is the only way to reach LOG at all,
// so a movement logged from this screen always carries a real start. Section 5
// is the pin on that.
//
// The one-anchor rule is the subtle half. openWeightBreakdown REPLACES the
// anchor map rather than merging into it, so at most one movement is anchored
// at a time. Without that, peeking at Chest Press, going and doing Shoulder
// Press, then coming back to log Chest Press attributes the Shoulder Press
// work to Chest Press.
//
// Section 3 is the pin on that, and the ORDER inside it is load-bearing: the
// walk to B happens before anything is logged. An earlier draft logged A first
// and then opened B, which cannot distinguish the two implementations at all —
// logging A drops A's anchor by itself, so the map is already empty by the time
// B opens and a merge behaves exactly like a replace. That version passed
// against a deliberately merging build.
//
// Mutation to try: spread `...prev` into saveStartTimes inside
// openWeightBreakdown. Section 3 fails on the two-key map; nothing else in the
// suite notices.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPublicApp, jessiDefaultSchedule, DEFAULT_NS } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { PUBLIC_APP_ROOT } = require('../lib/paths');
const {
    ACTIVE, goToCard, revealCard, logCard, swipe, startAnchors, todayWorkout,
} = require('../lib/deck');

const A = 'Chest Press';
const B = 'Shoulder Press';
const A_ID = 'ex-chest-press';
const B_ID = 'ex-shoulder-press';

function twoMovementConfig() {
    return {
        version: 2,
        days: {
            1: [
                { id: A_ID, name: A, category: 'Push', typeId: 'standard',
                  sets: 3, minReps: 5, maxReps: 8, order: 0,
                  startingWeight: '100', loadType: 'plate-two-sided' },
                { id: B_ID, name: B, category: 'Push', typeId: 'standard',
                  sets: 3, minReps: 5, maxReps: 8, order: 1,
                  startingWeight: '60', loadType: 'pin' },
            ],
            2: [
                { id: 'ex-row', name: 'Seated Row', category: 'Pull', typeId: 'standard',
                  sets: 3, minReps: 5, maxReps: 8, order: 0, loadType: 'pin' },
            ],
        },
        // Deliberately NOT Anterior/Posterior: those category names are what
        // the Jessi one-shots identify a "Jessi-shaped" install by, and this
        // fixture would be rewritten out from under the case.
        categories: ['Push', 'Pull'],
        // Load-bearing, not decoration. A free-type Reps field carries only a
        // placeholder, so a card nobody has typed into has no reps value and
        // logExercise rejects it on validation — meaning a one-tap LOG is
        // impossible without this, and the timing path could never be reached
        // from an untouched card. The dropdown always has a value selected,
        // which is the whole reason it exists (case 32).
        repsDropdown: { min: 5, max: 8 },
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
            exerciseConfig: twoMovementConfig(),
            schedule: jessiDefaultSchedule(),
            workoutHistory: [],
        });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), DEFAULT_NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // === 1. No anchor until the gesture ============================
        eq(Object.keys(await startAnchors(page)).length, 0,
            'nothing is anchored before any card is opened');

        await goToCard(page, A);
        await revealCard(page);
        const first = await startAnchors(page);
        eq(Object.keys(first), [A_ID],
            'swiping up stamps exactly one startedAt — the gesture reaches openWeightBreakdown');
        const stampA = first[A_ID];
        ok(stampA && !isNaN(new Date(stampA).getTime()), 'and the stamp is a real timestamp');

        // === 2. Re-revealing does not restamp ==========================
        // openWeightBreakdown returns early on the card already open. That is
        // what stops "which gesture counted?" being ambiguous.
        await new Promise((r) => setTimeout(r, 1100));
        await swipe(page, 0, -180);
        const again = await startAnchors(page);
        eq(again[A_ID], stampA,
            'swiping up again on an already-open card does NOT restart the clock');

        // === 3. One anchor at a time ===================================
        // Peek at A, walk to B, WITHOUT logging A in between. See the header:
        // logging A first would drop A's anchor by itself and make a merging
        // implementation indistinguishable from a replacing one.
        await goToCard(page, B);
        await revealCard(page);
        const bOnly = await startAnchors(page);
        eq(Object.keys(bOnly), [B_ID],
            'opening a second card REPLACES the anchor rather than adding to it — ' +
            'otherwise a stale peek at one machine swallows the work done at another');

        // Back to A. Walking away closed it, so this legitimately re-stamps:
        // the set starts now rather than at the first peek.
        await new Promise((r) => setTimeout(r, 1100));
        await goToCard(page, A);
        await revealCard(page);
        const backOnA = await startAnchors(page);
        eq(Object.keys(backOnA), [A_ID], 'and coming back re-anchors A alone');
        ok(new Date(backOnA[A_ID]) > new Date(stampA),
            'with a fresh stamp — the first peek is not what the set is measured from');
        const stampA2 = backOnA[A_ID];

        // === 4. LOG writes both stamps into the record =================
        await logCard(page);
        const workout = await todayWorkout(page);
        ok(workout, "logging created today's workout");
        const savedA = workout.exercises.find((e) => e.id === A_ID);
        ok(savedA, 'the logged movement is in the record');
        eq(savedA.startedAt, stampA2,
            'the saved start is the stamp from the most recent open, not the first peek');
        ok(savedA.loggedAt, 'loggedAt reached the saved record');
        ok(new Date(savedA.loggedAt) >= new Date(savedA.startedAt),
            'and the set ends no earlier than it starts');

        // The DOM scrape: these were never typed, they were defaults.
        ok(savedA.weight && savedA.weight !== '',
            'the prefilled weight logged rather than a blank — logExercise scrapes it ' +
            'out of the card, so the input attributes are load-bearing');
        ok(savedA.reps && savedA.reps !== '', 'and the prefilled reps logged too');

        // Un-logged movements are stubbed into the same record. They must carry
        // NO timestamps — their absence is what getSessionTiming reads to leave
        // them out entirely.
        const stubB = workout.exercises.find((e) => e.id === B_ID);
        ok(stubB, 'the un-logged movement is stubbed into the record');
        eq(stubB.loggedAt, undefined, 'an un-logged movement carries no loggedAt');
        eq(stubB.startedAt, undefined, 'and no startedAt');

        // The anchor is banked now, so it is dropped.
        eq(Object.keys(await startAnchors(page)).length, 0,
            'the anchor is cleared once it is written into the record');

        // === 5. Un-anchored logging is unreachable =====================
        // LOG exists only on the revealed face, so there is no way to record a
        // movement from this screen without a real start. That is the estimate
        // path being designed out rather than merely discouraged.
        await goToCard(page, B);
        eq(await page.$$eval(ACTIVE + ' .card-front .log-btn', (els) => els.length), 0,
            'a closed card offers no LOG button at all');

        eq(errors, [], `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: the swipe starts the clock, and both stamps reach the record.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch((err) => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
