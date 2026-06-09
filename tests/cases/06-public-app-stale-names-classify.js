// What this test covers
// ----------------------
// Reproduces Jessi's 2026-06-09 backup: his exerciseConfig had stale
// display names "Dips" (no "Weighted" prefix — replaces overhead tricep
// extensions) and "Transverse Plane Rows" (Jessi's name for the upper-
// back-row pattern). Earlier revisions of `migrateJessiToTorsoLimbs` had
// a classifier that only matched `weighted dip` and `seated row`, so
// both exercises silently fell through to Limbs — leaving his Torso day
// visibly short.
//
// What we assert: Jessi's full canonical Torso order after migration.
// His equipment names map onto the personal-app structure:
//   - Sagittal Plane Pulldowns ← Seated Row Machine slot (sagittal-plane pull)
//   - Dips ← Weighted Dips slot
//   - Transverse Plane Rows ← Upper Back Row Machine slot (transverse-plane row)
//
// And no Dips / Transverse Plane Rows leaks into Limbs.
//
// To verify this test is real: revert any of the classifier changes in
// `migrateJessiToTorsoLimbs` (drop `\bdip`, `transverse`, or `sagittal`
// from the relevant regex). The test should fail.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiStaleNameConfig, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PUBLIC_APP_ROOT = path.resolve(__dirname, '..', '..', '..', 'public_gym_app');

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);

        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPublicApp(page, {
            exerciseConfig: jessiStaleNameConfig(),
            schedule: jessiDefaultSchedule(),
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1500));

        const after = await page.evaluate(() => {
            const cfg = JSON.parse(localStorage.getItem('gym-local:gymExerciseConfig'));
            return {
                day1: (cfg.days[1] || []).map(e => e.name),
                day2: (cfg.days[2] || []).map(e => e.name),
            };
        });

        const expectedTorso = [
            'Chest Flies',
            'Incline Chest Press',
            'Sagittal Plane Pulldowns',
            'Dips',
            'Cable Lateral Raises',
            'Frontal Plane Pulldowns',
            'Transverse Plane Rows',
            'Kelso Shrugs',
            'Shoulder Press Machine',
        ];
        eq(after.day1, expectedTorso,
            'Jessi Torso order mirrors the personal-app split (sagittal pull at slot 3, dips at slot 4, transverse row at slot 7)');

        ok(!after.day2.includes('Dips'),
            'Limbs day must NOT contain "Dips"');
        ok(!after.day2.includes('Transverse Plane Rows'),
            'Limbs day must NOT contain "Transverse Plane Rows"');

        eq(errors, [], 'no console errors during load');

        console.log('PASS: stale display names "Dips" and "Transverse Plane Rows" classified onto Torso.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
