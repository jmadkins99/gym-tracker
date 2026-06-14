// What this test covers
// ----------------------
// Kelso Shrugs pin stack maxes at 200 lbs. The overflow shape mirrors
// Cable Wrist Curls (one-sided plate excess above the pin cap). At a
// working weight of 215 lbs:
//   - Warmup 1 = 150.5 → rounds DOWN to 150 (under pin, no overflow)
//   - Warmup 2 = 193.5 → rounds to 193.75 via micro-plate (still under
//     the 200 lb pin, so no overflow)
//   - Top set 215 → overflow → 200 pin + 10×1, 5×1 plate = 215 lbs total
//
// To verify this test is real: in gym_app/js/config.js, change
// PIN_STACK_EXERCISES['kelso-shrugs'] back to `true`. Top Set
// disappears from the breakdown and the test fails.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

async function clickBreakdown(page, exerciseName) {
    return page.evaluate((name) => {
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

        // Seed Kelso Shrugs at 215 lbs — 15 over the 200 lb pin cap, so the
        // top set overflows but both warmups stay on the stack.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-27T20:00:00Z', day: 1,
                exercises: [{ id: 'kelso-shrugs', name: 'Kelso Shrugs', weight: '215', reps: '5' }],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // Day 1 is the default open day; no need to switch.
        const clicked = await clickBreakdown(page, 'Kelso Shrugs');
        ok(clicked, 'Kelso Shrugs card has a Weight Breakdown button');
        await new Promise(r => setTimeout(r, 250));

        const text = await readCard(page, 'Kelso Shrugs');

        // Warmup 1 = 150.5 → rounds DOWN to 150 (no micro-plate needed).
        contains(text, 'Warmup Set #1 (~70%): 150 lbs',
            'warmup 1 (150.5) rounds to 150 (no overflow under 200 cap)');

        // Warmup 2 = 193.5 → 190 base + 3.75 micro-plate = 193.75 (still under pin).
        contains(text, 'Warmup Set #2 (~90%): 193.75 lbs',
            'warmup 2 (193.5) rounds to 193.75 via 3.75 micro-plate (still under cap)');

        // Top Set 215 → overflow at 200 pin + 15 lbs of plates (10 + 5).
        contains(text, 'Top Set: 215 lbs',
            'top set shown at 215 (overflow triggers top-set display)');
        contains(text, 'Pin: 200 lbs',
            'top set overflow shows "Pin: 200 lbs" line');
        ok(/10s - 1/.test(text),  'plate breakdown lists a 10 lb plate');
        ok(/5s - 1/.test(text),   'plate breakdown lists a 5 lb plate');

        // Exactly one overflow row is expected (top set only), so just one
        // "Pin: 200 lbs" line should appear — not two like Cable Wrist Curls.
        const pinCount = (text.match(/Pin: 200 lbs/g) || []).length;
        eq(pinCount, 1, `expected exactly 1 "Pin: 200 lbs" line (top set only), got ${pinCount}`);

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Kelso Shrugs renders pin+plate overflow breakdown at 215 lbs.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
