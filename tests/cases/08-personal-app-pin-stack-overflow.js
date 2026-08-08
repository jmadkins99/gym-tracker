// What this test covers
// ----------------------
// The pin-stack OVERFLOW path: a capped stack renders "Pin: <max> lbs" plus
// the largest plate combination that fits the excess (rounded DOWN).
//
// This test used to run against Cable Wrist Curls at a 97.5 cap. In Aug 2026
// the user moved to a different cable machine, far from its ceiling, so that
// cap was removed and the only capped exercises left are Leg Press
// (`hip-adduction`) and Calf Raises (`calf-raise`), both at 390. Leg Press
// carries the overflow coverage now; Calf Raises shares the identical code
// path. Both are Lower-day, as is Cable Wrist Curls, so one page load covers
// the overflow case and the un-capped regression guard together.
//
// Leg Press seeded at 450 lbs (cap 390):
//   - Warmup 1 = 70% of 450 = 315 → fits on pin → just "315 lbs"
//   - Warmup 2 = 90% of 450 = 405 → overflow → 390 pin + 10 + 5 = 405 lbs
//   - Top set  = 450 → overflow → 390 pin + 45 + 10 + 5 = 450 lbs
//
// Top set is shown only in overflow mode (otherwise redundant with the
// Weight (lbs) input field) — which is also what the Cable Wrist Curls half
// of this test asserts the absence of.
//
// To verify this test is real: in gym_app/js/config.js, change
// PIN_STACK_EXERCISES['hip-adduction'] back to `true` (no maxPin). Top Set
// and the "Pin: 390 lbs" lines disappear and the test fails.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

async function clickBreakdown(page, exerciseName) {
    const found = await page.evaluate((name) => {
        const cards = document.querySelectorAll('.exercise-card');
        for (const c of cards) {
            if (c.querySelector('.exercise-name')?.textContent?.trim() === name) {
                const btn = Array.from(c.querySelectorAll('button'))
                    .find(b => b.textContent.includes('Weight Breakdown'));
                if (btn) { btn.click(); return true; }
            }
        }
        return false;
    }, exerciseName);
    return found;
}

async function readCard(page, exerciseName) {
    return page.evaluate((name) => {
        const cards = document.querySelectorAll('.exercise-card');
        for (const c of cards) {
            if (c.querySelector('.exercise-name')?.textContent?.trim() === name) {
                return c.textContent;
            }
        }
        return '';
    }, exerciseName);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Seed Leg Press at 450 lbs — over the 390 pin cap, so all three set
        // entries appear and warmup 2 + top set overflow. Cable Wrist Curls is
        // seeded at 115, the weight that used to overflow its old 97.5 cap, so
        // the guard below is a real regression check rather than a vacuous one.
        //
        // NOTE the id/name swap this config warns about: `hip-adduction`
        // renders as "Leg Press" and `leg-extensions` renders as "Hip
        // Adduction". The ids below are correct; the names are what the cards
        // actually show.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-27T20:00:00Z', day: 1,
                exercises: [
                    { id: 'hip-adduction', name: 'Leg Press', weight: '450', reps: '5' },
                    { id: 'cable-wrist-curls', name: 'Cable Wrist Curls', weight: '115', reps: '5' },
                ],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'lower');

        // --- Capped stack: Leg Press at 450 over a 390 cap ---
        const clickedLegPress = await clickBreakdown(page, 'Leg Press');
        ok(clickedLegPress, 'Leg Press card has a Weight Breakdown button');
        await new Promise(r => setTimeout(r, 250));

        const legPress = await readCard(page, 'Leg Press');

        // Warmup 1 = 315 → under the cap, no overflow.
        contains(legPress, 'Warmup Set #1 (~70%): 315 lbs',
            'warmup 1 (315) stays on pin (no overflow)');

        // Warmup 2 = 405 → overflow. Excess 15 = 10 + 5. Total = 390 + 15.
        contains(legPress, 'Warmup Set #2 (~90%): 405 lbs',
            'warmup 2 (405) overflows to pin 390 + 15 lbs of plates');

        // Top set 450 → overflow. Excess 60 = 45 + 10 + 5.
        contains(legPress, 'Top Set: 450 lbs',
            'top set shown at 450 (overflow mode triggers top-set display)');

        // Both overflow rows expose "Pin: 390 lbs" — search for the literal.
        const pinCount = (legPress.match(/Pin: 390 lbs/g) || []).length;
        ok(pinCount >= 2, `expected >=2 "Pin: 390 lbs" lines (warmup 2 + top set), got ${pinCount}`);

        // Plate lines across the two overflow sets: 45s, 10s, 5s.
        ok(/45s - 1/.test(legPress), 'plate breakdown lists a 45 lb plate');
        ok(/10s - 1/.test(legPress), 'plate breakdown lists a 10 lb plate');
        ok(/5s - \d/.test(legPress), 'plate breakdown lists at least one 5 lb plate');

        // --- Un-capped stack: Cable Wrist Curls must NOT overflow at 115 ---
        const clickedCable = await clickBreakdown(page, 'Cable Wrist Curls');
        ok(clickedCable, 'Cable Wrist Curls card has a Weight Breakdown button');
        await new Promise(r => setTimeout(r, 250));

        const cable = await readCard(page, 'Cable Wrist Curls');

        ok(!/Pin: \d/.test(cable),
            'Cable Wrist Curls (cap removed) renders no "Pin: N lbs" overflow line at 115');
        ok(!/Top Set/.test(cable),
            'Cable Wrist Curls shows no Top Set row (top set is overflow-only)');

        // It should still render plain pin warmups: 70% of 115 = 80.5 → 80,
        // 90% of 115 = 103.5 → 103.75 (nearest achievable pin + micro-plate).
        contains(cable, 'Warmup Set #1 (~70%): 80 lbs',
            'Cable Wrist Curls warmup 1 (~80.5) rounds to an achievable 80 lb pin');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Leg Press renders pin+plate overflow at 450 over a 390 cap; Cable Wrist Curls no longer overflows.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
