// What this test covers
// ----------------------
// The Aug 2026 switch from Upper / Lower to Anterior / Posterior.
//
// Not to be confused with the numeric-day Anterior/Posterior rotations of
// Feb 2026 and Apr 2026 — different programs that happen to share the two
// words. getWorkoutDayLabel prints the same labels for all three; only the
// stored `day` value tells them apart.
//
// Locks in, for a fresh install (DEFAULT_EXERCISES — what a brand new device
// renders):
//   1. The weekday defaulting rule: POSTERIOR_DAYS (Mon/Wed/Fri) open on
//      Posterior, every other weekday — including Sunday — opens on Anterior.
//   2. Anterior renders its 12 weighted lifts in canonical order and nothing else.
//   3. Posterior renders its 9 lifts in canonical order.
//   4. The two day types are disjoint and together cover the whole program.
//   5. The retired Cardio day is gone, and so are the Upper/Lower toggles:
//      no 'fullbody'/'cardio'/'upper'/'lower' toggle survives, and Body Weight
//      Squats / Burpee Jump Tucks / Assault Bike / Stairmaster are not
//      loggable on either day. (Their *history* is a separate concern — test
//      44 covers that it still renders.)
//
// Stairmaster came off the program in August 2026. It was the only
// 'Cardio'-category entry, so NEITHER day renders a section heading now — the
// empty-heading assertions below are what keep a stray "Cardio" bar from
// reappearing above nothing.
//
// Test 05 was the Full Body equivalent of this and is replaced by it.
//
// If you are here because you changed the order and this test failed: update
// the list below AND bump EXERCISE_CONFIG_VERSION in config.js. A fresh
// install reads DEFAULT_EXERCISES directly and will look right either way, but
// any device with a saved config — including a localhost browser you have
// already loaded once — keeps its old order until the version changes. Test 54
// is the pin on that half.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readCards, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const EXPECTED_ANTERIOR = [
    'Chest Press',
    'Incline Chest Press',
    'Chest Flies',
    'Shoulder Press',
    'Lateral Raises',
    'Overhead Tricep Extensions',
    // Abs and quads moved up ahead of Tricep Extensions and the wrist pair, Aug 2026, so the
    // big movements are done before the small isolation work.
    'Ab Crunches',
    // Its id is `actual-leg-extensions` — the `leg-extensions` id renders as
    // Hip Adduction, over on Posterior.
    'Leg Extensions',
    'Tricep Extensions',
    // The wrist pair splits by anatomy under this program: flexors here,
    // extensors on Posterior. They shared a day under Upper/Lower.
    'Reverse Wrist Curls',
    'Cable Wrist Curls',
    // Quad-dominant, so it closes the anterior day. Its id is `hip-adduction`;
    // the row named Hip Adduction is `leg-extensions`. Both mismatches frozen.
    'Leg Press',
];

const EXPECTED_POSTERIOR = [
    // Biceps are grouped with the pulling work rather than with the arms.
    'Recline Curls',
    'Frontal Plane Pulldowns',
    'Sagittal Plane Pulldowns',
    'Transverse Plane Rows',
    'Kelso Shrugs',
    'Preacher Curls',
    'Back Extensions',
    // Adductor magnus is a hip extensor, hence the posterior chain.
    'Hip Adduction',
    'Calf Raises',
];

const RETIRED = ['Body Weight Squats', 'Burpee Jump Tucks', 'Assault Bike', 'Stairmaster'];

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
    const POSTERIOR_DAYS = extractArrayLiteral(configSrc, 'POSTERIOR_DAYS');
    const expectedDefaultIsPosterior = POSTERIOR_DAYS.includes(new Date().getDay());

    eq(POSTERIOR_DAYS, [1, 3, 5], 'POSTERIOR_DAYS is Mon/Wed/Fri');

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
        //
        // The probe must be a POSTERIOR-only name. Leg Press was the probe
        // under Upper/Lower, where it was Lower-only — it is Anterior now, so
        // reusing it would invert the assertion's sense while leaving the
        // expectation variable pointing the other way, and the case would pass
        // or fail depending on the day of the week. Kelso Shrugs is
        // Posterior-only and has no such history.
        const defaultNames = (await readCards(page)).map(c => c.name);
        eq(defaultNames.includes('Kelso Shrugs'), expectedDefaultIsPosterior,
            `default day type matches weekday rule (posterior=${expectedDefaultIsPosterior})`);

        // 5a. Every retired day type must be unselectable — the two cardio-era
        // ones and the two from the Upper/Lower split this replaced.
        for (const gone of ['fullbody', 'cardio', 'upper', 'lower']) {
            eq(await selectDayType(page, gone, { optional: true }), false,
                `no "${gone}" toggle remains`);
        }

        // Anterior sits on the left. DEFAULT_EXERCISES and the Settings list are
        // ordered Anterior-first to match; nothing enforces that automatically,
        // so this is the pin on the toggle half of it (test 55 pins Settings).
        const toggleOrder = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-day-type]'))
                .map(b => b.getAttribute('data-day-type')));
        eq(toggleOrder, ['anterior', 'posterior'], 'Anterior is the first (left) toggle button');

        // 2. Anterior.
        ok(await selectDayType(page, 'anterior'), 'Anterior toggle exists and is clickable');
        const anterior = (await readCards(page)).map(c => c.name);
        eq(anterior, EXPECTED_ANTERIOR, 'Anterior renders its 12 movements in canonical order');
        eq(await sectionTitles(page), [],
            'Anterior has no Cardio section now that Stairmaster is retired');

        // 3. Posterior.
        ok(await selectDayType(page, 'posterior'), 'Posterior toggle exists and is clickable');
        const posterior = (await readCards(page)).map(c => c.name);
        eq(posterior, EXPECTED_POSTERIOR, 'Posterior renders its 9 movements in canonical order');
        eq(await sectionTitles(page), [], 'Posterior has no Cardio section');

        // 4. Disjoint, and together the whole program.
        const overlap = anterior.filter(n => posterior.includes(n));
        eq(overlap, [], 'no exercise appears on both days');
        eq(anterior.length + posterior.length, 21, 'the two days cover all 21 movements');

        // 5b. The four retired cardio movements are unreachable.
        for (const name of RETIRED) {
            ok(!anterior.includes(name) && !posterior.includes(name),
                `"${name}" is retired from the active program`);
        }

        // The program has no legacy day selector.
        const dayBtnCount = await page.evaluate(() => document.querySelectorAll('.day-btn').length);
        eq(dayBtnCount, 0, 'no legacy .day-btn selectors rendered');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Anterior/Posterior split renders in canonical order with the Cardio day retired.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
