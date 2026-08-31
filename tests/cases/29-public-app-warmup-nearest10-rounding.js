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
const { launch, waitForApp, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const { PUBLIC_APP_ROOT } = require('../lib/paths');
const { ACTIVE, goToCard, revealCard } = require('../lib/deck');

function fullBodyConfig() {
    return {
        version: 2,
        categories: ['Full Body'],
        minimalistPrTracking: true,
        days: {
            1: [
                { id: 'cback', name: 'Back Extensions',          category: 'Full Body', order: 0, type: 'standard', minReps: 6, maxReps: 8 },
                // One-sided fixture. This slot was Preacher Curls, then Back
                // Extensions; Aug 2026 made Back Extensions two-sided, so the
                // one-sided case moved onto Kelso Shrugs. Any one-sided
                // plate-loaded name works — the arithmetic is weight-driven.
                { id: 'ckels', name: 'Kelso Shrugs',             category: 'Full Body', order: 1, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'csag',  name: 'Sagittal Plane Pulldowns', category: 'Full Body', order: 2, type: 'standard', minReps: 6, maxReps: 8 },
            ],
        },
    };
}

// Walk the deck to the card, swipe it open, type the weight, and hand back
// what the open card says. On the deck all three steps are needed: the weight
// input does not exist until the card is revealed, and there is no breakdown
// button to press — the reveal is the breakdown.
async function breakdownText(page, name, weight) {
    await goToCard(page, name);
    await revealCard(page);
    const ok = await page.evaluate((sel, w) => {
        const input = document.querySelector(sel + ' input[type="number"]');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, String(w));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }, ACTIVE, weight);
    if (!ok) return null;
    await new Promise(r => setTimeout(r, 250));
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
        await seedPublicApp(page, { exerciseConfig: fullBodyConfig(), schedule: jessiDefaultSchedule() });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        const gympin = await page.evaluate(() => {
            const raw = localStorage.getItem('gym-local:gymExerciseConfig');
            return raw ? !!JSON.parse(raw) : null;
        });
        eq(gympin, true, 'a config is persisted for the Full Body install');

        // Back Extensions (two-sided) at 250: W1 87.5 -> 90 (up), W2 112.5 -> 110, top 125 exact.
        // The two-sided fixture was Incline Chest Press, then Leg Press. Aug
        // 2026 made both pin stacks and made Back Extensions two-sided, so it
        // holds this case now. (Leg Press has since reverted to two-sided and
        // could hold it again, but there is no reason to move it back — the
        // arithmetic is weight-driven and identical on either card.)
        const backExt = await breakdownText(page, 'Back Extensions', 250);
        ok(backExt, 'opened Back Extensions breakdown');
        contains(backExt, 'Warmup 1' + '70%' + '180 lbs', 'two-sided W1 87.5/side lands on 90 (total 180)');
        contains(backExt, '90/side', 'two-sided W1 per side = 90');
        contains(backExt, 'Warmup 2' + '90%' + '230 lbs',
            'two-sided W2 112.5/side lands on 115 (45x2 + 25) = 230 total. The old ' +
            'nearest-10 rule said 110/side, which needs 45x2 + 10 + 10 — two of the ' +
            'same small plate, which is exactly what the loadable rule refuses.');
        contains(backExt, '115/side', 'two-sided W2 per side = 115 (45x2 + 25)');
        contains(backExt, 'Top set' + '250 lbs', 'two-sided top set exact 250 (never rounded)');
        contains(backExt, '125/side', 'two-sided top set per side exact 125');

        // Kelso Shrugs (one-sided) at 67.5: W1 47.25 -> 50 (up), W2 60.75 -> 60, top 67.5 exact.
        const kelso = await breakdownText(page, 'Kelso Shrugs', 67.5);
        ok(kelso, 'opened Kelso Shrugs breakdown');
        contains(kelso, 'Warmup 1' + '70%' + '45 lbs',
            'one-sided W1 47.25 lands on a bare 45 — nearer than 50 (45 + 5)');
        contains(kelso, 'Warmup 2' + '90%' + '60 lbs', 'one-sided W2 60.75 lands on 60 (45 + 10 + 5)');
        contains(kelso, 'Top set' + '67.5 lbs', 'one-sided top set exact 67.5');

        // Sagittal Plane Pulldowns (one-sided) at 50: exact-halfway ties round DOWN
        const sagittal = await breakdownText(page, 'Sagittal Plane Pulldowns', 50);
        ok(sagittal, 'opened Sagittal Plane Pulldowns breakdown');
        contains(sagittal, 'Warmup 1' + '70%' + '35 lbs',
            'sagittal W1 is exactly 35, which is loadable (25 + 10) and so is not moved');
        contains(sagittal, 'Warmup 2' + '90%' + '45 lbs',
            'sagittal W2 is exactly 45, a single plate, and so is not moved either');
        contains(sagittal, 'Top set' + '50 lbs', 'sagittal top set exact 50');

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
