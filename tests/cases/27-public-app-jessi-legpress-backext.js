// What this test covers
// ----------------------
// Jessi swapped his last two Full Body slots to "Back Extensions" and
// "Leg Press". Both must render the Weight Breakdown button (gympin), and
// in the right STYLE. Both are plate-loaded TWO-sided as of Aug 2026:
//
//   - Leg Press       → plate-loaded TWO-sided (renders "Per side:" lines)
//   - Back Extensions → plate-loaded TWO-sided (renders "Per side:" lines)
//
// Before the original fix these names classified to null, so no button
// rendered — which is exactly what Jessi saw on his phone. To verify this
// test is real: delete the /leg press/ and /back extension/ lines from
// getWeightBreakdownConfig. Test should fail (missing buttons).
//
// These two used to be each other's mirror — Leg Press spent part of Aug 2026
// as a pin stack, and the case leaned on the contrast. The revert put both on
// the same style, so that framing is gone and each name now stands on its own
// positive assertion instead. The failure this still catches is the one that
// matters: drop the /leg press/ plate rule and the name falls through the
// whole plate block to either a resurrected pin rule or `null`, and the three
// "Per side" lines below disappear either way.
//
// Worth knowing for anyone re-adding a pin rule: in getWeightBreakdownConfig
// the plate-loaded block runs FIRST, unlike the personal app's WorkoutView,
// which checks pin-stack first. A stray /leg press/ pin rule here is dead code
// rather than a conflict, so it would NOT fail this test — the classification
// is only ever as correct as the plate block's copy.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const { PUBLIC_APP_ROOT } = require('../lib/paths');

function jessiLegPressConfig() {
    return {
        version: 2,
        categories: ['Full Body'],
        minimalistPrTracking: true,
        days: {
            1: [
                { id: 'jprea', name: 'Preacher Curls',   category: 'Full Body', order: 0, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jback', name: 'Back Extensions',  category: 'Full Body', order: 1, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jlegp', name: 'Leg Press',        category: 'Full Body', order: 2, type: 'standard', minReps: 6, maxReps: 8 },
            ],
        },
    };
}

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

        const workoutHistory = [
            {
                date: '2026-05-27T20:00:00Z', day: 1, submitted: true, week: 1, plateauBusters: [],
                exercises: [
                    { id: 'jlegp', name: 'Leg Press',       weight: '200', reps: '5', type: 'standard', minReps: 6, maxReps: 8 },
                    { id: 'jback', name: 'Back Extensions', weight: '90',  reps: '5', type: 'standard', minReps: 6, maxReps: 8 },
                ],
            },
        ];

        await seedPublicApp(page, {
            exerciseConfig: jessiLegPressConfig(),
            workoutHistory,
            schedule: jessiDefaultSchedule(),
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1500));

        // Sanity: gympinMode auto-enabled for the Full Body (Jessi-shaped) install.
        const persisted = await page.evaluate(() => {
            const raw = localStorage.getItem('gym-local:gymExerciseConfig');
            return raw ? JSON.parse(raw).gympinMode : null;
        });
        eq(persisted, true, 'gympinMode auto-enabled for Jessi-shaped install');

        // --- Leg Press: two-sided plate-loaded (a pin stack for part of Aug 2026) ---
        ok(await clickBreakdown(page, 'Leg Press'),
            'Leg Press card has a Weight Breakdown button');
        await new Promise(r => setTimeout(r, 200));
        const legText = await readCard(page, 'Leg Press');
        ok(/\d+(?:\.\d+)?s - \d+/.test(legText),
            'Leg Press renders plate breakdown lines (not bare pin-stack)');
        ok(!/Pin: \d/.test(legText),
            'Leg Press must NOT render any "Pin: X" line');
        const legPerSide = (legText.match(/Per side: \d+(?:\.\d+)?\s*lbs/g) || []).length;
        eq(legPerSide, 3,
            'Leg Press two-sided renders 3 "Per side: X lbs" lines (warmup1, warmup2, top)');

        // --- Back Extensions: two-sided plate-loaded (was one-sided) ---
        ok(await clickBreakdown(page, 'Back Extensions'),
            'Back Extensions card has a Weight Breakdown button');
        await new Promise(r => setTimeout(r, 200));
        const backText = await readCard(page, 'Back Extensions');
        ok(/\d+(?:\.\d+)?s - \d+/.test(backText),
            'Back Extensions renders plate breakdown lines (not bare pin-stack)');
        ok(!/Pin: \d/.test(backText),
            'Back Extensions must NOT render any "Pin: X" line');
        const backPerSide = (backText.match(/Per side: \d+(?:\.\d+)?\s*lbs/g) || []).length;
        eq(backPerSide, 3,
            'Back Extensions two-sided renders 3 "Per side: X lbs" lines (warmup1, warmup2, top)');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Jessi Leg Press + Back Extensions both render two-sided breakdown buttons.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
