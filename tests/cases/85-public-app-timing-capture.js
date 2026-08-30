// What this test covers
// ----------------------
// That opening the Weight Breakdown starts a movement's clock in the PUBLIC
// app, and that both stamps survive into the saved workout record.
//
// The public app has computed `const timestamp = new Date().toISOString()` in
// logExercise since long before this feature — and then dropped it on the
// floor, because none of its five exerciseToSave branches copied it out. Per
// exercise time was calculated on every LOG and discarded. This case pins the
// two ends being kept.
//
// The button becomes ONE-WAY as part of this. It used to toggle:
//
//     onClick={() => setExpandedWeightBreakdown(isExpanded ? null : exercise.id)}
//
// with a 'Hide' label on the open arm. A toggle makes "which tap started the
// set?" ambiguous, and a close-then-reopen would either restart a clock that
// should not restart or keep a stale one — there is no reading of a Hide tap
// that is right for timing. So the arm goes, matching the personal app, and
// this case pins its absence rather than leaving it to be re-added by someone
// who reads the removal as an accident.
//
// The one-anchor rule is the subtle half. openWeightBreakdown REPLACES the
// anchor map rather than merging into it, so at most one movement is anchored
// at a time. Without that, peeking at Chest Press, going and doing Shoulder
// Press, then coming back to log Chest Press attributes the Shoulder Press
// work to Chest Press.
//
// Section 3 is the pin on that, and the ORDER inside it is load-bearing: the
// walk to B happens before anything is logged. An earlier draft of this case
// logged A first and then opened B, which cannot distinguish the two
// implementations at all — logging A drops A's anchor by itself, so the map is
// already empty by the time B opens and a merge behaves exactly like a
// replace. That version passed against a deliberately merging build.
//
// Mutation to try: spread `...prev` into saveStartTimes inside
// openWeightBreakdown. Section 3 fails on the two-key map; nothing else in the
// suite notices.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, waitFor } = require('../lib/browser');
const { seedPublicApp, jessiDefaultSchedule, DEFAULT_NS } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { PUBLIC_APP_ROOT } = require('../lib/paths');

const A = 'ex-chest-press';
const B = 'ex-shoulder-press';

function twoMovementConfig() {
    return {
        version: 2,
        days: {
            1: [
                { id: A, name: 'Chest Press', category: 'Anterior', typeId: 'standard',
                  sets: 3, minReps: 5, maxReps: 8, order: 0,
                  startingWeight: '100', loadType: 'plate-two-sided' },
                { id: B, name: 'Shoulder Press', category: 'Anterior', typeId: 'standard',
                  sets: 3, minReps: 5, maxReps: 8, order: 1,
                  startingWeight: '60', loadType: 'pin' },
            ],
            2: [
                { id: 'ex-row', name: 'Seated Row', category: 'Posterior', typeId: 'standard',
                  sets: 3, minReps: 5, maxReps: 8, order: 0, loadType: 'pin' },
            ],
        },
        categories: ['Anterior', 'Posterior'],
    };
}

const anchors = (page) => page.evaluate((ns) => {
    const raw = localStorage.getItem(ns + 'exerciseStartTimes');
    return raw ? JSON.parse(raw) : null;
}, DEFAULT_NS);

const todayWorkout = (page) => page.evaluate((ns) => {
    const hist = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]');
    const today = new Date().toDateString();
    return hist.find(w => new Date(w.date).toDateString() === today) || null;
}, DEFAULT_NS);

async function openBreakdown(page, id) {
    await page.evaluate((exId) => {
        const btn = document.querySelector(`[data-gympin-breakdown-button="${exId}"]`);
        if (btn) btn.click();
    }, id);
    await new Promise(r => setTimeout(r, 150));
}

