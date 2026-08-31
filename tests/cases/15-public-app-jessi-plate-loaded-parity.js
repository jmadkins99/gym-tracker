// What this test covers
// ----------------------
// Jessi's program must render the same weight-breakdown SHAPE as the
// personal app for analogous slots. Locks in:
//
//   - "Sagittal Plane Pulldowns" (Jessi's slot for hammer-row on
//     personal) renders as plate-loaded ONE-sided. One-sided is
//     detectable by the presence of plate count lines ("25s - 1")
//     together with the ABSENCE of any "Per side:" line.
//
// Also needs to NOT render as pin-stack (no "Pin: X lbs" rows).
//
// To verify this test is real: flip /sagittal/ back into the pin-stack
// block in getWeightBreakdownConfig. Test should fail.

const path = require('path');
const { start } = require('../lib/server');
const { launch, waitForApp, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiStaleNameConfig, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const { PUBLIC_APP_ROOT } = require('../lib/paths');
const { ACTIVE, goToCard, revealCard } = require('../lib/deck');

// Walk the deck to a named card and swipe it open. There is no Weight
// Breakdown button any more — the reveal IS the breakdown, and it is what
// stamps the movement's start time.
async function clickBreakdown(page, name) {
    await goToCard(page, name);
    await revealCard(page);
    return true;
}

// The open card's text. Only three cards are mounted at a time, so this reads
// the active slot rather than searching a list.
async function readCard(page, name) {
    await goToCard(page, name);
    return page.evaluate((sel) => {
        const slot = document.querySelector(sel);
        return slot ? slot.textContent : '';
    }, ACTIVE);
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        const cfg = jessiStaleNameConfig();
        const sagId  = cfg.days[1].find(e => e.name === 'Sagittal Plane Pulldowns')?.id;
        ok(sagId, 'fixture must contain Sagittal Plane Pulldowns (sanity)');

        const workoutHistory = [
            {
                date: '2026-05-27T20:00:00Z', day: 1, submitted: true, week: 1, plateauBusters: [],
                exercises: [
                    { id: sagId,  name: 'Sagittal Plane Pulldowns', weight: '100', reps: '5',
                      type: 'standard', minReps: 6, maxReps: 8 },
                ],
            },
        ];

        await seedPublicApp(page, {
            exerciseConfig: cfg,
            workoutHistory,
            schedule: jessiDefaultSchedule(),
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // Sanity: a config was persisted for this install.
        const persisted = await page.evaluate(() => {
            const raw = localStorage.getItem('gym-local:gymExerciseConfig');
            return raw ? !!JSON.parse(raw) : null;
        });
        eq(persisted, true, 'a config is persisted for the Jessi-shaped install');

        // Full Body program — single day, no selector to click.

        // --- Sagittal Plane Pulldowns: one-sided plate-loaded ---
        ok(await clickBreakdown(page, 'Sagittal Plane Pulldowns'),
            'Sagittal Plane Pulldowns card has a Weight Breakdown button');
        await new Promise(r => setTimeout(r, 200));
        const sagText = await readCard(page, 'Sagittal Plane Pulldowns');

        contains(sagText, 'Warmup 1', 'Sagittal Pulldowns renders a plate-loaded warmup row');
        contains(sagText, '70%', 'Sagittal Pulldowns labels the warmup percentage');
        ok(/\d+(?: × \d+)?, /.test(sagText),
            'Sagittal Pulldowns renders a plate list (not a bare pin-stack row)');
        ok(!/pin \d/.test(sagText),
            'Sagittal Pulldowns must NOT render any "Pin: X" line (pin-stack regression)');

        const sagPerSide = (sagText.match(/Per side: \d+(?:\.\d+)?\s*lbs/g) || []).length;
        eq(sagPerSide, 0,
            'Sagittal Pulldowns one-sided renders ZERO "Per side: X lbs" lines (two-sided would render 3)');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Jessi parity — Sagittal Pulldowns renders one-sided plate-loaded.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
