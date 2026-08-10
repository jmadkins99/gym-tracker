// What this test covers
// ----------------------
// On the public app (Jessi's app), Kelso Shrugs is a PLATE-LOADED one-sided
// machine (it used to be a pin stack capped at 200 lbs; that was changed to
// match the personal app's kelso-shrugs config). The breakdown is a plain
// plate-loaded shape — "(<total> lbs - ~NN%):" labels with a floor plate
// breakdown and NO "Pin: X lbs" overflow line. Working weight 215:
//   - Warmup 1 = 70% of 215 = 150.5 → nearest-10 = 150 → 45×3 + 10 + 5
//   - Warmup 2 = 90% of 215 = 193.5 → nearest-10 = 190 → 45×4 + 10
//   - Top set  = 215 (never rounded) → 45×4 + 25 + 10
//
// To verify this test is real: in public_gym_app/index.html, change the
// `kelso|shrug` rule in getWeightBreakdownConfig back to
// `{ type: 'pin-stack', maxPin: 200, overflowPlateMode: 'one-sided' }`.
// The plate-loaded "(150 lbs - ~70%)" labels disappear and the test fails.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiPreMigrationConfig, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const { PUBLIC_APP_ROOT } = require('../lib/paths');

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

        contains(text, 'Warmup Set #1 (150 lbs - ~70%):',
            'warmup 1 (150.5) rounds to nearest-10 = 150 lbs (plate-loaded label shape)');
        contains(text, 'Warmup Set #2 (190 lbs - ~90%):',
            'warmup 2 (193.5) rounds to nearest-10 = 190 lbs');
        contains(text, 'Top Set (215 lbs):',
            'top set shows exact 215 lbs (plate-loaded label shape)');

        // No pin cap anymore — the pin-stack overflow line must be gone.
        ok(!/Pin: \d/.test(text),
            'no "Pin: N lbs" overflow line (Kelso Shrugs is plate-loaded, not a capped pin stack)');

        // Top set 215 one-sided = 45×4 + 25 + 10.
        ok(/45s - 4/.test(text), 'top set plate breakdown lists four 45 lb plates');
        ok(/25s - 1/.test(text), 'top set plate breakdown lists a 25 lb plate');
        ok(/10s - 1/.test(text), 'plate breakdown lists a 10 lb plate');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: public-app gympinMode renders Kelso Shrugs plate-loaded breakdown at 215 lbs.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
