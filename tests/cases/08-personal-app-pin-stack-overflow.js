// What this test covers
// ----------------------
// The pin-stack OVERFLOW path: a capped stack renders "Pin: <max> lbs" plus
// the largest plate combination that fits the excess (rounded DOWN).
//
// This case has been handed down twice. It first ran against Cable Wrist Curls
// at a 97.5 cap; in Aug 2026 the user moved to a different cable machine far
// from its ceiling and it moved onto Leg Press at a 390 cap. Leg Press then
// went back to two-side plate-loaded, taking its cap with it, which leaves
// Calf Raises (`calf-raise`, cap 405) as the program's ONLY capped stack and
// therefore the only place this rendering can be exercised. If Calf Raises is
// ever retired or uncapped, this coverage needs a new home rather than
// deletion — losing it means the overflow branch ships untested.
//
// Calf Raises seeded at 500 lbs (cap 405):
//   - Warmup 1 = 70% of 500 = 350 → fits on pin → just "350 lbs"
//   - Warmup 2 = 90% of 500 = 450 → overflow → 405 pin + 45 = 450 lbs
//   - Top set  = 500 → overflow → 405 pin + 45 + 45 + 5 = 500 lbs
//
// Top set is shown only in overflow mode (otherwise redundant with the
// Weight (lbs) input field) — which is also what the Cable Wrist Curls half
// of this test asserts the absence of. The two exercises sit on opposite days
// under the Anterior/Posterior split (Calf Raises on Posterior, Cable Wrist
// Curls on Anterior), so the test hops the toggle between the two halves.
// They were both Lower-day beforehand, which is why this used to need only
// one day selection.
//
// To verify this test is real: in js/config.js, delete the 'calf-raise' entry
// from PIN_STACK_CAPS. Top Set and the "Pin: 405 lbs" lines disappear and the
// test fails. Caps stayed code-side when classification became a user setting,
// so this is still a one-line change in config.js.

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

        // Seed Calf Raises at 500 lbs — over the 405 pin cap, so all three set
        // entries appear and warmup 2 + top set overflow. Cable Wrist Curls is
        // seeded at 115, the weight that used to overflow its old 97.5 cap, so
        // the guard below is a real regression check rather than a vacuous one.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-27T20:00:00Z', day: 1,
                exercises: [
                    { id: 'calf-raise', name: 'Calf Raises', weight: '500', reps: '5' },
                    { id: 'cable-wrist-curls', name: 'Cable Wrist Curls', weight: '115', reps: '5' },
                ],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'posterior');

        // --- Capped stack: Calf Raises at 500 over a 405 cap ---
        const clickedCalf = await clickBreakdown(page, 'Calf Raises');
        ok(clickedCalf, 'Calf Raises card has a Weight Breakdown button');
        await new Promise(r => setTimeout(r, 250));

        const calfRaises = await readCard(page, 'Calf Raises');

        // Warmup 1 = 350 → under the cap, no overflow.
        contains(calfRaises, 'Warmup Set #1 (~70%): 350 lbs',
            'warmup 1 (350) stays on pin (no overflow)');

        // Warmup 2 = 450 → overflow. Excess 45 = one 45. Total = 405 + 45.
        contains(calfRaises, 'Warmup Set #2 (~90%): 450 lbs',
            'warmup 2 (450) overflows to pin 405 + 45 lbs of plates');

        // Top set 500 → overflow. Excess 95 = 45 + 45 + 5.
        contains(calfRaises, 'Top Set: 500 lbs',
            'top set shown at 500 (overflow mode triggers top-set display)');

        // Both overflow rows expose "Pin: 405 lbs" — search for the literal.
        const pinCount = (calfRaises.match(/Pin: 405 lbs/g) || []).length;
        ok(pinCount >= 2, `expected >=2 "Pin: 405 lbs" lines (warmup 2 + top set), got ${pinCount}`);

        // Plate lines across the two overflow sets: a single 45 on warmup 2,
        // two 45s plus a 5 on the top set.
        ok(/45s - 1/.test(calfRaises), 'warmup 2 plate breakdown lists one 45 lb plate');
        ok(/45s - 2/.test(calfRaises), 'top set plate breakdown lists two 45 lb plates');
        // The top set's 5 lb plate gets no regex of its own: each plate line is
        // its own div, so textContent runs them together as "45s - 25s - 1" and
        // any pattern for the 5 either collides with the 45 line's count or
        // depends on that concatenation. It is already covered exactly — the
        // rendered total is computed as pin + plate total, so a dropped 5 would
        // print "Top Set: 495 lbs" and fail the assertion above.

        // A stack has no per-side split, so the excess is one pile — the
        // plate-loaded branch must stay unreachable for a pin-stack id.
        ok(!/Per side/.test(calfRaises),
            'overflow plates render as a single pile, never "Per side"');

        // --- Un-capped stack: Cable Wrist Curls must NOT overflow at 115 ---
        // Cable Wrist Curls is a wrist flexor, so it lives on Anterior while
        // Calf Raises above is Posterior. Hop the toggle.
        await selectDayType(page, 'anterior');

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
        console.log('PASS: Calf Raises renders pin+plate overflow at 500 over a 405 cap; Cable Wrist Curls no longer overflows.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
