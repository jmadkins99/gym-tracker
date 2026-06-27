// What this test covers
// ----------------------
// Chest Flies was reclassified from two-sided plate-loaded to plain pin-stack.
// The Weight Breakdown popover should now show the pin-stack format
// (just two warmup percentages as a single number each), NOT the
// plate-loaded format ("Warmup Set #1 (NNN lbs - ~70%):" + per-plate lines).
//
// If we ever accidentally re-add Chest Flies to PLATE_LOADED_EXERCISES,
// this test fails.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Seed a Chest Flies history so the input has a known weight.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-27T20:00:00Z', day: 1,
                exercises: [{ id: 'chest-flies', name: 'Chest Flies', weight: '165', reps: '5' }],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'fullbody');

        // Click the Weight Breakdown button on Chest Flies.
        const clicked = await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Chest Flies') {
                    const btn = Array.from(c.querySelectorAll('button'))
                        .find(b => b.textContent.includes('Weight Breakdown'));
                    if (btn) { btn.click(); return true; }
                }
            }
            return false;
        });
        ok(clicked, 'Chest Flies card has a Weight Breakdown button');
        await new Promise(r => setTimeout(r, 250));

        const breakdownText = await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Chest Flies') {
                    return c.textContent;
                }
            }
            return '';
        });

        // Pin-stack format: "Warmup Set #1 (~70%): NNN lbs" — no "(NNN lbs - ~70%)"
        // signature from plate-loaded, no per-plate lines.
        contains(breakdownText, 'Warmup Set #1 (~70%):', 'pin-stack warmup #1 label');
        contains(breakdownText, 'Warmup Set #2 (~90%):', 'pin-stack warmup #2 label');
        ok(
            !/lbs - ~70%/.test(breakdownText),
            'must NOT show plate-loaded "lbs - ~70%" signature (would mean still classified as plate-loaded)'
        );
        ok(
            !/\d+(?:\.\d+)?s - \d+/.test(breakdownText),
            'must NOT list per-plate lines like "25s - 1" — pin-stack format omits these'
        );
        eq(errors, [], 'no console errors during load');

        console.log('PASS: Chest Flies renders pin-stack weight breakdown (not plate-loaded).');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