async function logMovement(page, id) {
    await page.evaluate((exId) => {
        const card = document.querySelector(`[data-exercise-id="${exId}"]`);
        const btn = card && card.querySelector('.log-btn');
        if (btn) btn.click();
    }, id);
    await new Promise(r => setTimeout(r, 250));
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
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
        await waitFor(page, 'the Anterior card to render',
            (id) => !!document.querySelector(`[data-exercise-id="${id}"]`), A);

        // === 1. Nothing is anchored until the button is pressed ========
        eq(await anchors(page), null, 'nothing is anchored before any breakdown is opened');

        await openBreakdown(page, A);
        const first = await anchors(page);
        ok(first, 'opening the Weight Breakdown wrote an anchor');
        eq(Object.keys(first.times), [A],
            'exactly one movement is anchored, and it is the one opened');
        eq(first.date, new Date().toDateString(),
            'the anchor map is stamped with today, so yesterday cannot leak in');
        const stampA = first.times[A];
        ok(stampA && !isNaN(new Date(stampA).getTime()), 'and the stamp is a real timestamp');

        // === 2. The button is one-way: no Hide arm =====================
        const label = await page.evaluate((exId) =>
            document.querySelector(`[data-gympin-breakdown-button="${exId}"]`)
                .textContent.trim(), A);
        ok(!/hide/i.test(label),
            `an open card's button does not offer Hide (got "${label}") — a toggle makes ` +
            'it ambiguous which tap started the set');

        await new Promise(r => setTimeout(r, 1100));
        await openBreakdown(page, A);
        const again = await anchors(page);
        eq(again.times[A], stampA,
            'pressing it again on the already-open card does NOT restart the clock');
        const panelStillOpen = await page.evaluate((exId) =>
            !!document.querySelector(`[data-gympin-breakdown-panel="${exId}"]`), A);
        ok(panelStillOpen,
            'and the panel is still open rather than having been toggled shut');

        // === 3. One anchor at a time ===================================
        // Peek at A, walk to B, WITHOUT logging A in between. See the header:
        // logging A first would drop A's anchor by itself and make a merging
        // implementation indistinguishable from a replacing one.
        await openBreakdown(page, B);
        const bOnly = await anchors(page);
        eq(Object.keys(bOnly.times), [B],
            'opening a second card REPLACES the anchor rather than adding to it — ' +
            'otherwise a stale peek at one machine swallows the work done at another');

        // Back to A. The early return only blocks re-pressing the card already
        // open, so this legitimately re-stamps: you walked away and came back,
        // and the set starts now rather than at the first peek.
        await new Promise(r => setTimeout(r, 1100));
        await openBreakdown(page, A);
        const backOnA = await anchors(page);
        eq(Object.keys(backOnA.times), [A], 'and coming back re-anchors A alone');
        ok(new Date(backOnA.times[A]) > new Date(stampA),
            'with a fresh stamp — the first peek is not what the set is measured from');
        const stampA2 = backOnA.times[A];

        // === 4. LOG writes both stamps into the record =================
        await logMovement(page, A);
        const workout = await todayWorkout(page);
        ok(workout, "logging created today's workout");
        const savedA = workout.exercises.find(e => e.id === A);
        ok(savedA, 'the logged movement is in the record');
        eq(savedA.startedAt, stampA2,
            'the saved start is the stamp from the most recent open, not the first peek');
        ok(savedA.loggedAt, 'loggedAt reached the saved record');
        ok(new Date(savedA.loggedAt) >= new Date(savedA.startedAt),
            'and the set ends no earlier than it starts');

        // Un-logged movements are stubbed into the same record. They must carry
        // NO timestamps — their absence is what getSessionTiming reads to leave
        // them out entirely.
        const stubB = workout.exercises.find(e => e.id === B);
        ok(stubB, 'the un-logged movement is stubbed into the record');
        eq(stubB.loggedAt, undefined, 'an un-logged movement carries no loggedAt');
        eq(stubB.startedAt, undefined, 'and no startedAt');

        // The anchor is banked now, so it is dropped.
        const afterLog = await anchors(page);
        ok(!afterLog || !afterLog.times[A],
            'the anchor is cleared once it is written into the record');

        // === 5. The next movement measures itself ======================
        await openBreakdown(page, B);
        await logMovement(page, B);
        const after = await todayWorkout(page);
        const savedB = after.exercises.find(e => e.id === B);
        ok(savedB.startedAt, 'B logged with its own start');
        ok(new Date(savedB.startedAt) > new Date(savedA.startedAt),
            'and it is B own stamp, not the one A left behind');

        eq(errors, [], `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: the Weight Breakdown starts the clock and both stamps reach the record.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
