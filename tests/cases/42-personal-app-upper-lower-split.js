// What this test covers
// ----------------------
// The Aug 2026 switch from Full Body / Cardio to Lower / Upper.
//
// Locks in, for a fresh install (DEFAULT_EXERCISES — what a brand new device
// renders):
//   1. The weekday defaulting rule: LOWER_DAYS (Mon/Wed/Fri) open on Lower,
//      every other weekday — including Sunday — opens on Upper.
//   2. Lower renders its 7 weighted lifts in canonical order, then Stairmaster
//      last under its own "Cardio" section heading.
//   3. Upper renders its 12 lifts in canonical order.
//   4. The two day types are disjoint and together cover the whole program.
//   5. The retired Cardio day is gone: no 'fullbody'/'cardio' toggle survives,
//      and Body Weight Squats / Burpee Jump Tucks / Assault Bike are not
//      loggable on either day. (Their *history* is a separate concern — test
//      44 covers that it still renders.)
//
// Test 05 was the Full Body equivalent of this and is replaced by it.
//
// If you are here because you changed the order and this test failed: update
// the list below AND bump EXERCISE_CONFIG_VERSION in config.js. A fresh
// install reads DEFAULT_EXERCISES directly and will look right either way, but
// any device with a saved config — including a localhost browser you have
// already loaded once — keeps its old order until the version changes.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readCards, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const EXPECTED_LOWER = [
    'Reverse Wrist Curls',
    'Cable Wrist Curls',
    'Ab Crunches',
    // Added Aug 2026 under the fresh id `actual-leg-extensions` — the
    // `leg-extensions` id renders as Hip Adduction, two rows down.
    'Leg Extensions',
    'Calf Raises',
    'Hip Adduction',
    'Back Extensions',
    'Leg Press',
    'Stairmaster',
];

const EXPECTED_UPPER = [
    'Chest Flies',
    'Recline Curls',
    'Overhead Tricep Extensions',
    'Lateral Raises',
    'Frontal Plane Pulldowns',
    'Incline Chest Press',
    'Shoulder Press',
    'Transverse Plane Rows',
    'Kelso Shrugs',
    'Sagittal Plane Pulldowns',
    'Tricep Extensions',
    'Preacher Curls',
];

const RETIRED = ['Body Weight Squats', 'Burpee Jump Tucks', 'Assault Bike'];

function extractArrayLiteral(source, name) {
    const start = source.indexOf(`const ${name} =`);
    if (start === -1) throw new Error(`could not find ${name} in config.js`);
    const openIdx = source.indexOf('[', start);
    const closeIdx = source.indexOf(']', openIdx);
    return new Function(`return ${source.slice(openIdx, closeIdx + 1)}`)();
}

async function sectionTitles(page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('.section-title')).map(e => e.textContent.trim()));
}

(async () => {
    const configSrc = fs.readFileSync(path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const LOWER_DAYS = extractArrayLiteral(configSrc, 'LOWER_DAYS');
    const expectedDefaultIsLower = LOWER_DAYS.includes(new Date().getDay());

    eq(LOWER_DAYS, [1, 3, 5], 'LOWER_DAYS is Mon/Wed/Fri');

    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // 1. Default-by-weekday, with no toggle interaction at all.
        const defaultNames = (await readCards(page)).map(c => c.name);
        eq(defaultNames.includes('Stairmaster'), expectedDefaultIsLower,
            `default day type matches weekday rule (lower=${expectedDefaultIsLower})`);

        // 5a. The old day types must not be selectable any more.
        eq(await selectDayType(page, 'fullbody'), false, 'no "fullbody" toggle remains');
        eq(await selectDayType(page, 'cardio'), false, 'no "cardio" toggle remains');

        // Upper sits on the left. DEFAULT_EXERCISES and the Settings list are
        // ordered Upper-first to match; nothing enforces that automatically, so
        // this is the pin on the toggle half of it.
        const toggleOrder = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-day-type]'))
                .map(b => b.getAttribute('data-day-type')));
        eq(toggleOrder, ['upper', 'lower'], 'Upper is the first (left) toggle button');

        // 2. Lower.
        ok(await selectDayType(page, 'lower'), 'Lower toggle exists and is clickable');
        const lower = (await readCards(page)).map(c => c.name);
        eq(lower, EXPECTED_LOWER, 'Lower renders its 9 movements in canonical order');
        eq(await sectionTitles(page), ['Cardio'],
            'Stairmaster sits under its own "Cardio" heading at the bottom of Lower');

        // Stairmaster's first-session defaults, inherited from the retired
        // Cardio day (old test 19 was the only thing pinning these).
        const stair = await page.evaluate(() => {
            const card = Array.from(document.querySelectorAll('.exercise-card'))
                .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === 'Stairmaster');
            if (!card) return null;
            const selects = {};
            card.querySelectorAll('select[data-field]').forEach(s => {
                selects[s.getAttribute('data-field')] = s.value;
            });
            return selects;
        });
        ok(stair, 'Stairmaster card present on Lower');
        eq(stair.level, 'Level 7', 'Stairmaster level defaults to Level 7 with no history');
        eq(stair.time, '10:00', 'Stairmaster time defaults to 10:00 with no history');

        // 3. Upper.
        ok(await selectDayType(page, 'upper'), 'Upper toggle exists and is clickable');
        const upper = (await readCards(page)).map(c => c.name);
        eq(upper, EXPECTED_UPPER, 'Upper renders its 12 movements in canonical order');
        eq(await sectionTitles(page), [],
            'Upper has no Cardio section');

        // 4. Disjoint, and together the whole program.
        const overlap = lower.filter(n => upper.includes(n));
        eq(overlap, [], 'no exercise appears on both days');
        eq(lower.length + upper.length, 21, 'the two days cover all 21 movements');

        // 5b. The three retired cardio movements are unreachable.
        for (const name of RETIRED) {
            ok(!lower.includes(name) && !upper.includes(name),
                `"${name}" is retired from the active program`);
        }

        // The program has no legacy day selector.
        const dayBtnCount = await page.evaluate(() => document.querySelectorAll('.day-btn').length);
        eq(dayBtnCount, 0, 'no legacy .day-btn selectors rendered');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Lower/Upper split renders in canonical order with the Cardio day retired.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
