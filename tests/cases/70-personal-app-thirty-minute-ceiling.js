// What this test covers
// ----------------------
// The two 30-minute rules in getSessionTiming, exhaustively: every boundary,
// all three ways a movement can get a start time, and what each rule does to
// the session total.
//
// Per movement: a start can be real but no longer mean anything — a panel
// opened and abandoned for hours, or a foreground stamp from before the phone
// went in a pocket. Past 30 minutes the span is nonsense, so the row counts as
// a 5:00 placeholder (`placeholder: true`, rendered with an asterisk).
//
// Between movements: a gap of more than 30 minutes from one LOG to the next is
// a break. The total counts only that movement's own time for it, not the gap.
//
// Case 66 renders it; this case is the arithmetic, driven straight against
// getSessionTiming with no DOM in the way, so every edge is cheap to state.
//
// Three properties are easy to get wrong and invisible when you do:
//
//   1. The boundary is EXCLUSIVE, for both rules. Exactly 30:00 is reported
//      and counted; 30:01 is the placeholder, or a break.
//
//   2. The two-minute transition allowance is deducted BEFORE the ceiling is
//      applied, so a 32:00 gap between logs measures 30:00 and is kept, while
//      32:01 measures 30:01 and is not. Check the ceiling first instead and the
//      rule silently tightens to 28 minutes for every un-anchored movement.
//
//   3. A rejected FIRST movement must not drag the session total with it. The
//      row and the total read the same span, so rejecting one without the
//      other leaves "Time at the Gym" reporting three hours next to a row that
//      says 5:00 — the exact contradiction the ceiling exists to prevent.
//
// Neither rule caps the total. A long session made of short gaps still reports
// its real length, which scenario "long session" pins.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const CEILING = 30 * 60;   // seconds; mirrors MAX_EXERCISE_SECONDS
const ALLOWANCE = 120;     // the transition deduction on an un-anchored row
const P = 5 * 60;          // mirrors OVERLONG_PLACEHOLDER_SECONDS

