// What this test covers
// ----------------------
// The Sep 2026 switch from Anterior / Posterior to a single Full Body day, as
// a fresh install sees it (DEFAULT_EXERCISES, no saved config).
//
// Not to be confused with the Jun–Aug 2026 Full Body era, whose workouts are
// stored as day 'fullbody' (and `1` before that). This program's day id is
// 'full-body' — a different literal on purpose, so the two eras never share a
// history rendering path. Test 124 covers what a device with saved Anterior /
// Posterior state becomes.
//
// Locks in:
//   1. There is no day toggle at all. One day in PROGRAM_DAYS means nothing to
//      choose between, so no [data-day-type] button renders.
//   2. Every weekday opens on 'full-body'. There are no rest days in the
//      schedule, so the weekday map is gone rather than trivially constant.
//   3. The deck renders every movement in the Full Body order and nothing
//      else — the retired cardio movements stay unreachable.
//   4. A 'full-body' workout is labelled "Full Body" in History.
//
// If you are here because you changed the order and this test failed: update
// the list below AND bump EXERCISE_CONFIG_VERSION in config.js — a device with
// a saved config keeps its old order until the version changes (test 124 is
// the pin on that half).
//
// To verify this test is real: put a second entry back in PROGRAM_DAYS. The
// toggle assertion fails; so does the weekday one if getDefaultDayType goes
// back to a weekday map.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { readDeckNames } = require('../lib/deck');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// Fresh-install display names, in order.
const EXPECTED_FULL_BODY = [
    'Recline Curls',
    'Preacher Curls',
    'Chest Flies',
    'Low to High Flies',
    'Chest Press',
    'Supinations',
    'Tricep Extensions',
    'Lateral Raises',
    'Overhead Tricep Extensions',
    'Lu Raises',
    'JM Press',
    'Sagittal Pulldowns',
    'Frontal Pulldowns',
    'Kelso Shrugs',
    'Reverse Wrist Curls',
    'Wrist Curls',
    'Ab Crunches',
    'Back Extensions',
    'Leg Extensions',
    'Calf Raises',
    'Squats',
    'Transverse Rows',
    'Hip Adduction',
];

// Reverse Wrist Curls came back in Oct 2026 (v26) as a new movement on a new
// id, so only its retired partner is listed.
const RETIRED = ['Body Weight Squats', 'Burpee Jump Tucks', 'Assault Bike', 'Stairmaster',
    'Cable Wrist Curls'];

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

        // 1. No toggle.
        const toggles = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-day-type]'))
                .map(b => b.getAttribute('data-day-type')));
        eq(toggles, [], 'no day-type toggle renders for a one-day program');

        // 2. Every weekday. Aug 2-8 2026 runs Sunday..Saturday.
        const byWeekday = await page.evaluate(() => {
            const out = [];
            for (let d = 2; d <= 8; d++) out.push(getDefaultDayType(new Date(2026, 7, d)));
            return out;
        });
        eq(byWeekday, Array(7).fill('full-body'), 'every weekday opens on Full Body');

        // 3. The roster, in order.
        const names = await readDeckNames(page);
        eq(names, EXPECTED_FULL_BODY, 'Full Body renders every movement in order');
        for (const name of RETIRED) {
            ok(!names.includes(name), `"${name}" is not on the program`);
        }

        // 4. The label.
        eq(await page.evaluate(() => getWorkoutDayLabel({ day: 'full-body', date: '2026-09-25' })),
            'Full Body', "a 'full-body' workout is labelled Full Body");

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Full Body renders as one untoggled day in the new order.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
