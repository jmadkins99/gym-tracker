// What this test covers
// ----------------------
// Which Weight Breakdown tap starts an exercise's clock when there is more than
// one: the LAST one before the log, not the first.
//
// This is the case that should have existed first. The feature shipped to a
// gym floor with first-open-wins, on the reasoning that a one-way button cannot
// be opened twice — and that reasoning is wrong. It cannot be opened twice in a
// ROW (a tap on the already-open card is a no-op, and case 65 pins that), but
// opening any OTHER card closes this one, so walking back to a machine is a
// genuine second open. Under first-open-wins the clock kept running across
// everything done in between, and five seconds of work reported as 2:11, then
// 3:22 on the next attempt — a duration that only ever grew.
//
// Coming back to a machine is not an edge case. It is what happens when the one
// you wanted was taken, or when you do something else first. So this case walks
// that path directly: open A, go to B, come back to A, log A.
//
// The assertions compare against the timestamps the app itself mirrored to
// localStorage rather than against elapsed wall-clock time, so they are exact
// rather than approximate.
//
// The same bug had a second route, which the first fix did not close: going
// away and NEVER reopening the panel, just tapping LOG. The anchor outlived the
// panel, so the movement measured from the abandoned tap and swallowed whatever
// was done in between — peek at Chest Press, go do Incline, tap LOG on Chest
// Press, and Incline's work was reported as part of the Chest Press set. An
// anchor now belongs to whichever panel is OPEN and is discarded when another
// card is opened, so that log has no anchor and honestly reports an estimate.
//
// It also pins the two resets the bug exposed:
//
//   - Logging a movement drops its anchor. Submitting a day re-enables every
//     LOG button, so a movement CAN be logged twice; the second one must not
//     reach back to the first one's panel tap.
//   - Submitting a day clears the whole map, for the same reason
//     loggedExercises and workoutData are cleared there.
//
// Mutation: restore `if (prev[exerciseId]) return prev;` in
// openWeightBreakdown and this case fails on the very first assertion, with the
// revisit still carrying the original stamp. Case 65 stays green, which is
// exactly how the bug got out.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType, waitFor } = require('../lib/browser');
const { goToCardById, revealCard, isRevealed, logCard, submitDay } = require('../lib/deck');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

// Enough that two stamps taken either side of it are distinguishable at
// millisecond resolution by a wide margin.
const GAP_MS = 1100;

// Opening a card's breakdown and logging it are both gestures now: the
// breakdown is the card's revealed face, and LOG only exists there. The reveal
// is still the thing that stamps startedAt, which is what this case is about.
async function clickCardButton(page, id, label) {
    await goToCardById(page, id);
    if (/breakdown/i.test(label)) {
        await revealCard(page);
        ok(await isRevealed(page), `opened ${id} (the swipe that starts its clock)`);
    } else {
        await revealCard(page);
        ok(await logCard(page), `logged ${id}`);
    }
}

// The anchors the app has mirrored to device-local storage, which are the same
// values logExercise stamps onto the saved exercise.
async function anchors(page) {
    return page.evaluate((ns) => {
        const raw = JSON.parse(localStorage.getItem(ns + 'exerciseStartTimes') || 'null');
        return raw && raw.times ? raw.times : {};
    }, NS);
}

