// What this test covers
// ----------------------
// With gympinMode=true on the public app, Cable Wrist Curls renders the
// pin+plate overflow breakdown identical to the personal app's. Working
// weight 115:
//   - Warmup 1 ≈ 80.5 → 80 lbs on pin (no overflow)
//   - Warmup 2 ≈ 103.5 → overflow: 97.5 pin + 5×1 plate = 102.5 lbs
//   - Top set 115 → overflow: 97.5 pin + 10×1, 5×1, 2.5×1 = 115 lbs
//
// Also covers: ?gympin=on URL param flips gympinMode on persistently
// (the param-based toggle is the coach's intended setup path).
//
// To verify this test is real: in public_gym_app/index.html, change the
// `cable wrist curl` rule in getWeightBreakdownConfig to drop maxPin,
// or change the gympinMode check in the card render. Test should fail.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiPreMigrationConfig, jessiDefaultSchedule, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PUBLIC_APP_ROOT = path.resolve(__dirname, '..', '..', '..', 'public_gym_app');

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);

        // Load once to establish page context, then seed Jessi state.
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        const cfg = jessiPreMigrationConfig();
        // Find Cable Wrist Curls id in the fixture so we can attach history.
        const limbsDay = cfg.days[2];
        const cwcEntry = limbsDay.find(e => e.name === 'Cable Wrist Curls');
        ok(cwcEntry, 'fixture must contain a Cable Wrist Curls exercise (sanity)');

        const workoutHistory = [
            {
                date: '2026-05-27T20:00:00Z', day: 2, submitted: true, week: 1, plateauBusters: [],
                exercises: [{ id: cwcEntry.id, name: 'Cable Wrist Curls', weight: '115', reps: '5',
                              type: 'standard', minReps: 6, maxReps: 8 }],
            }
        ];

        await seedPublicApp(page, {
            exerciseConfig: cfg,
            workoutHistory,
            schedule: jessiDefaultSchedule(),
        });

        // Visit with ?gympin=on — should flip gympinMode and strip the param.
        await page.goto(server.url + '/index.html?gympin=on', { waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1500));

        // Confirm the URL param was stripped (history.replaceState fired).
        const finalUrl = page.url();
        ok(!finalUrl.includes('gympin'),
            `?gympin=on should be stripped from the URL after handling, got: ${finalUrl}`);

        // Confirm gympinMode persisted to exerciseConfig.
        const persisted = await page.evaluate(() => {
            const raw = localStorage.getItem('gym-local:gymExerciseConfig');
            return raw ? JSON.parse(raw).gympinMode : null;
        });
        eq(persisted, true, 'gympinMode persisted to exerciseConfig as true after ?gympin=on');

        // Switch to Limbs day where Cable Wrist Curls lives.
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('.day-btn'))
                .find(b => b.textContent.trim() === 'Limbs');
            btn?.click();
        });
        await new Promise(r => setTimeout(r, 400));

        // Click Weight Breakdown on Cable Wrist Curls.
        const clicked = await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Cable Wrist Curls') {
                    const btn = Array.from(c.querySelectorAll('button'))
                        .find(b => b.textContent.includes('Weight Breakdown'));
                    if (btn) { btn.click(); return true; }
                }
            }
            return false;
        });
        ok(clicked, 'Cable Wrist Curls card shows the Weight Breakdown button under gympinMode');
        await new Promise(r => setTimeout(r, 250));

        const text = await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Cable Wrist Curls') {
                    return c.textContent;
                }
            }
            return '';
        });

        contains(text, 'Warmup Set #1 (~70%): 80 lbs',
            'warmup 1 (≈80.5) rounds to 80 on the pin');
        contains(text, 'Warmup Set #2 (~90%): 102.5 lbs',
            'warmup 2 (≈103.5) overflows to 102.5 after plate round-down');
        contains(text, 'Top Set: 115 lbs',
            'top set appears at 115 (overflow mode)');

        const pinCount = (text.match(/Pin: 97\.5 lbs/g) || []).length;
        ok(pinCount >= 2, `expected ≥2 "Pin: 97.5 lbs" lines (warmup 2 + top set), got ${pinCount}`);
        ok(/10s - 1/.test(text),   'plate breakdown lists a 10 lb plate');
        ok(/5s - \d/.test(text),    'plate breakdown lists a 5 lb plate');
        ok(/2\.5s - 1/.test(text),  'plate breakdown lists a 2.5 lb plate');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: public-app gympinMode renders Cable Wrist Curls overflow breakdown at 115 lbs.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
