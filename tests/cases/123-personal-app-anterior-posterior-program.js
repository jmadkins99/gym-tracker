// What this test covers
// ----------------------
// The Nov 2026 (v28) Anterior / Posterior program as a fresh install's deck
// renders it (DEFAULT_EXERCISES, no saved config): each day shows its own
// movements in program order and nothing else. The retired movements stay
// unreachable, including the three v28 took off (Dumbbell Lat Pullover,
// Transverse Rows, Hip Adduction).
//
// Case 50 pins the same roster at config level. This one is the rendered half:
// it catches a deck that filters or sorts the roster wrongly even when the
// config is right. Which day opens, and the lock, are case 143's; the History
// labels are case 52's. Test 124 covers what a device with a saved Full Body
// config becomes.
//
// If you are here because you changed the order and this test failed: update
// the lists below AND bump EXERCISE_CONFIG_VERSION in config.js. A device with
// a saved config keeps its old order until the version changes (test 124 is
// the pin on that half).
//
// To verify this test is real: swap two Posterior orders in DEFAULT_EXERCISES.
// The Posterior list fails.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { readDeckNames } = require('../lib/deck');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// Fresh-install display names, in order.
const EXPECTED_ANTERIOR = [
    'Chest Flies',
    'Low to High Flies',
    'High to Low Flies',
    'Chest Press',
    'Tricep Extensions',
    'Lateral Raises',
    'Overhead Tricep Extensions',
    'Lu Raises',
    'JM Press',
    'Leg Extensions',
    'Squats',
];
const EXPECTED_POSTERIOR = [
    'Recline Curls',
    'Preacher Curls',
    'Supinations',
    'Sagittal Pulldowns',
    'Frontal Pulldowns',
    'Ab Crunches',
    'Kelso Shrugs',
    'Reverse Wrist Curls',
    'Wrist Curls',
    'Calf Raises',
    'Stiff Legged Deadlift',
];

// Reverse Wrist Curls came back in Oct 2026 (v26) as a new movement on a new
// id, so only its retired partner is listed.
const RETIRED = ['Body Weight Squats', 'Burpee Jump Tucks', 'Assault Bike', 'Stairmaster',
    'Cable Wrist Curls', 'Dumbbell Lat Pullover', 'Transverse Rows', 'Hip Adduction'];

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

        const seen = [];
        for (const [day, expected, label] of [
            ['anterior-2', EXPECTED_ANTERIOR, 'Anterior'],
            ['posterior-2', EXPECTED_POSTERIOR, 'Posterior'],
        ]) {
            await selectDayType(page, day);
            const names = await readDeckNames(page);
            eq(names, expected, `${label} renders its movements in order`);
            seen.push(...names);
        }
        for (const name of RETIRED) {
            ok(!seen.includes(name), `"${name}" is not on the program`);
        }

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Anterior and Posterior each render their own movements in order.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