async function savedExercise(page, id) {
    return page.evaluate((ns, id) => {
        const h = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]');
        for (const w of h) {
            const ex = w.exercises.find(e => e.id === id && e.loggedAt);
            if (ex) return ex;
        }
        return null;
    }, NS, id);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate(() =>
            localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior');

        // === 1. Walk away from a machine and come back =================
        await clickCardButton(page, 'chest-press', 'Weight Breakdown');
        const firstOpen = (await anchors(page))['chest-press'];
        ok(firstOpen, 'the first open of Chest Press is anchored');

        await new Promise(r => setTimeout(r, GAP_MS));

        // The machine was taken, so something else got done first. This is what
        // closes the Chest Press panel.
        await clickCardButton(page, 'chest-flies', 'Weight Breakdown');
        await new Promise(r => setTimeout(r, GAP_MS));

        // Back to Chest Press. THIS is when the set actually starts.
        await clickCardButton(page, 'chest-press', 'Weight Breakdown');
        const secondOpen = (await anchors(page))['chest-press'];

        ok(secondOpen !== firstOpen,
            'returning to a machine re-anchors it — the newest open wins');
        ok(new Date(secondOpen) - new Date(firstOpen) >= GAP_MS,
            'and the new anchor is later than the old one by the time spent away');

        await clickCardButton(page, 'chest-press', 'LOG');
        await waitFor(page, 'chest press to reach history',
            (ns) => {
                const h = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]');
                return h.length > 0 && h[0].exercises.some(e => e.id === 'chest-press' && e.loggedAt);
            }, NS);

        const chestPress = await savedExercise(page, 'chest-press');
        eq(chestPress.startedAt, secondOpen,
            'the logged movement is measured from the return, not the first glance');
        ok(chestPress.startedAt !== firstOpen,
            'the stale anchor is definitively NOT what was written');

        // The whole point, stated as the user would: the reported duration is
        // the set, not the set plus everything done while away from the machine.
        const measured = new Date(chestPress.loggedAt) - new Date(chestPress.startedAt);
        const sinceFirstOpen = new Date(chestPress.loggedAt) - new Date(firstOpen);
        ok(measured < sinceFirstOpen - GAP_MS,
            `the duration excludes the time spent elsewhere ` +
            `(measured ${measured}ms vs ${sinceFirstOpen}ms since the first open)`);

        // === 2. Logging drops the anchor ===============================
        eq((await anchors(page))['chest-press'], undefined,
            'a logged movement gives up its anchor — it lives in the workout record now');

        // === 2b. An abandoned panel does not time a later log ==========
        // The other route to the same bug: open a panel, go elsewhere, and log
        // WITHOUT coming back to it. There is no set under way at that machine,
        // so there must be no anchor waiting to absorb the time.
        await clickCardButton(page, 'lateral-raises', 'Weight Breakdown');
        ok((await anchors(page))['lateral-raises'], 'Lateral Raises is anchored while its panel is open');

        await clickCardButton(page, 'overhead-tricep-extensions', 'Weight Breakdown');
        eq((await anchors(page))['lateral-raises'], undefined,
            'opening another card discards the abandoned anchor');
        eq(Object.keys(await anchors(page)), ['overhead-tricep-extensions'],
            'exactly one anchor exists at a time — the open panel owns it');

        // The abandoned-anchor half of this case stops here, because the deck
        // made its outcome unreachable. Logging a movement you never came back
        // to used to be one tap on a card whose panel was closed; LOG now exists
        // ONLY on the revealed face, so returning to Lateral Raises means
        // opening it, and opening it re-anchors. There is no longer a gesture
        // that records a movement with no start.
        //
        // That is the redesign working rather than coverage lost: the estimate
        // path it produced is what the whole screen exists to eliminate. The
        // arithmetic for an un-anchored movement is still pinned, by direct
        // getSessionTiming calls in case 66 and across 13 scenarios in case 70,
        // neither of which needs the UI to produce one.
        //
        // What survives here is the part the deck did NOT change: which tap
        // owns the anchor, and that exactly one exists at a time.

        // === 3. The already-open card still does not re-anchor =========
        // Chest Flies' panel was closed long ago, so this is a fresh open,
        // then a redundant tap on top of it.
        await clickCardButton(page, 'chest-flies', 'Weight Breakdown');
        const fliesOpen = (await anchors(page))['chest-flies'];
        ok(fliesOpen, 'Chest Flies is anchored');

        await new Promise(r => setTimeout(r, GAP_MS));
        await clickCardButton(page, 'chest-flies', 'Weight Breakdown');
        eq((await anchors(page))['chest-flies'], fliesOpen,
            'tapping the button on the ALREADY-OPEN card changes nothing, clock included');

        await clickCardButton(page, 'chest-flies', 'LOG');

        // === 4. Submitting the day clears every anchor =================
        await clickCardButton(page, 'shoulder-press', 'Weight Breakdown');
        ok((await anchors(page))['shoulder-press'], 'Shoulder Press is anchored but never logged');

        // Submit Day lives on the finish card at the end of the deck now.
        await submitDay(page);
        await page.waitForSelector('[data-timing-total]', { timeout: 8000 });

        eq(await page.evaluate((ns) => localStorage.getItem(ns + 'exerciseStartTimes'), NS), null,
            'submitting the day wipes the anchors, including ones never logged');

        eq(errors, [], 'no console errors');
        console.log('PASS: returning to a machine restarts its clock; anchors do not outlive their use.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
