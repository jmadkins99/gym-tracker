// What this test covers
// ----------------------
// The whole weekday -> day-type mapping, all seven days of it.
//
// getDefaultDayType is what decides which card you see when you open the app
// without touching the toggle, so it is the rule you actually live with:
// Mon/Wed/Fri open on Posterior, Tue/Thu/Sat and Sunday open on Anterior.
//
// Test 42 checks the default too, but only for whichever weekday the suite
// happens to run on — so a mapping that is wrong on Thursdays would sail past
// it six days out of seven. This case evaluates all seven in one pass, which
// is the only way that class of bug shows up reliably in CI.
//
// To verify this test is real: change POSTERIOR_DAYS to [2, 4, 6] in
// js/config.js, or invert the ternary in getDefaultDayType. Either fails here.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// Sun=0 .. Sat=6, matching Date.getDay().
const EXPECTED_BY_WEEKDAY = [
    'anterior',   // Sunday
    'posterior',  // Monday
    'anterior',   // Tuesday
    'posterior',  // Wednesday
    'anterior',   // Thursday
    'posterior',  // Friday
    'anterior',   // Saturday
];

function extractArrayLiteral(source, name) {
    const start = source.indexOf(`const ${name} =`);
    if (start === -1) throw new Error(`could not find ${name} in config.js`);
    const openIdx = source.indexOf('[', start);
    const closeIdx = source.indexOf(']', openIdx);
    return new Function(`return ${source.slice(openIdx, closeIdx + 1)}`)();
}

(async () => {
    const configSrc = fs.readFileSync(path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    eq(extractArrayLiteral(configSrc, 'POSTERIOR_DAYS'), [1, 3, 5],
        'POSTERIOR_DAYS is Mon/Wed/Fri');

    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // Aug 2-8 2026 is a Sun..Sat run, so this walks one full week in order.
        const actual = await page.evaluate(() => {
            const out = [];
            for (let d = 2; d <= 8; d++) out.push(getDefaultDayType(new Date(2026, 7, d)));
            return out;
        });

        // Guard the fixture itself: if those dates ever stop being Sun..Sat the
        // assertion below would be comparing the wrong things.
        const weekdays = await page.evaluate(() => {
            const out = [];
            for (let d = 2; d <= 8; d++) out.push(new Date(2026, 7, d).getDay());
            return out;
        });
        eq(weekdays, [0, 1, 2, 3, 4, 5, 6], 'the fixture dates run Sunday through Saturday');

        eq(actual, EXPECTED_BY_WEEKDAY,
            'every weekday maps to its canonical day type (Mon/Wed/Fri Posterior, rest Anterior)');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: all seven weekdays default to the right day type.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
