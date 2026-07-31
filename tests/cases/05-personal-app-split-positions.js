// What this test covers
// ----------------------
// Locks in the canonical Full Body exercise order for the personal app.
// If someone (or a migration) accidentally shuffles or drops an exercise,
// this test screams.
//
// Full Body (single day), July 2026 order: the five arm/forearm openers,
//   then the chest/back block, then the trunk and lower-body tail.
//
// These are the DEFAULT_EXERCISES names and order — what a fresh install
// renders. A device with a saved config picks the same order up via
// EXERCISE_CONFIG_VERSION; test 40 covers that path.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readCards, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const EXPECTED_FULL_BODY = [
    'Preacher Curls',
    'Overhead Tricep Extensions',
    'Lateral Raises',
    'Reverse Wrist Curls',
    'Cable Wrist Curls',
    'Unilateral Chest Flies',
    'Recline Curls',
    'Frontal Plane Pulldowns',
    'Incline Chest Press',
    'Transverse Plane Rows',
    'Kelso Shrugs',
    'Sagittal Plane Pulldowns',
    'Tricep Extensions',
    'Ab Crunches',
    'Shoulder Press',
    'Calf Raises',
    'Hip Adduction',
    'Back Extensions',
    'Leg Press',
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
        await selectDayType(page, 'fullbody');

        const names = (await readCards(page)).map(c => c.name);
        eq(names, EXPECTED_FULL_BODY, 'Full Body exercises render in canonical order');

        // The Full Body program has no day selector — confirm none rendered.
        const dayBtnCount = await page.evaluate(() =>
            document.querySelectorAll('.day-btn').length
        );
        eq(dayBtnCount, 0, 'no day-btn selectors visible in Full Body mode');

        eq(errors, [], 'no console errors during load');

        console.log('PASS: Full Body renders in canonical order with no day selector.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
