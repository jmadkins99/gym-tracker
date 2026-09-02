// What this test covers
// ----------------------
// getSessionTiming's arithmetic, against exact seeded timestamps rather than a
// wall clock, plus the exact strings the Day Breakdown modal renders from it.
// Case 65 covers the capture; this one covers what the numbers then mean.
//
// Three rules interact, and every one of them is invisible when it breaks —
// a wrong duration still renders as a plausible duration:
//
//   1. Rows are ordered by `loggedAt`, NOT by program order. Skipping a machine
//      because it is taken and coming back to it later is routine, and ordering
//      by the roster would then measure one movement's span from another
//      movement's log. The fixture below is deliberately seeded out of order.
//
//   2. An anchored movement is measured `loggedAt - startedAt`.
//
//   3. An un-anchored one falls back to the span from the previous log, less a
//      flat two minutes for walking over and setting up — and that subtraction
//      is FLOORED, so a gap under two minutes reads 0:00 and never a negative.
//      Shoulder Press in the fixture is one minute after the previous log
//      precisely to pin the floor.
//
// A fourth rule sits on top of all of them: no single movement may claim more
// than 30 minutes. Past that the number is nonsense rather than merely wrong,
// so the row reports NA and — when it is the FIRST movement — its rejected
// start is kept out of the session total too. One constant covers both routes
// to an over-long span: a stale foreground stamp, and a panel left open for
// hours and then logged without being reopened.
//
// The second half calls getSessionTiming directly. The first movement of a day
// with no anchor of its own falls back to when the app last came to the
// foreground, and whether that stamp is recent enough decides between a real
// number and NA. Neither branch can be staged through the UI without making the
// case depend on the time of day it runs at, and a case that passes at 09:00
// and fails at 08:55 is worse than no case.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { submitDay } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// 09:00 today. The absolute hour does not matter — nothing in getSessionTiming
// compares against now — but every offset below is read off it.
const base = new Date();
base.setHours(9, 0, 0, 0);
const at = (min, sec = 0) => new Date(base.getTime() + min * 60000 + sec * 1000).toISOString();
const baselineAt = () => new Date(base.getTime() - 2 * 86400000).toISOString();

// Seeded OUT OF LOGGED ORDER on purpose: array order is 4, 1, 3, 2.
const EXERCISES = [
    // Un-anchored, and only 1:00 after the previous log — under the two-minute
    // transition allowance, so it must floor to 0:00 rather than go negative.
    { id: 'shoulder-press', name: 'Shoulder Press', weight: '120', reps: '6',
      loggedAt: at(26, 30) },
    // Anchored: 09:00 -> 09:06 = 6:00.
    { id: 'chest-press', name: 'Chest Press', weight: '200', reps: '6',
      startedAt: at(0), loggedAt: at(6) },
    // Anchored: 09:20 -> 09:25:30 = 5:30.
    { id: 'chest-flies', name: 'Chest Flies', weight: '165', reps: '6',
      startedAt: at(20), loggedAt: at(25, 30) },
    // Un-anchored: previous log 09:06, so 09:08 -> 09:14 = 6:00.
    { id: 'incline-chest-press', name: 'Incline Chest Press', weight: '110', reps: '6',
      loggedAt: at(14) },
    // Anchored 08:20 and logged 09:35 — 75 minutes, which no single working set
    // takes. The panel was opened and abandoned; the row reports NA rather than
    // a number. It is NOT the first movement, so the session total is untouched
    // by it; the probe below covers the first-movement case.
    { id: 'lateral-raises', name: 'Lateral Raises', weight: '55', reps: '6',
      startedAt: at(-40), loggedAt: at(35) },
];

const EXPECTED_ROWS = [
    ['chest-press', '6:00'],
    ['incline-chest-press', '6:00 *'],
    ['chest-flies', '5:30'],
    ['shoulder-press', '0:00 *'],
    // Over the 30-minute ceiling. No asterisk: it is not an estimate, it is a
    // refusal to guess.
    ['lateral-raises', 'NA'],
];
const EXPECTED_BADGES = [
    ['chest-press', '🔥 PR'],
    ['incline-chest-press', null],
    ['chest-flies', null],
    ['shoulder-press', null],
    ['lateral-raises', null],
];
const BADGE_BG = 'rgba(0, 0, 0, 0)';
const BADGE_BORDER = 'rgb(212, 175, 55)';

