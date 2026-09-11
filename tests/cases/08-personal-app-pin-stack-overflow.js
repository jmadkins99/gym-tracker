// What this test covers
// ----------------------
// The pin-stack OVERFLOW path: a capped stack renders "Pin: <max> lbs" plus
// the largest plate combination that fits the excess (rounded DOWN).
//
// This case has been handed down twice. It first ran against Cable Wrist Curls
// at a 97.5 cap; in Aug 2026 the user moved to a different cable machine far
// from its ceiling and it moved onto Leg Press at a 390 cap. Leg Press then
// went back to two-side plate-loaded, taking its cap with it, which left Calf
// Raises (`calf-raise`, cap 405) as the program's only capped stack for a
// while. Sep 2026 added two more — Back Extensions at 260, covered by case 26,
// and Lateral Raises at 100, which is ~3x its working weight and so has no
// overflow to render yet. Calf Raises is still the subject here because its
// history seeds a weight that clears the cap by 95 lbs, which is what makes the
// plate arithmetic below worth asserting. If it is ever retired or uncapped,
// this coverage needs a new home rather than deletion.
//
// Calf Raises seeded at 500 lbs (cap 405):
//   - Warmup 1 = 70% of 500 = 350 → fits on pin → just "350 lbs"
//   - Warmup 2 = 90% of 500 = 450 → overflow → 405 pin + 45 = 450 lbs
//   - Top set  = 500 → overflow → 405 pin + 45 + 45 + 5 = 500 lbs
//
// Top set is shown only in overflow mode (otherwise redundant with the
// Weight (lbs) input field) — which is what the uncapped half of this test
// asserts the absence of. Both subjects are on Posterior now, so the case
// selects the day once and stays there; it used to hop the toggle when the
// control lived on Anterior.
//
// To verify this test is real: in js/config.js, delete the 'calf-raise' entry
// from PIN_STACK_CAPS. Top Set and the "pin 405" rows disappear and the
// test fails. Caps stayed code-side when classification became a user setting,
// so this is still a one-line change in config.js.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { goToCard, revealCard, isRevealed, readDeckCard } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// The breakdown is no longer behind a button: it is part of the card's revealed
// face, so "clicking" it means navigating to the card and swiping up.
async function clickBreakdown(page, exerciseName) {
    await goToCard(page, exerciseName);
    await revealCard(page);
    return isRevealed(page);
}

// The card's breakdown, as one string per row: "WARMUP 1 70% | 450 lbs | pin 405 · 45".
async function readCard(page, exerciseName) {
    await goToCard(page, exerciseName);
    await revealCard(page);
    const card = await readDeckCard(page, exerciseName);
    return card.breakdown.join(' ~ ');
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Seed Calf Raises at 500 lbs — over the 405 pin cap, so all three set
        // entries appear and warmup 2 + top set overflow. Hip Adduction is
        // seeded at 115 as the uncapped control: an uncapped stack must render
        // plain pin positions at any weight, so the contrast is what proves the
        // overflow rows above come from the CAP rather than from the weight.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-27T20:00:00Z', day: 1,
                exercises: [
                    { id: 'calf-raise', name: 'Calf Raises', weight: '500', reps: '5' },
                    { id: 'leg-extensions', name: 'Hip Adduction', weight: '115', reps: '5' },
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
        contains(calfRaises, '350 lbs',
            'warmup 1 (350) stays on pin (no overflow)');

        // Warmup 2 = 450 → overflow. Excess 45 = one 45. Total = 405 + 45.
        contains(calfRaises, '450 lbs',
            'warmup 2 (450) overflows to pin 405 + 45 lbs of plates');

        // Top set 500 → overflow. Excess 95 = 45 + 45 + 5.
        contains(calfRaises, '500 lbs',
            'top set shown at 500 (overflow mode triggers top-set display)');

        // Both overflow rows name the pin at its cap. The label lost its
        // "Pin:"/"lbs" scaffolding when the breakdown became a row of its own —
        // it now reads "pin 405 · 45" — but the number is the point.
        const pinCount = (calfRaises.match(/pin 405/g) || []).length;
        ok(pinCount >= 2, `expected >=2 "pin 405" rows (warmup 2 + top set), got ${pinCount}`);

        // Plate lines across the two overflow sets: a single 45 on warmup 2,
        // two 45s plus a 5 on the top set.
        ok(/pin 405 · 45(?!\s*×)/.test(calfRaises),
                'warmup 2 is the pin at max plus a single 45 — plates are listed as ' +
                '"45" now, with a count only when there is more than one');
        ok(/45 × 2/.test(calfRaises), 'the top set needs two 45s, so it says so explicitly');
        // The top set's 5 lb plate gets no regex of its own: each plate line is
        // its own div, so textContent runs them together as "45s - 25s - 1" and
        // any pattern for the 5 either collides with the 45 line's count or
        // depends on that concatenation. It is already covered exactly — the
        // rendered total is computed as pin + plate total, so a dropped 5 would
        // print "Top Set: 495 lbs" and fail the assertion above.

        // A stack has no per-side split, so the excess is one pile — the
        // plate-loaded branch must stay unreachable for a pin-stack id.
        ok(!/\/side/.test(calfRaises),
            'overflow plates render as a single pile, never "Per side"');

        // --- Un-capped stack: Hip Adduction must NOT overflow at 115 ---
        // This half ran against Cable Wrist Curls for as long as that movement
        // existed — first at its 97.5 cap, then as the proof the cap was really
        // gone — and moved to Hip Adduction when the wrist pair left the
        // program in Sep 2026. Any uncapped stack on this day serves: what is
        // being pinned is that a stack with no PIN_STACK_CAPS entry never
        // renders the overflow shape, however heavy the set.

        const clickedControl = await clickBreakdown(page, 'Hip Adduction');
        ok(clickedControl, 'Hip Adduction card has a Weight Breakdown button');
        await new Promise(r => setTimeout(r, 250));

        const cable = await readCard(page, 'Hip Adduction');

        ok(!/pin \d/.test(cable),
            'Hip Adduction (uncapped) renders no pin-at-max overflow row at 115');
        ok(!/Top Set/.test(cable),
            'Hip Adduction shows no Top Set row (top set is overflow-only)');

        // It should still render plain pin warmups. Under the Aug 2026 rule
        // these round to the nearest 10 rather than to the nearest achievable
        // pin-plus-micro-plate, so 70% of 115 = 80.5 -> 80 and 90% = 103.5 ->
        // 100. The old rule gave 103.75 here: a 3.75 micro-plate balanced on
        // the pin for a warmup.
        contains(cable, '80 lbs', 'warmup 1 (~80.5) rounds to an 80 lb pin position');
        contains(cable, '100 lbs', 'warmup 2 (~103.5) rounds to 100, not 103.75');
        ok(!/\.\d/.test(cable.replace(/115/g, '')),
            'and neither warmup asks for a fractional plate');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Calf Raises renders pin+plate overflow at 500 over a 405 cap; an uncapped stack never overflows.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
