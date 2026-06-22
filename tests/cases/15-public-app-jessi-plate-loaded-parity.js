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
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiStaleNameConfig, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PUBLIC_APP_ROOT = path.resolve(__dirname, '..', '..', '..', 'public_gym_app');

async function clickBreakdown(page, name) {
    return page.evaluate((n) => {
        const cards = document.querySelectorAll('.exercise-card');
        for (const c of cards) {
            if (c.querySelector('.exercise-name')?.textContent?.trim() === n) {
                const btn = Array.from(c.querySelectorAll('button'))
                    .find(b => b.textContent.includes('Weight Breakdown'));
                if (btn) { btn.click(); return true; }
            }
        }
        return false;
    }, name);
}

async function readCard(page, name) {
    return page.evaluate((n) => {
        const cards = document.querySelectorAll('.exercise-card');
        for (const c of cards) {
            if (c.querySelector('.exercise-name')?.textContent?.trim() === n) {
                return c.textContent;
            }
        }
        return '';
    }, name);
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
        await new Promise(r => setTimeout(r, 1500));

        // Sanity: gympinMode auto-enabled.
        const persisted = await page.evaluate(() => {
            const raw = localStorage.getItem('gym-local:gymExerciseConfig');
            return raw ? JSON.parse(raw).gympinMode : null;
        });
        eq(persisted, true, 'gympinMode auto-enabled for Jessi-shaped install');

        // Full Body program — single day, no selector to click.

        // --- Sagittal Plane Pulldowns: one-sided plate-loaded ---
        ok(await clickBreakdown(page, 'Sagittal Plane Pulldowns'),
            'Sagittal Plane Pulldowns card has a Weight Breakdown button');
        await new Promise(r => setTimeout(r, 200));
        const sagText = await readCard(page, 'Sagittal Plane Pulldowns');

        contains(sagText, 'Warmup Set #1 (', 'Sagittal Pulldowns renders plate-loaded warmup label');
        contains(sagText, 'lbs - ~70%',      'Sagittal Pulldowns renders plate-loaded percent label');
        ok(/\d+(?:\.\d+)?s - \d+/.test(sagText),
            'Sagittal Pulldowns renders plate breakdown lines (not bare pin-stack)');
        ok(!/Pin: \d/.test(sagText),
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
