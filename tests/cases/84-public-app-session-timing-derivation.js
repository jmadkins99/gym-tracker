// What this test covers
// ----------------------
// getSessionTiming's arithmetic in the PUBLIC app, driven directly rather than
// through the UI. The mirror of case 66, which pins the same function in the
// personal app.
//
// Both apps carry their own copy of this logic — they share no code, only a
// design — so a copy is exactly the thing that can drift. This case exists so
// that a change made to one app's derivation and not the other fails here
// rather than in Jessi's History tab.
//
// The three anchors, in descending order of trust:
//
//   1. measured   — startedAt, from opening the Weight Breakdown at the machine
//   2. estimated  — the span back to the PREVIOUS log, less a flat 120s
//                   allowance for walking over and setting up
//   3. estimated  — for the first movement only, which has no previous log:
//                   the last time the app came to the foreground
//
// and the ceiling that overrides all three: a movement claiming more than 30
// minutes reports NA rather than a number nobody should trust, and its start is
// dropped so it cannot wreck the session total either.
//
// Rows sort by loggedAt, NOT by program order — skipping a busy machine and
// coming back is normal, and roster order would attribute a wild span to
// whatever sat between.
//
// Calling the function directly works because @babel/standalone's preset-env
// lowers top-level const/let to var, so the app's globals are reachable on
// window. That is the same mechanism the module split depends on.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { eq, ok } = require('../lib/assert');
const { PUBLIC_APP_ROOT } = require('../lib/paths');

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // The wizard may be up — irrelevant, the function is a global either
        // way. Wait for the script to have evaluated rather than for a screen.
        await page.waitForFunction(
            () => typeof getSessionTiming === 'function', { timeout: 8000 });

        const base = new Date('2026-08-30T09:00:00.000Z');

        // === 1. Measured spans, and the sort ===========================
        const measured = await page.evaluate((baseMs) => {
            const mins = (n) => n * 60 * 1000;
            const iso = (ms) => new Date(ms).toISOString();
            // Deliberately out of program order: B is logged FIRST.
            const t = getSessionTiming({
                exercises: [
                    { id: 'a', name: 'A',
                      startedAt: iso(baseMs + mins(20)), loggedAt: iso(baseMs + mins(24)) },
                    { id: 'b', name: 'B',
                      startedAt: iso(baseMs), loggedAt: iso(baseMs + mins(5)) },
                ],
            }, null);
            return {
                order: t.rows.map(r => r.id),
                seconds: t.rows.map(r => r.seconds),
                estimated: t.rows.map(r => r.estimated),
                total: t.totalSeconds,
            };
        }, base.getTime());

        eq(measured.order, ['b', 'a'],
            'rows sort by loggedAt, not by the order they sit in the roster');
        eq(measured.seconds, [300, 240],
            'each measured row is loggedAt minus startedAt');
        eq(measured.estimated, [false, false],
            'a movement with its own startedAt is measured, not estimated');
        eq(measured.total, 1440,
            'the session runs from the first movement start to the last log');

        // === 2. The estimate from the previous log =====================
        const estimated = await page.evaluate((baseMs) => {
            const mins = (n) => n * 60 * 1000;
            const iso = (ms) => new Date(ms).toISOString();
            const t = getSessionTiming({
                exercises: [
                    { id: 'a', name: 'A',
                      startedAt: iso(baseMs), loggedAt: iso(baseMs + mins(5)) },
                    // No startedAt: logged 10 minutes after A.
                    { id: 'b', name: 'B', loggedAt: iso(baseMs + mins(15)) },
                ],
            }, null);
            // A gap SHORTER than the 120s allowance must clamp to 0, not go
            // negative.
            const tight = getSessionTiming({
                exercises: [
                    { id: 'a', name: 'A', loggedAt: iso(baseMs) },
                    { id: 'b', name: 'B', loggedAt: iso(baseMs + 30 * 1000) },
                ],
            }, null);
            return {
                second: t.rows[1].seconds,
                secondEstimated: t.rows[1].estimated,
                tight: tight.rows[1].seconds,
            };
        }, base.getTime());

        eq(estimated.second, 480,
            'an un-anchored movement measures back to the previous log, less the 120s allowance');
        eq(estimated.secondEstimated, true, 'and it is flagged as an estimate');
        eq(estimated.tight, 0,
            'a gap shorter than the allowance clamps to 0 rather than going negative');

        // === 3. The foreground fallback, first movement only ===========
        const foreground = await page.evaluate((baseMs) => {
            const mins = (n) => n * 60 * 1000;
            const iso = (ms) => new Date(ms).toISOString();
            const workout = {
                exercises: [
                    { id: 'a', name: 'A', loggedAt: iso(baseMs + mins(10)) },
                    { id: 'b', name: 'B', loggedAt: iso(baseMs + mins(30)) },
                ],
            };
            const call = (fg) => {
                const t = getSessionTiming(workout, fg);
                return { first: t.rows[0].seconds, estimated: t.rows[0].estimated };
            };
            return {
                none: call(null),
                tenMinutesBefore: call(iso(baseMs)),
                // A foreground stamp AFTER the log is not evidence of anything.
                fromTheFuture: call(iso(baseMs + mins(20))),
                noTimestamps: getSessionTiming({
                    exercises: [{ id: 'a', name: 'A', weight: '100', reps: '6' }],
                }, null),
                noWorkout: getSessionTiming(null, null),
                noExercises: getSessionTiming({}, null),
            };
        }, base.getTime());

        eq(foreground.none, { first: null, estimated: false },
            'the first movement with no anchor and no foreground stamp reports NA');
        eq(foreground.tenMinutesBefore, { first: 600, estimated: true },
            'the foreground stamp stands in for the first movement, flagged as an estimate');
        eq(foreground.fromTheFuture, { first: null, estimated: false },
            'a foreground stamp later than the log is rejected');
        eq(foreground.noTimestamps, null,
            'a workout with no timestamps at all returns null — this is what hides the ' +
            'timing UI on every workout logged before this feature shipped');
        eq(foreground.noWorkout, null, 'a null workout returns null rather than throwing');
        eq(foreground.noExercises, null, 'a workout with no exercises array returns null');

        // === 4. The 30-minute ceiling ==================================
        const ceiling = await page.evaluate((baseMs) => {
            const mins = (n) => n * 60 * 1000;
            const iso = (ms) => new Date(ms).toISOString();
            const at = (offset) => {
                const t = getSessionTiming({
                    exercises: [
                        { id: 'a', name: 'A',
                          startedAt: iso(baseMs - offset), loggedAt: iso(baseMs) },
                        { id: 'b', name: 'B', loggedAt: iso(baseMs + mins(10)) },
                    ],
                }, null);
                return { first: t.rows[0].seconds, total: t.totalSeconds };
            };
            return {
                justUnder: at(mins(30) - 1000),
                exactly: at(mins(30)),
                justOver: at(mins(30) + 1000),
                wildlyOver: at(mins(50)),
            };
        }, base.getTime());

        eq(ceiling.justUnder.first, 1799, 'a movement just under 30 minutes still reports');
        eq(ceiling.exactly.first, 1800,
            'exactly 30 minutes is allowed — the rule is strictly greater than');
        eq(ceiling.justOver.first, null, 'one second over 30 minutes reports NA');
        eq(ceiling.wildlyOver.first, null, 'and so does a wildly over-long one');
        eq(ceiling.wildlyOver.total, 600,
            'a rejected FIRST movement does not drag the session total with it — the ' +
            'total is the 10 minutes from A to B, not 60');

        // === 5. A row is never dropped, only its number ================
        const kept = await page.evaluate((baseMs) => {
            const mins = (n) => n * 60 * 1000;
            const iso = (ms) => new Date(ms).toISOString();
            const t = getSessionTiming({
                exercises: [
                    { id: 'a', name: 'A',
                      startedAt: iso(baseMs - mins(90)), loggedAt: iso(baseMs) },
                    { id: 'b', name: 'B',
                      startedAt: iso(baseMs + mins(8)), loggedAt: iso(baseMs + mins(10)) },
                ],
            }, null);
            return t.rows.map(r => ({ id: r.id, name: r.name, seconds: r.seconds }));
        }, base.getTime());

        eq(kept.length, 2,
            'the over-long movement still appears — it was performed, it just cannot be timed');
        eq(kept[0].seconds, null, 'it reports NA');
        eq(kept[1].seconds, 120, 'and the movement after it is unaffected');
        ok(kept[0].name === 'A', 'rows carry the name for rendering');

        eq(errors, [], 'no console errors');
        console.log('PASS: the public app derives session timing the same way the personal app does.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
