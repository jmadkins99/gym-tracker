// What this test covers
// ----------------------
// Jessi's public_gym_app holds her exercise list entirely in localStorage.
// When we change the split (e.g. moving ab-crunch from Torso to Limbs),
// the `migrateJessiToTorsoLimbs` migration is the thing that actually
// reshuffles her saved data into the new canonical layout.
//
// Without this test, a future revision could accidentally leave the
// migration out of sync with the personal-app program — Jessi's app
// would silently disagree with mine.
//
// What we assert:
//   - Day 1 (Torso) ends with the canonical Torso order, including
//     Lateral Raises right after Weighted Dips and NO Ab Crunch.
//   - Day 2 (Limbs) ends with the canonical Limbs order, including
//     Ab Crunch right before Calf Raise and NO Lateral Raises.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiPreMigrationConfig, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PUBLIC_APP_ROOT = path.resolve(__dirname, '..', '..', '..', 'public_gym_app');

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);

        // First load to establish the page context, then seed + reload so
        // the app's mount-time migration sees our injected state.
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPublicApp(page, {
            exerciseConfig: jessiPreMigrationConfig(),
            schedule: jessiDefaultSchedule(),
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1500));

        // Read what the migration produced.
        const after = await page.evaluate(() => {
            const cfg = JSON.parse(localStorage.getItem('gym-local:gymExerciseConfig'));
            const flag4 = localStorage.getItem('gym-local:jessiTLMigrationApplied4');
            return {
                day1: (cfg.days[1] || []).map(e => e.name),
                day2: (cfg.days[2] || []).map(e => e.name),
                day1Cats: [...new Set((cfg.days[1] || []).map(e => e.category))],
                day2Cats: [...new Set((cfg.days[2] || []).map(e => e.category))],
                flag4Set: flag4 === 'true',
            };
        });

        const expectedTorso = [
            'Chest Flies', 'Incline Chest Press', 'Seated Row', 'Weighted Dips',
            'Lateral Raises', 'Frontal Plane Pulldowns', 'Upper Back Row',
            'Kelso Shrugs', 'Shoulder Press',
        ];
        const expectedLimbs = [
            'Preacher Curls', 'Tricep Pushdown', 'Reverse Wrist Curls',
            'Cable Wrist Curls', 'Ab Crunch', 'Seated Calf Raise',
            'Hip Adduction', 'Stiff Legged Deadlifts', 'Pendulum Squats',
        ];

        eq(after.day1, expectedTorso, 'Torso (Day 1) exercise order after migration');
        eq(after.day2, expectedLimbs, 'Limbs (Day 2) exercise order after migration');
        eq(after.day1Cats, ['Torso'], 'all Day 1 exercises tagged Torso');
        eq(after.day2Cats, ['Limbs'], 'all Day 2 exercises tagged Limbs');
        ok(after.flag4Set, 'jessiTLMigrationApplied4 flag is set so migration does not re-run');
        eq(errors, [], 'no console errors during load');

        console.log('PASS: Jessi migration reshuffled exercises into canonical Torso/Limbs layout.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