// 09:35 - 09:00 = 35m. The NA row still ends the session — it was performed,
// and its LOG is real even though its start is not believable.
const EXPECTED_TOTAL = '35m';

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, {
            workoutHistory: [
                workoutEntry({
                    date: at(26, 30),
                    day: 'anterior',
                    submitted: false,
                    exercises: EXERCISES,
                }),
                workoutEntry({
                    date: baselineAt(),
                    day: 'anterior',
                    submitted: true,
                    exercises: [
                        { id: 'chest-press', name: 'Chest Press', weight: '200', reps: '5' },
                        { id: 'incline-chest-press', name: 'Incline Chest Press', weight: '110', reps: '6' },
                        { id: 'chest-flies', name: 'Chest Flies', weight: '170', reps: '6' },
                        { id: 'shoulder-press', name: 'Shoulder Press', weight: '120', reps: '6' },
                    ],
                }),
            ],
        });
        await page.evaluate(() =>
            localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior');

        // === 1. What the modal renders ==================================
        // Submit Day lives on the finish card at the end of the deck now, so
        // this walks there rather than searching the page for the button.
        await submitDay(page);
        await page.waitForSelector('[data-timing-total]', { timeout: 8000 });

        eq(await page.evaluate(() => document.querySelector('[data-timing-total]').textContent.trim()),
            EXPECTED_TOTAL,
            'the session total runs from the first Weight Breakdown tap to the last log');

        eq(await page.evaluate(() =>
            Array.from(document.querySelectorAll('button'))
                .some(b => /View More Details|Hide Details/i.test(b.textContent))),
            false,
            'Day Breakdown has no details toggle; rows are always visible');
        await page.waitForSelector('[data-timing-details]', { timeout: 8000 });

        const rowDetails = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-timing-row]')).map(r => {
                const badge = r.querySelector('[data-day-breakdown-pr-badge]');
                return {
                    id: r.getAttribute('data-timing-row'),
                    time: r.children[1].textContent.trim(),
                    badge: badge ? badge.textContent.trim() : null,
                    badgeClass: badge ? badge.className : null,
                    badgeBg: badge ? getComputedStyle(badge).backgroundColor : null,
                    badgeBorder: badge ? getComputedStyle(badge).borderTopColor : null,
                };
            }));
        const rows = rowDetails.map(r => [r.id, r.time]);

        eq(rows, EXPECTED_ROWS,
            'each movement is timed correctly, in logged order, estimates marked');
        eq(rowDetails.map(r => [r.id, r.badge]), EXPECTED_BADGES,
            'only movements that counted toward PRs Smashed get a row-level PR badge');
        ok(rowDetails.find(r => r.id === 'chest-press').badgeClass.includes('streak-badge'),
            'Day Breakdown PR badge reuses the same flame badge container');
        eq(rowDetails.find(r => r.id === 'chest-press').badgeBg, BADGE_BG,
            'Day Breakdown PR badge uses the shared transparent background');
        eq(rowDetails.find(r => r.id === 'chest-press').badgeBorder, BADGE_BORDER,
            'Day Breakdown PR badge uses the shared gold border');

        // === 2. The branches the UI cannot stage ========================
        const probe = await page.evaluate((baseMs) => {
            const iso = (ms) => new Date(ms).toISOString();
            const mins = (n) => n * 60000;

            // One movement, logged at 09:10, with no anchor of its own — so the
            // foreground stamp is the only thing that could start its clock.
            const unanchoredFirst = {
                exercises: [
                    { id: 'a', name: 'A', loggedAt: iso(baseMs + mins(10)) },
                    { id: 'b', name: 'B', loggedAt: iso(baseMs + mins(30)) },
                ],
            };

            const call = (foregroundAt) => {
                const t = getSessionTiming(unanchoredFirst, foregroundAt);
                return { first: t.rows[0].seconds, estimated: t.rows[0].estimated, total: t.totalSeconds };
            };

            return {
                noForeground: call(null),
                withinCap: call(iso(baseMs + mins(10) - mins(10))),
                atCap: call(iso(baseMs + mins(10) - mins(30))),
                pastCap: call(iso(baseMs + mins(10) - mins(45))),
                justPastCap: call(iso(baseMs + mins(10) - mins(31))),
                fromTheFuture: call(iso(baseMs + mins(20))),
                noTimestamps: getSessionTiming({
                    exercises: [{ id: 'a', name: 'A', weight: '100', reps: '6' }],
                }, null),
                noWorkout: getSessionTiming(null, null),

                // An over-long FIRST movement must not drag the session total
                // with it. A takes 50 minutes on paper; the total should be the
                // 10 minutes from A's log to B's, not 60.
                firstRowCapped: (() => {
                    const t = getSessionTiming({
                        exercises: [
                            { id: 'a', name: 'A', startedAt: iso(baseMs - mins(50)), loggedAt: iso(baseMs) },
                            { id: 'b', name: 'B', loggedAt: iso(baseMs + mins(10)) },
                        ],
                    }, null);
                    return { first: t.rows[0].seconds, total: t.totalSeconds };
                })(),
            };
        }, base.getTime());

        eq(probe.noForeground.first, null,
            'with no foreground stamp the first movement is unmeasurable, not zero');
        eq(probe.noForeground.total, 1200,
            'the session then spans first log to last log — 20 minutes');

        eq(probe.withinCap.first, 600,
            'a foreground stamp 10 minutes before the first log anchors it');
        ok(probe.withinCap.estimated,
            'and that row is marked an estimate, not a measurement');
        eq(probe.withinCap.total, 1800,
            'the session grows to include the newly anchored first movement');

        eq(probe.atCap.first, 1800,
            'a movement of exactly 30 minutes is still reported');
        eq(probe.justPastCap.first, null,
            'one minute over the ceiling is already NA — the boundary is exact');
        eq(probe.pastCap.first, null,
            'a stamp 45 minutes stale anchors nothing');
        eq(probe.fromTheFuture.first, null,
            'a foreground stamp AFTER the log is never used');

        eq(probe.firstRowCapped.first, null,
            'an over-long first movement reports NA');
        eq(probe.firstRowCapped.total, 600,
            'and its rejected start is kept out of the session total');

        eq(probe.noTimestamps, null,
            'a workout with no timestamps at all yields nothing to render');
        eq(probe.noWorkout, null, 'a missing workout yields nothing to render');

        // === 3. The foreground anchor actually moves ===================
        // Section 2 proves getSessionTiming USES a foreground stamp correctly;
        // it says nothing about whether anything ever updates one. The stamp is
        // taken at page load and refreshed on visibilitychange, and that second
        // half is the load-bearing one: on a phone the tab is restored from the
        // background rather than reloaded, so without the listener the value is
        // frozen at whenever the page last actually loaded — which can be
        // yesterday, and is then rejected by the cap, silently costing the first
        // movement of every session its anchor.
        //
        // visibilityState is read-only, so it is redefined before each event.
        // Left until last, since the page is not worth trusting afterwards.
        const beforeHide = await page.evaluate(() => window.lastForegroundAt);
        ok(beforeHide, 'a foreground stamp exists from page load');

        await page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState',
                { configurable: true, get: () => 'hidden' });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        eq(await page.evaluate(() => window.lastForegroundAt), beforeHide,
            'going to the background does NOT move the anchor');

        await new Promise(r => setTimeout(r, 50));
        await page.evaluate(() => {
            Object.defineProperty(document, 'visibilityState',
                { configurable: true, get: () => 'visible' });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        const afterShow = await page.evaluate(() => window.lastForegroundAt);
        ok(new Date(afterShow) > new Date(beforeHide),
            'coming back to the foreground moves it — the listener is wired');

        eq(errors, [], 'no console errors');
        console.log('PASS: session timing derives correctly from seeded timestamps.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
