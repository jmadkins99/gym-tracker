// What this test covers
// ----------------------
// Warmup sets round each PER-SIDE weight to the nearest 10 lb (an exact
// halfway value rounds DOWN); the TOP SET is never rounded and still shows
// the exact working weight with micro-plates. Cases exercised:
//
//   - two-sided round UP    Leg Press 247.5: 70% = 86.625/side -> 90
//   - two-sided round DOWN  Leg Press 90% = 111.375/side -> 110
//   - top set UNCHANGED     Leg Press top 123.75/side (45,25,5,2.5,1.25) exact
//
// The two-sided fixture was Incline Chest Press, then briefly Shoulder Press.
// Aug 2026 moved BOTH to pin stacks, which left Upper with no two-sided
// plate-loaded movement at all. Leg Press (`hip-adduction`) is now the only one
// in the whole program, so this case runs on the Lower day. The arithmetic is
// weight-driven and unchanged — only the card it runs against moved. If a
// future split retires Leg Press too, this coverage needs a new home rather
// than deletion.
//   - one-sided round UP    Preacher Curls 67.5: 70% = 47.25 -> 50 (45+5)
//   - one-sided round DOWN  Preacher 90% = 60.75 -> 60
//   - exact halfway -> DOWN  Sagittal Pulldowns 50: 70% = 35.0 -> 30, 90% = 45.0 -> 40
//
// To verify this test is real: delete roundWarmupPerSide() from
// calculatePlateBreakdown (or make it round up on ties). Test should fail.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

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
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, {});
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'upper');

        // --- Preacher Curls (one-sided) at 67.5 ---
        const preacher = await breakdownText(page, 'Preacher Curls', 67.5);
        ok(preacher, 'opened Preacher Curls breakdown');
        contains(preacher, 'Top Set (67.5 lbs)', 'preacher top set exact 67.5 (never rounded)');
        contains(preacher, 'Warmup Set #1 (50 lbs', 'preacher W1 47.25 rounds UP to 50');
        contains(preacher, 'Warmup Set #2 (60 lbs', 'preacher W2 60.75 rounds DOWN to 60');

        // --- Sagittal Plane Pulldowns (one-sided) at 50: exact-halfway ties round DOWN ---
        const sagittal = await breakdownText(page, 'Sagittal Plane Pulldowns', 50);
        ok(sagittal, 'opened Sagittal Plane Pulldowns breakdown');
        contains(sagittal, 'Top Set (50 lbs)', 'sagittal top set exact 50');
        contains(sagittal, 'Warmup Set #1 (30 lbs', 'sagittal W1 35.0 (halfway) rounds DOWN to 30');
        contains(sagittal, 'Warmup Set #2 (40 lbs', 'sagittal W2 45.0 (halfway) rounds DOWN to 40');

        // --- Leg Press (two-sided) at 247.5, on Lower ---
        // The program's only remaining two-sided plate-loaded movement; see the
        // header note. Switching days is what this case costs.
        await selectDayType(page, 'lower');
        const legPress = await breakdownText(page, 'Leg Press', 247.5);
        ok(legPress, 'opened Leg Press breakdown');
        contains(legPress, 'Top Set (247.5 lbs)', 'two-sided top set exact 247.5 (never rounded)');
        contains(legPress, 'Per side: 123.75 lbs', 'two-sided top set per side exact 123.75');
        contains(legPress, 'Warmup Set #1 (180 lbs', 'two-sided W1 86.625/side rounds UP to 90 (total 180)');
        contains(legPress, 'Per side: 90 lbs', 'two-sided W1 per side = 90');
        contains(legPress, 'Warmup Set #2 (220 lbs', 'two-sided W2 111.375/side rounds DOWN to 110 (total 220)');
        contains(legPress, 'Per side: 110 lbs', 'two-sided W2 per side = 110');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: warmups round per-side to nearest 10 (ties down); top set stays exact.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