// Each scenario is offsets in SECONDS from an arbitrary base instant.
// `started: null` means the panel was never opened for that movement.
// `expect` is [seconds, estimated, placeholder] per row, in logged order.
const SCENARIOS = [
    {
        name: 'measured, comfortably under',
        exercises: [{ started: 0, logged: 600 }],
        expect: [[600, false, false]],
        total: 600,
    },
    {
        name: 'measured, one second under the ceiling',
        exercises: [{ started: 0, logged: CEILING - 1 }],
        expect: [[CEILING - 1, false, false]],
        total: CEILING - 1,
    },
    {
        name: 'measured, exactly at the ceiling',
        exercises: [{ started: 0, logged: CEILING }],
        expect: [[CEILING, false, false]],
        total: CEILING,
    },
    {
        name: 'measured, one second over the ceiling',
        // The placeholder, and — being the first row — the total starts from
        // it, not from the rejected start. The follow-up measures from the
        // previous LOG (1801): a 199s gap less the 120s allowance.
        exercises: [{ started: 0, logged: CEILING + 1 }, { started: null, logged: CEILING + 200 }],
        expect: [[P, false, true], [199 - ALLOWANCE, true, false]],
        total: P + 199,
    },
    {
        name: 'measured, wildly over',
        exercises: [{ started: 0, logged: 3 * 3600 }, { started: null, logged: 3 * 3600 + 400 }],
        expect: [[P, false, true], [400 - ALLOWANCE, true, false]],
        total: P + 400,
    },
    {
        name: 'over-ceiling row in the MIDDLE is a placeholder and a break',
        exercises: [
            { started: 0, logged: 300 },
            { started: 400, logged: 400 + CEILING + 1 },
            { started: null, logged: 400 + CEILING + 300 },
        ],
        // Its own span is over the ceiling, so its log-to-log gap is too: the
        // total takes the placeholder for it. Third row: 299s since the
        // previous log, less the allowance.
        expect: [[300, false, false], [P, false, true], [299 - ALLOWANCE, true, false]],
        total: 300 + P + 299,
    },
    {
        name: 'un-anchored: allowance is deducted BEFORE the ceiling (kept)',
        // 32:00 gap - 2:00 allowance = exactly 30:00, so the row survives. The
        // 32:00 gap itself is a break, so the total takes the row's 30:00.
        exercises: [{ started: 0, logged: 60 }, { started: null, logged: 60 + CEILING + ALLOWANCE }],
        expect: [[60, false, false], [CEILING, true, false]],
        total: 60 + CEILING,
    },
    {
        name: 'un-anchored: one second more and it is the placeholder',
        exercises: [{ started: 0, logged: 60 }, { started: null, logged: 60 + CEILING + ALLOWANCE + 1 }],
        expect: [[60, false, false], [P, false, true]],
        total: 60 + P,
    },
    {
        name: 'foreground anchor exactly at the ceiling is kept',
        foreground: 0,
        exercises: [{ started: null, logged: CEILING }, { started: null, logged: CEILING + 600 }],
        expect: [[CEILING, true, false], [600 - ALLOWANCE, true, false]],
        total: CEILING + 600,
    },
    {
        name: 'foreground anchor one second over is the placeholder',
        foreground: 0,
        exercises: [{ started: null, logged: CEILING + 1 }, { started: null, logged: CEILING + 601 }],
        expect: [[P, false, true], [600 - ALLOWANCE, true, false]],
        total: P + 600,
    },
    {
        name: 'a start AFTER the log is never used',
        // Nonsense ordering (clock skew, a hand-edited backup). It must fall
        // through to NA rather than produce a negative the ceiling would pass.
        foreground: null,
        exercises: [{ started: 900, logged: 300 }],
        expect: [[null, false, false]],
        total: 0,
    },
    {
        name: 'long session: gaps up to exactly 30:00 all count',
        exercises: [
            { started: 0, logged: 600 },
            { started: 1500, logged: 2100 },
            { started: 3000, logged: 3600 },
            { started: 4800, logged: 5400 },
        ],
        // Four ten-minute movements spread over an hour and a half. The last
        // gap is exactly 30:00, so it is not a break and the total is the span.
        expect: [[600, false, false], [600, false, false], [600, false, false], [600, false, false]],
        total: 5400,
    },
    {
        name: 'a gap one second over 30:00 is a break',
        // A real break between two measured sets: only B's own 1:41 counts.
        exercises: [{ started: 0, logged: 600 }, { started: 600 + CEILING - 100, logged: 600 + CEILING + 1 }],
        expect: [[600, false, false], [101, false, false]],
        total: 600 + 101,
    },
    {
        name: 'several placeholder rows in one session',
        exercises: [
            { started: 0, logged: 2000 },
            { started: 2100, logged: 4200 },
            { started: 4300, logged: 4500 },
        ],
        expect: [[P, false, true], [P, false, true], [200, false, false]],
        total: P + P + 300,
    },
];

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

        // The ceiling the app actually compiles, read from source rather than
        // trusted from the constant at the top of this file — so a change to
        // one without the other is a failure here rather than a silent drift.
        const compiled = await page.evaluate(() => [MAX_EXERCISE_SECONDS, OVERLONG_PLACEHOLDER_SECONDS]);
        eq(compiled, [CEILING, P],
            'the app and this case agree on the 30-minute ceiling and 5-minute placeholder');

        const results = await page.evaluate((scenarios) => {
            const base = Date.UTC(2026, 7, 28, 16, 0, 0);
            const iso = (secs) => new Date(base + secs * 1000).toISOString();

            return scenarios.map((s) => {
                const workout = {
                    exercises: s.exercises.map((e, i) => {
                        const row = { id: 'ex' + i, name: 'Ex' + i, loggedAt: iso(e.logged) };
                        if (e.started !== null && e.started !== undefined) {
                            row.startedAt = iso(e.started);
                        }
                        return row;
                    }),
                };
                const t = getSessionTiming(
                    workout,
                    (s.foreground === null || s.foreground === undefined) ? null : iso(s.foreground));
                return {
                    name: s.name,
                    rows: t.rows.map(r => [r.seconds, r.estimated, r.placeholder]),
                    total: t.totalSeconds,
                };
            });
        }, SCENARIOS);

        for (let i = 0; i < SCENARIOS.length; i++) {
            const s = SCENARIOS[i];
            const got = results[i];
            eq(got.rows, s.expect, `[${s.name}] per-movement seconds and estimate flags`);
            eq(got.total, s.total, `[${s.name}] session total`);
        }

        // Stated once more on its own: a placeholder is always exactly 5:00 and
        // never also flagged as an estimate, which would drag in the footnote
        // that explains the other asterisk.
        const placeholders = results.flatMap(r => r.rows).filter(([, , ph]) => ph);
        ok(placeholders.length >= 6, `the scenarios do produce placeholders (${placeholders.length})`);
        ok(placeholders.every(([secs, estimated]) => secs === P && estimated === false),
            'every placeholder row is 5:00 and not marked an estimate');

        eq(errors, [], 'no console errors');
        console.log(`PASS: the 30-minute ceiling holds across ${SCENARIOS.length} scenarios.`);
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
