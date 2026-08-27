// What this test covers
// ----------------------
// Kelso Shrugs is a PLATE-LOADED one-sided exercise (it used to be a pin
// stack capped at 200 lbs; that was changed to plate-loaded in config.js).
// The weight breakdown therefore shows the plate-loaded shape — warmup and
// top-set totals rendered as "(<total> lbs - ~NN%):" with a floor plate
// breakdown, and NO "Pin: ... lbs" overflow line. At a working weight of 215:
//   - Warmup 1 = 70% of 215 = 150.5 → nearest-10 (halfway rounds DOWN) = 150
//     → 45×3 + 10 + 5 = 150 lbs
//   - Warmup 2 = 90% of 215 = 193.5 → nearest-10 = 190 → 45×4 + 10 = 190 lbs
//   - Top set  = 215 (never rounded) → 45×4 + 25 + 10 = 215 lbs
//
// To verify this test is real: in js/config.js, change kelso-shrugs's seeded
// loadType from 'plate-one-sided' to 'pin' and add 'kelso-shrugs': 200 to
// PIN_STACK_CAPS. The plate-loaded "(150 lbs - ~70%)" labels disappear
// (replaced by the pin-stack "(~70%): 150 lbs" form) and the test fails.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
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

        // Seed Kelso Shrugs at 215 lbs — well above the old 200 lb pin cap, so
        // if it were still a pin stack the top set would overflow. As a
        // plate-loaded movement there is no cap: every set is a plain plate
        // breakdown.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-27T20:00:00Z', day: 1,
                exercises: [{ id: 'kelso-shrugs', name: 'Kelso Shrugs', weight: '215', reps: '5' }],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'posterior');

        const clicked = await clickBreakdown(page, 'Kelso Shrugs');
        ok(clicked, 'Kelso Shrugs card has a Weight Breakdown button');
        await new Promise(r => setTimeout(r, 250));

        const text = await readCard(page, 'Kelso Shrugs');

        // Plate-loaded label shape: "(<total> lbs - ~NN%):" — NOT the pin-stack
        // "(~NN%): <n> lbs" form.
        contains(text, 'Warmup Set #1 (150 lbs - ~70%):',
            'warmup 1 (150.5) rounds to nearest-10 = 150 lbs (plate-loaded label shape)');
        contains(text, 'Warmup Set #2 (190 lbs - ~90%):',
            'warmup 2 (193.5) rounds to nearest-10 = 190 lbs');
        contains(text, 'Top Set (215 lbs):',
            'top set shows exact 215 lbs (plate-loaded label shape)');

        // No pin cap anymore — the pin-stack overflow line must be gone.
        ok(!/Pin: \d/.test(text),
            'no "Pin: N lbs" overflow line (Kelso Shrugs is plate-loaded, not a capped pin stack)');
        ok(!/~70%\): \d+ lbs/.test(text),
            'does not render the pin-stack "(~70%): N lbs" label form');

        // Top set 215 one-sided = 45×4 + 25 + 10. Spot-check the plate lines.
        ok(/45s - 4/.test(text), 'top set plate breakdown lists four 45 lb plates');
        ok(/25s - 1/.test(text), 'top set plate breakdown lists a 25 lb plate');
        ok(/10s - 1/.test(text), 'plate breakdown lists a 10 lb plate');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Kelso Shrugs renders plate-loaded one-sided breakdown at 215 lbs.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
