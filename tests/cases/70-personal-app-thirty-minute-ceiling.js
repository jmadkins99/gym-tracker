// What this test covers
// ----------------------
// The 30-minute ceiling in getSessionTiming, exhaustively: every boundary, all
// three ways a movement can get a start time, and what a rejected row does to
// the session total.
//
// The ceiling exists because a movement can end up with a start that is real
// but no longer means anything — a panel opened and abandoned for hours, or a
// foreground stamp from before the phone went in a pocket. Past 30 minutes the
// number stops being wrong-but-plausible and becomes nonsense, so the row
// reports NA rather than a figure nobody should trust. Case 66 renders it; this
// case is the arithmetic, driven straight against getSessionTiming with no DOM
// in the way, so every edge is cheap to state.
//
// Three properties are easy to get wrong and invisible when you do:
//
//   1. The boundary is EXCLUSIVE. Exactly 30:00 is reported; 30:01 is NA. An
//      off-by-one here shows up as a single missing row once in a blue moon.
//
//   2. The two-minute transition allowance is deducted BEFORE the ceiling is
//      applied, so a 32:00 gap between logs measures 30:00 and is kept, while
//      32:01 measures 30:01 and is not. Check the ceiling first instead and the
//      rule silently tightens to 28 minutes for every un-anchored movement.
//
//   3. A rejected FIRST movement must not drag the session total with it. The
//      row and the total read the same start, so rejecting one without the
//      other leaves "Time at the Gym" reporting three hours next to a row that
//      says NA — the exact contradiction the ceiling exists to prevent.
//
// The ceiling is per-MOVEMENT only. A genuinely long session still reports its
// real length, which scenario "long session" pins; a ceiling accidentally
// applied to the total would cap every real workout at half an hour.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const CEILING = 30 * 60;   // seconds; mirrors MAX_EXERCISE_SECONDS
const ALLOWANCE = 120;     // the transition deduction on an un-anchored row

// Each scenario is offsets in SECONDS from an arbitrary base instant.
// `started: null` means the panel was never opened for that movement.
// `expect` is [seconds, estimated] per row, in logged order.
const SCENARIOS = [
    {
        name: 'measured, comfortably under',
        exercises: [{ started: 0, logged: 600 }],
        expect: [[600, false]],
        total: 600,
    },
    {
        name: 'measured, one second under the ceiling',
        exercises: [{ started: 0, logged: CEILING - 1 }],
        expect: [[CEILING - 1, false]],
        total: CEILING - 1,
    },
    {
        name: 'measured, exactly at the ceiling',
        exercises: [{ started: 0, logged: CEILING }],
        expect: [[CEILING, false]],
        total: CEILING,
    },
    {
        name: 'measured, one second over the ceiling',
        // Rejected, and — being the first row — its start is kept out of the
        // total too, which then runs from its own log to the last log.
        // The follow-up measures from the previous LOG (1801), not from base:
        // a 199s gap less the 120s allowance.
        exercises: [{ started: 0, logged: CEILING + 1 }, { started: null, logged: CEILING + 200 }],
        expect: [[null, false], [199 - ALLOWANCE, true]],
        total: 199,
    },
    {
        name: 'measured, wildly over',
        exercises: [{ started: 0, logged: 3 * 3600 }, { started: null, logged: 3 * 3600 + 400 }],
        expect: [[null, false], [400 - ALLOWANCE, true]],
        total: 400,
    },
    {
        name: 'over-ceiling row in the MIDDLE leaves the session start alone',
        exercises: [
            { started: 0, logged: 300 },
            { started: 400, logged: 400 + CEILING + 1 },
            { started: null, logged: 400 + CEILING + 300 },
        ],
        // Third row: 299s since the previous log, less the allowance. The
        // session start is untouched by the refusal in the middle.
        expect: [[300, false], [null, false], [299 - ALLOWANCE, true]],
        total: 400 + CEILING + 300,
    },
    {
        name: 'un-anchored: allowance is deducted BEFORE the ceiling (kept)',
        // 32:00 gap - 2:00 allowance = exactly 30:00, so it survives.
        exercises: [{ started: 0, logged: 60 }, { started: null, logged: 60 + CEILING + ALLOWANCE }],
        expect: [[60, false], [CEILING, true]],
        total: 60 + CEILING + ALLOWANCE,
    },
    {
        name: 'un-anchored: one second more and it is refused',
        exercises: [{ started: 0, logged: 60 }, { started: null, logged: 60 + CEILING + ALLOWANCE + 1 }],
        expect: [[60, false], [null, false]],
        total: 60 + CEILING + ALLOWANCE + 1,
    },
    {
        name: 'foreground anchor exactly at the ceiling is kept',
        foreground: 0,
        exercises: [{ started: null, logged: CEILING }, { started: null, logged: CEILING + 600 }],
        expect: [[CEILING, true], [600 - ALLOWANCE, true]],
        total: CEILING + 600,
    },
    {
        name: 'foreground anchor one second over is refused',
        foreground: 0,
        exercises: [{ started: null, logged: CEILING + 1 }, { started: null, logged: CEILING + 601 }],
        expect: [[null, false], [600 - ALLOWANCE, true]],
        total: 600,
    },
    {
        name: 'a start AFTER the log is never used',
        // Nonsense ordering (clock skew, a hand-edited backup). It must fall
        // through rather than produce a negative that the ceiling would pass.
        foreground: null,
        exercises: [{ started: 900, logged: 300 }],
        expect: [[null, false]],
        total: 0,
    },
    {
        name: 'long session: the ceiling is per movement, never on the total',
        exercises: [
            { started: 0, logged: 600 },
            { started: 1500, logged: 2100 },
            { started: 3000, logged: 3600 },
            { started: 4800, logged: 5400 },
        ],
        // Four ten-minute movements spread over an hour and a half. Every row
        // is well under the ceiling and the total is well over it.
        expect: [[600, false], [600, false], [600, false], [600, false]],
        total: 5400,
    },
    {
        name: 'several refused rows in one session',
        exercises: [
            { started: 0, logged: 2000 },
            { started: 2100, logged: 4200 },
            { started: 4300, logged: 4500 },
        ],
        expect: [[null, false], [null, false], [200, false]],
        total: 2500,
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
        const compiled = await page.evaluate(() => MAX_EXERCISE_SECONDS);
        eq(compiled, CEILING,
            'the app ceiling and this case agree on 30 minutes');

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
                    rows: t.rows.map(r => [r.seconds, r.estimated]),
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

        // Stated once more on its own, because it is the property most likely
        // to be quietly broken by a refactor: nothing over the ceiling is ever
        // dressed up as an estimate. NA means "not measured", and an asterisk
        // beside it would claim the opposite.
        const refused = results.flatMap(r => r.rows).filter(([secs]) => secs === null);
        ok(refused.length >= 6, `the scenarios do produce refusals (${refused.length})`);
        ok(refused.every(([, estimated]) => estimated === false),
            'no refused row is marked as an estimate — NA never carries an asterisk');

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
