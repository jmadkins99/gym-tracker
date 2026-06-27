// What this test covers
// ----------------------
// Cable Wrist Curls pin stack maxes at 97.5 lbs. For working weights above
// that, the breakdown shows "Pin: 97.5 lbs" + the largest plate combination
// that fits the excess (rounded DOWN). For working weight 115:
//   - Warmup 1 ≈ 80.5 → fits on pin → just "80 lbs"
//   - Warmup 2 ≈ 103.5 → overflow → 97.5 pin + 5×1 plate = 102.5 lbs total
//   - Top set 115 → overflow → 97.5 pin + 10×1, 5×1, 2.5×1 = 115 lbs total
//
// Top set is shown only in overflow mode (otherwise redundant with the
// Weight (lbs) input field).
//
// To verify this test is real: in gym_app/js/config.js, change
// PIN_STACK_EXERCISES['cable-wrist-curls'] back to `true` (no maxPin).
// Top Set disappears from the breakdown and the test fails.

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

        // Seed Cable Wrist Curls at 115 lbs — over the 97.5 pin cap, so all
        // three set entries should appear and warmup 2 + top set should overflow.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-27T20:00:00Z', day: 1,
                exercises: [{ id: 'cable-wrist-curls', name: 'Cable Wrist Curls', weight: '115', reps: '5' }],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'fullbody');

        const clicked = await clickBreakdown(page, 'Cable Wrist Curls');
        ok(clicked, 'Cable Wrist Curls card has a Weight Breakdown button');
        await new Promise(r => setTimeout(r, 250));

        const text = await readCard(page, 'Cable Wrist Curls');

        // Warmup 1 ≈ 80.5 → rounds to 80 (under pin cap, no overflow): "Warmup Set #1 (~70%): 80 lbs"
        contains(text, 'Warmup Set #1 (~70%): 80 lbs',
            'warmup 1 (≈80.5) rounds to 80 and stays on pin (no overflow)');

        // Warmup 2 ≈ 103.5 → overflow. Excess 6 rounds down to a 5 plate.
        // Total = 97.5 + 5 = 102.5. So we should see "Warmup Set #2 (~90%): 102.5 lbs",
        // "Pin: 97.5 lbs", and "5s - 1".
        contains(text, 'Warmup Set #2 (~90%): 102.5 lbs',
            'warmup 2 (≈103.5) overflows to 102.5 (rounded down to clean plate combination)');

        // Top Set 115 → overflow. Excess 17.5 = 10 + 5 + 2.5.
        contains(text, 'Top Set: 115 lbs',
            'top set shown at 115 (overflow mode triggers top-set display)');

        // Both overflow rows expose "Pin: 97.5 lbs" — search for the literal.
        const pinCount = (text.match(/Pin: 97\.5 lbs/g) || []).length;
        ok(pinCount >= 2, `expected ≥2 "Pin: 97.5 lbs" lines (warmup 2 + top set), got ${pinCount}`);

        // Plate lines should include 10s, 5s, 2.5s (collectively across the two overflow sets).
        ok(/10s - 1/.test(text),  'plate breakdown lists a 10 lb plate');
        ok(/5s - \d/.test(text),   'plate breakdown lists at least one 5 lb plate');
        ok(/2\.5s - 1/.test(text), 'plate breakdown lists a 2.5 lb plate');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Cable Wrist Curls renders pin+plate overflow breakdown at 115 lbs.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
