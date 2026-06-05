// What this test covers
// ----------------------
// Locks in the canonical Torso/Limbs exercise order for the personal app.
// If someone (or a migration) accidentally moves an exercise to the wrong
// day or shuffles the order, this test screams.
//
// Torso (Day 1): Chest Flies, Incline Chest Flies, Seated Row Machine,
//                Weighted Dips, Lateral Raises, Frontal Plane Pulldowns,
//                Upper Back Row Machine, Kelso Shrugs, Shoulder Press Machine
//
// Limbs (Day 2): Preacher Curls, Cuffed Tricep Pushdown, Reverse Wrist
//                Curls, Cable Wrist Curls, Ab Crunch Machine, Seated Calf
//                Raise Machine, Hip Adduction, Stiff Legged Deadlifts,
//                Pendulum Squats

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readCards } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const EXPECTED_TORSO = [
    'Chest Flies',
    'Incline Chest Flies',
    'Seated Row Machine',
    'Weighted Dips',
    'Lateral Raises',
    'Frontal Plane Pulldowns',
    'Upper Back Row Machine',
    'Kelso Shrugs',
    'Shoulder Press Machine',
];

const EXPECTED_LIMBS = [
    'Preacher Curls',
    'Cuffed Tricep Pushdown',
    'Reverse Wrist Curls',
    'Cable Wrist Curls',
    'Ab Crunch Machine',
    'Seated Calf Raise Machine',
    'Hip Adduction',
    'Stiff Legged Deadlifts',
    'Pendulum Squats',
];

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // Read Torso (the app defaults to Day 1).
        const torsoNames = (await readCards(page)).map(c => c.name);
        eq(torsoNames, EXPECTED_TORSO, 'Torso (Day 1) exercises in canonical order');

        // Switch to Limbs and read again.
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('.day-btn'))
                .find(b => b.textContent.trim() === 'Limbs');
            btn?.click();
        });
        await new Promise(r => setTimeout(r, 300));
        const limbsNames = (await readCards(page)).map(c => c.name);
        eq(limbsNames, EXPECTED_LIMBS, 'Limbs (Day 2) exercises in canonical order');

        eq(errors, [], 'no console errors during load');

        console.log('PASS: Torso and Limbs render in canonical order.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
