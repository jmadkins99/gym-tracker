// What this test covers
// ----------------------
// Locks in the canonical Full Body exercise order for the personal app.
// If someone (or a migration) accidentally shuffles or drops an exercise,
// this test screams.
//
// Full Body (single day): lateral raises, reverse wrist curls, cable
//   wrist curls, preacher curls, tricep extensions, chest flies, incline
//   chest press, sagittal plane pulldowns, frontal plane pulldowns,
//   transverse plane rows, kelso shrugs, shoulder press, ab crunches,
//   calf raises, hip adduction, stiff legged deadlifts, pendulum squats.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readCards, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const EXPECTED_FULL_BODY = [
    'Curls with Shoulder Extension',
    'Overhead Tricep Extensions',
    'Lateral Raises',
    'Reverse Wrist Curls',
    'Cable Wrist Curls',
    'Preacher Curls',
    'Tricep Extensions',
    'Chest Flies',
    'Incline Chest Press',
    'Sagittal Plane Pulldowns',
    'Frontal Plane Pulldowns',
    'Transverse Plane Rows',
    'Kelso Shrugs',
    'Ab Crunches',
    'Shoulder Press',
    'Calf Raises',
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
