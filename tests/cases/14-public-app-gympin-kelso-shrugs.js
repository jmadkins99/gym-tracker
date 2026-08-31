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
const { launch, waitForApp, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiPreMigrationConfig, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');
const { ACTIVE, goToCard, revealCard } = require('../lib/deck');

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

        // The breakdown is unconditional now; this used to check the one-shot
        // that flipped gympinMode on without a URL param since
        // categories are Torso/Limbs (Jessi-shaped install).
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        const persisted = await page.evaluate(() => {
            const raw = localStorage.getItem('gym-local:gymExerciseConfig');
            return raw ? !!JSON.parse(raw) : null;
        });
        eq(persisted, true, 'a config is persisted for the Jessi-shaped install');

        // Day 1 (Torso) is already the default. Walk the deck to the Kelso card
        // and swipe it open — there is no Weight Breakdown button any more, the
        // reveal is the breakdown.
        await goToCard(page, 'Kelso Shrugs');
        await revealCard(page);
        await new Promise(r => setTimeout(r, 250));

        const text = await page.evaluate(
            (sel) => document.querySelector(sel).textContent, ACTIVE);

        // Warmups round to a load you can BUILD — any number of 45s plus at
        // most one each of 25/10/5 — rather than to a round number. 150.5 lands
        // on 150 (45x3 + 10 + 5); 193.5 lands on 195 (45x4 + 10 + 5) where the
        // old nearest-10 rule said 190, which needs two 10s.
        contains(text, 'Warmup 1' + '70%' + '150 lbs',
            'warmup 1 (150.5) rounds to the loadable 150 lbs');
        contains(text, 'Warmup 2' + '90%' + '195 lbs',
            'warmup 2 (193.5) rounds to the loadable 195 lbs');
        contains(text, 'Top set' + '215 lbs',
            'top set shows exact 215 lbs, never rounded');

        // No pin cap anymore — the pin-stack overflow line must be gone.
        ok(!/pin \d/.test(text),
            'no "Pin: N lbs" overflow line (Kelso Shrugs is plate-loaded, not a capped pin stack)');

        // Top set 215 one-sided = 45x4 + 25 + 10, rendered as a comma list
        // with a count only where there is more than one plate.
        contains(text, '45 × 4, 25, 10',
            'the top set lists its plates as a comma list, counts only above one');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: public-app renders Kelso Shrugs plate-loaded breakdown at 215 lbs.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
