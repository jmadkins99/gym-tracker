// What this test covers
// ----------------------
// Reproduces Jessi's 2026-06-09 backup: stale display names like "Dips"
// (no "Weighted" prefix) and "Transverse Plane Rows" that need to be
// preserved through the Full Body migration.
//
// Drops 3 movements: Cable Lateral Raises (matches /lateral raise/),
// Reverse Wrist Curls, Cable Wrist Curls. Everything else flattens into
// a single day in canonical order.

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
                day2Exists: !!cfg.days[2],
            };
        });

        const expectedOrder = [
            'Preacher Curls',
            'Tricep Extensions',
            'Chest Flies',
            'Incline Chest Press',
            'Sagittal Plane Pulldowns',
            'Frontal Plane Pulldowns',
            'Transverse Plane Rows',
            'Kelso Shrugs',
            'Shoulder Press',
            'Ab Crunches',
            'Calf Raises',
            'Hip Adduction',
            'Stiff Legged Deadlifts',
            'Pendulum Squats',
        ];
        eq(after.day1, expectedOrder,
            'Jessi Full Body order preserves stale "Transverse" name, drops Dips, renames Leg Extensions → Hip Adduction');

        ok(!after.day1.includes('Cable Lateral Raises'),
            'Cable Lateral Raises dropped from new Full Body program');
        ok(!after.day1.includes('Reverse Wrist Curls'),
            'Reverse Wrist Curls dropped from new Full Body program');
        ok(!after.day1.includes('Cable Wrist Curls'),
            'Cable Wrist Curls dropped from new Full Body program');
        ok(!after.day1.includes('Dips'),
            'Dips dropped from new Full Body program (matches the overhead-tricep drop on personal)');
        ok(!after.day1.includes('Leg Extensions'),
            'Leg Extensions renamed to "Hip Adduction" to match personal-app display');
        eq(after.day2Exists, false, 'no day 2 after Full Body migration');

        eq(errors, [], 'no console errors during load');

        console.log('PASS: stale names preserved, dropped movements removed, single day intact.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
