// What this test covers
// ----------------------
// Public-app weight breakdown rounds warmup PER-SIDE weights to the nearest
// 10 lb (an exact halfway value rounds DOWN); the top set stays exact. This
// lives in the shared gympinCalculatePlateBreakdown, so it applies to ANY
// client with a plate-loaded exercise — not just Jessi. Covers one-sided +
// two-sided, round up + down + tie, and an exact top set.
//
// To verify this is real: remove roundWarmupPerSide from
// gympinCalculatePlateBreakdown. Test should fail (warmups show raw weights).

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PUBLIC_APP_ROOT = path.resolve(__dirname, '..', '..', '..', 'public_gym_app');

function fullBodyConfig() {
    return {
        version: 2,
        categories: ['Full Body'],
        minimalistPrTracking: true,
        days: {
            1: [
                { id: 'cback', name: 'Back Extensions',          category: 'Full Body', order: 0, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'clegp', name: 'Leg Press',                category: 'Full Body', order: 1, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'csag',  name: 'Sagittal Plane Pulldowns', category: 'Full Body', order: 2, type: 'standard', minReps: 6, maxReps: 8 },
            ],
        },
    };
}

async function breakdownText(page, name, weight) {
    const opened = await page.evaluate(({ name, weight }) => {
        const cards = document.querySelectorAll('.exercise-card');
        for (const c of cards) {
            if (c.querySelector('.exercise-name')?.textContent?.trim() === name) {
                const input = c.querySelector('input[type="number"]');
                if (!input) return false;
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value').set;
                setter.call(input, String(weight));
                input.dispatchEvent(new Event('input', { bubbles: true }));
                const btn = Array.from(c.querySelectorAll('button'))
                    .find(b => b.textContent.includes('Weight Breakdown'));
                if (!btn) return false;
                btn.click();
                return true;
            }
        }
        return false;
    }, { name, weight });
    if (!opened) return null;
    await new Promise(r => setTimeout(r, 250));
    return page.evaluate((name) => {
        const cards = document.querySelectorAll('.exercise-card');
        for (const c of cards) {
            if (c.querySelector('.exercise-name')?.textContent?.trim() === name) return c.textContent;
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
        await seedPublicApp(page, { exerciseConfig: fullBodyConfig(), schedule: jessiDefaultSchedule() });
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1500));

        const gympin = await page.evaluate(() => {
            const raw = localStorage.getItem('gym-local:gymExerciseConfig');
            return raw ? JSON.parse(raw).gympinMode : null;
        });
        eq(gympin, true, 'gympinMode auto-enabled for Full Body install');

        // Leg Press (two-sided) at 250: W1 87.5 -> 90 (up), W2 112.5 -> 110, top 125 exact.
        // This was Incline Chest Press until Aug 2026, when it became a pin
        // stack in both apps; Leg Press is the two-sided fixture now.
        const incline = await breakdownText(page, 'Leg Press', 250);
        ok(incline, 'opened Leg Press breakdown');
        contains(incline, 'Warmup Set #1 (180 lbs - ~70%)', 'two-sided W1 87.5/side rounds UP to 90 (total 180)');
        contains(incline, 'Per side: 90 lbs', 'two-sided W1 per side = 90');
        contains(incline, 'Warmup Set #2 (220 lbs - ~90%)', 'two-sided W2 112.5/side rounds DOWN to 110 (total 220)');
        contains(incline, 'Per side: 110 lbs', 'two-sided W2 per side = 110');
        contains(incline, 'Top Set (250 lbs)', 'two-sided top set exact 250 (never rounded)');
        contains(incline, 'Per side: 125 lbs', 'two-sided top set per side exact 125');

        // Back Extensions (one-sided) at 67.5: W1 47.25 -> 50 (up), W2 60.75 -> 60, top 67.5 exact.
        // (Was Preacher Curls until Jessi's station was renamed "Recline Curls" and
        // reclassified as a pin stack — this test needs a one-sided PLATE-loaded case.)
        const backExt = await breakdownText(page, 'Back Extensions', 67.5);
        ok(backExt, 'opened Back Extensions breakdown');
        contains(backExt, 'Warmup Set #1 (50 lbs - ~70%)', 'back ext W1 47.25 rounds UP to 50');
        contains(backExt, 'Warmup Set #2 (60 lbs - ~90%)', 'back ext W2 60.75 rounds DOWN to 60');
        contains(backExt, 'Top Set (67.5 lbs)', 'back ext top set exact 67.5');

        // Sagittal Plane Pulldowns (one-sided) at 50: exact-halfway ties round DOWN
        const sagittal = await breakdownText(page, 'Sagittal Plane Pulldowns', 50);
        ok(sagittal, 'opened Sagittal Plane Pulldowns breakdown');
        contains(sagittal, 'Warmup Set #1 (30 lbs - ~70%)', 'sagittal W1 35.0 (halfway) rounds DOWN to 30');
        contains(sagittal, 'Warmup Set #2 (40 lbs - ~90%)', 'sagittal W2 45.0 (halfway) rounds DOWN to 40');
        contains(sagittal, 'Top Set (50 lbs)', 'sagittal top set exact 50');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: public-app warmups round per-side to nearest 10 (ties down); top set exact.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
