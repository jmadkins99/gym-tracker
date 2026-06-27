// What this test covers
// ----------------------
// The Weight (lbs) INPUT field must pre-fill from WEEK_1_DEFAULTS for an
// exercise that has never been logged — even past Week 1. Previously the input
// value chain ended in `previous?.weight || ''` (no default), so newly added
// exercises like curls-shoulder-extension / overhead-tricep-extensions showed
// a blank weight box on refresh until the first log.
//
// We seed history for a DIFFERENT exercise weeks ago so currentWeek > 1, then
// read the weight input value for the never-logged new exercises and assert it
// equals their configured default.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readCards, selectDayType } = require('../lib/browser');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

function extractObjectLiteral(source, name) {
    const start = source.indexOf(`const ${name} =`);
    if (start === -1) throw new Error(`could not find ${name} in config.js`);
    const openIdx = source.indexOf('{', start);
    const closeIdx = source.indexOf('};', openIdx);
    return new Function(`return ${source.slice(openIdx, closeIdx + 1)}`)();
}

(async () => {
    const configSrc = fs.readFileSync(
        path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const WEEK_1_DEFAULTS = extractObjectLiteral(configSrc, 'WEEK_1_DEFAULTS');

    const NEW_EXERCISES = [
        { name: 'Curls with Shoulder Extension', id: 'curls-shoulder-extension' },
        { name: 'Overhead Tricep Extensions', id: 'overhead-tricep-extensions' },
    ];

    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // History for a different exercise ~4 weeks ago -> currentWeek > 1, and
        // the new exercises still have no previous data of their own.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-25T20:00:00Z', day: 1,
                exercises: [{ id: 'lateral-raises', name: 'Lateral Raises', weight: '30', reps: '7' }],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.evaluate(() => {
            localStorage.setItem('gym-local:firstWorkoutMonday', '2026-05-25T00:00:00.000Z');
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'fullbody');

        const weekText = await page.evaluate(() =>
            document.querySelector('.week-indicator')?.textContent || '');
        ok(/Week\s+(?:[2-9]|\d\d+)/.test(weekText),
            `app is past Week 1 (indicator: "${weekText}")`);

        const cards = await readCards(page);
        for (const { name, id } of NEW_EXERCISES) {
            const expected = WEEK_1_DEFAULTS[id];
            ok(expected, `${id} has a WEEK_1_DEFAULTS entry to test against`);
            const card = cards.find(c => c.name === name);
            ok(card, `card "${name}" is rendered`);
            eq(card.weightValue, expected,
                `"${name}" weight input pre-fills its default (${expected}) with no history`);
        }

        eq(errors, [], 'no console errors during load');
        console.log('PASS: weight input pre-fills WEEK_1_DEFAULTS for never-logged exercises.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
