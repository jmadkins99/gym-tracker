// What this test covers
// ----------------------
// Weighted Dips replaced Cuffed Overhead Tricep Extension on Torso. The
// machine type also changed: it's loaded as one-sided plate-loaded, not
// pin-stack. That distinction drives the Weight Breakdown UI — pin-stack
// just shows two warmup percentages, while plate-loaded shows a per-plate
// breakdown (45s, 25s, 10s, 5s, 2.5s, 1.25s).
//
// If we ever forget to move `overhead-tricep` between PIN_STACK_EXERCISES
// and PLATE_LOADED_EXERCISES, this test fails. It also acts as a smoke
// test for the Weight Breakdown popover itself.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
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

        // Seed a Weighted Dips history so the input has a known weight, which
        // gives the breakdown a definite number to render.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-27T20:00:00Z', day: 1,
                exercises: [{ id: 'overhead-tricep', name: 'Weighted Dips', weight: '60', reps: '5' }],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // Find the Weighted Dips card and confirm it has the Weight Breakdown button.
        const hasBreakdownBtn = await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Weighted Dips') {
                    return !!Array.from(c.querySelectorAll('button'))
                        .find(b => b.textContent.includes('Weight Breakdown'));
                }
            }
            return false;
        });
        ok(hasBreakdownBtn, 'Weighted Dips card shows the Weight Breakdown button');

        // Click the button.
        await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Weighted Dips') {
                    const btn = Array.from(c.querySelectorAll('button'))
                        .find(b => b.textContent.includes('Weight Breakdown'));
                    btn?.click();
                    return;
                }
            }
        });
        await new Promise(r => setTimeout(r, 250));

        // Read the breakdown text from the Weighted Dips card.
        const breakdownText = await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Weighted Dips') {
                    return c.textContent;
                }
            }
            return '';
        });

        // Plate-loaded breakdown signature: "Warmup Set #1 (NN lbs - ~70%):"
        // and a plate count line like "25s - 1". Pin-stack version omits both.
        contains(breakdownText, 'Warmup Set #1 (', 'plate-loaded warmup label present');
        contains(breakdownText, 'lbs - ~70%',     'plate-loaded warmup shows numeric lbs (not pin-stack format)');
        contains(breakdownText, 'Top Set (',       'plate-loaded top set label present');
        ok(
            /\d+(?:\.\d+)?s - \d+/.test(breakdownText),
            'breakdown lists at least one plate count (e.g. "25s - 1") — pin-stack would not'
        );
        eq(errors, [], 'no console errors during load');

        console.log('PASS: Weighted Dips renders plate-loaded weight breakdown.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
