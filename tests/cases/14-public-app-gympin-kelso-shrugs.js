// What this test covers
// ----------------------
// On the public app (Jessi's app), Kelso Shrugs is a pin-stack machine
// with a 200 lb cap. Overflow is plates one-sided, identical math to
// the personal app's kelso-shrugs config. Working weight 215:
//   - Warmup 1 = 150.5 → 150 on pin (no overflow)
//   - Warmup 2 = 193.5 → 193.75 via 3.75 micro-plate (still under pin)
//   - Top set 215 → overflow: 200 pin + 10×1, 5×1 plate = 215 lbs
//
// To verify this test is real: in public_gym_app/index.html, change the
// `kelso|shrug` rule in getWeightBreakdownConfig back to plain
// `{ type: 'pin-stack' }` (no maxPin). Test should fail because Top
// Set disappears for non-overflow pin-stack sets.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiPreMigrationConfig, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PUBLIC_APP_ROOT = path.resolve(__dirname, '..', '..', '..', 'public_gym_app');

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);

        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        const cfg = jessiPreMigrationConfig();
        const torsoDay = cfg.days[1];
        const kelsoEntry = torsoDay.find(e => e.name === 'Kelso Shrugs');
        ok(kelsoEntry, 'fixture must contain a Kelso Shrugs exercise (sanity)');

        const workoutHistory = [
            {
                date: '2026-05-27T20:00:00Z', day: 1, submitted: true, week: 1, plateauBusters: [],
                exercises: [{ id: kelsoEntry.id, name: 'Kelso Shrugs', weight: '215', reps: '5',
                              type: 'standard', minReps: 6, maxReps: 8 }],
            }
        ];

        await seedPublicApp(page, {
            exerciseConfig: cfg,
            workoutHistory,
            schedule: jessiDefaultSchedule(),
        });

        // Auto-enable should flip gympinMode on without any URL param since
        // categories are Torso/Limbs (Jessi-shaped install).
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1500));

        const persisted = await page.evaluate(() => {
            const raw = localStorage.getItem('gym-local:gymExerciseConfig');
            return raw ? JSON.parse(raw).gympinMode : null;
        });
        eq(persisted, true, 'gympinMode auto-enabled for Jessi-shaped install');

        // Day 1 (Torso) should already be the default. Click the Kelso card's
        // Weight Breakdown button.
        const clicked = await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Kelso Shrugs') {
                    const btn = Array.from(c.querySelectorAll('button'))
                        .find(b => b.textContent.includes('Weight Breakdown'));
                    if (btn) { btn.click(); return true; }
                }
            }
            return false;
        });
        ok(clicked, 'Kelso Shrugs card shows the Weight Breakdown button under gympinMode');
        await new Promise(r => setTimeout(r, 250));

        const text = await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Kelso Shrugs') {
                    return c.textContent;
                }
            }
            return '';
        });

        contains(text, 'Warmup Set #1 (~70%): 150 lbs',
            'warmup 1 (150.5) rounds to 150 (no overflow under 200 cap)');
        contains(text, 'Warmup Set #2 (~90%): 193.75 lbs',
            'warmup 2 (193.5) rounds to 193.75 via 3.75 micro-plate (still under cap)');
        contains(text, 'Top Set: 215 lbs',
            'top set shown at 215 (overflow triggers top-set display)');
        contains(text, 'Pin: 200 lbs',
            'top set overflow shows "Pin: 200 lbs" line');

        ok(/10s - 1/.test(text), 'plate breakdown lists a 10 lb plate');
        ok(/5s - 1/.test(text),  'plate breakdown lists a 5 lb plate');

        const pinCount = (text.match(/Pin: 200 lbs/g) || []).length;
        eq(pinCount, 1, `expected exactly 1 "Pin: 200 lbs" line (top set only), got ${pinCount}`);

        eq(errors, [], 'no console errors during load');
        console.log('PASS: public-app gympinMode renders Kelso Shrugs overflow breakdown at 215 lbs.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
