// What this test covers
// ----------------------
// The Cardio day type: an alternating second day reachable via the Full
// Body / Cardio toggle, which the app defaults to by weekday (Tue/Thu).
//
// Checks:
//   1. On load (no toggle interaction) the active day type matches the
//      weekday rule (CARDIO_DAYS from config + today's getDay()).
//   2. Switching to Cardio renders exactly Body Weight Squats, Stairmaster,
//      Assault Bike — in that order.
//   3. First-session defaults: squats reps pre-fill 50 with weight locked to
//      "BW"; stairmaster defaults to Level 7 / 10:00; assault bike Watts
//      defaults to 25 and Intensity defaults to 20/40 (both dropdowns).
//   4. Switching back to Full Body restores the full-body list.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

function extractArrayLiteral(source, name) {
    const start = source.indexOf(`const ${name} =`);
    if (start === -1) throw new Error(`could not find ${name} in config.js`);
    const openIdx = source.indexOf('[', start);
    const closeIdx = source.indexOf(']', openIdx);
    return new Function(`return ${source.slice(openIdx, closeIdx + 1)}`)();
}

// Reads a cardio card's fields by exercise name: the locked text input, the
// editable number input value, and any <select> values keyed by data-field.
async function readCardioCard(page, name) {
    return page.evaluate((n) => {
        const cards = Array.from(document.querySelectorAll('.exercise-card'));
        const card = cards.find(c => c.querySelector('.exercise-name')?.textContent?.trim() === n);
        if (!card) return null;
        const lockedInputs = Array.from(card.querySelectorAll('input[type="text"]')).map(i => i.value);
        const numberInput = card.querySelector('input[type="number"]');
        const selects = {};
        card.querySelectorAll('select[data-field]').forEach(s => { selects[s.getAttribute('data-field')] = s.value; });
        return { lockedInputs, numberValue: numberInput ? numberInput.value : null, hasNumber: !!numberInput, selects };
    }, name);
}

async function cardNames(page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('.exercise-card .exercise-name')).map(e => e.textContent.trim()));
}

(async () => {
    const configSrc = fs.readFileSync(path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const CARDIO_DAYS = extractArrayLiteral(configSrc, 'CARDIO_DAYS');
    const expectedDefaultIsCardio = CARDIO_DAYS.includes(new Date().getDay());

    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // 1. Default-by-weekday wiring: squats card present iff today is a cardio day.
        const defaultNames = await cardNames(page);
        eq(defaultNames.includes('Body Weight Squats'), expectedDefaultIsCardio,
            `default day type matches weekday rule (cardio=${expectedDefaultIsCardio})`);

        // 2 + 3. Switch to Cardio and verify the three cards + defaults.
        ok(await selectDayType(page, 'cardio'), 'Cardio toggle exists and is clickable');
        const cardio = await cardNames(page);
        eq(cardio, ['Body Weight Squats', 'Stairmaster', 'Assault Bike'],
            'cardio day renders the three cards in order');

        const squats = await readCardioCard(page, 'Body Weight Squats');
        ok(squats, 'squats card present');
        ok(squats.lockedInputs.includes('BW'), 'squats weight locked to "BW"');
        eq(squats.numberValue, '50', 'squats reps pre-fill first-session default of 50');

        const stair = await readCardioCard(page, 'Stairmaster');
        ok(stair, 'stairmaster card present');
        eq(stair.selects.level, 'Level 7', 'stairmaster level defaults to Level 7');
        eq(stair.selects.time, '10:00', 'stairmaster time defaults to 10:00');

        const bike = await readCardioCard(page, 'Assault Bike');
        ok(bike, 'assault bike card present');
        eq(bike.selects.watts, '25', 'assault bike watts defaults to 25');
        eq(bike.selects.intensity, '20/40', 'assault bike intensity defaults to 20/40');

        // 4. Back to Full Body.
        ok(await selectDayType(page, 'fullbody'), 'Full Body toggle clickable');
        const fb = await cardNames(page);
        ok(!fb.includes('Body Weight Squats'), 'full body view no longer shows cardio cards');
        ok(fb.includes('Shoulder Press'), 'full body view shows full-body exercises');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: cardio day toggle, weekday default, and first-session defaults all work.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
