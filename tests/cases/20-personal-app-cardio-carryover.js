// What this test covers
// ----------------------
// Cardio-day fields carry over last session's values verbatim — no
// progression and no green suggestion hints — driven off a seeded prior
// cardio workout:
//   - Body Weight Squats: reps stay at last session (50, NOT 75).
//   - Stairmaster: time and Level stay at last session (12:00 / Level 9).
//   - Assault Bike: intensity and watts stay at last session (25/35 / 30).
//   - No green "+reps" / "+seconds" / "→" badges anywhere.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

async function readCardioCard(page, name) {
    return page.evaluate((n) => {
        const cards = Array.from(document.querySelectorAll('.exercise-card'));
        const card = cards.find(c => c.querySelector('.exercise-name')?.textContent?.trim() === n);
        if (!card) return null;
        const numberInput = card.querySelector('input[type="number"]');
        const selects = {};
        card.querySelectorAll('select[data-field]').forEach(s => { selects[s.getAttribute('data-field')] = s.value; });
        return {
            text: card.textContent,
            numberValue: numberInput ? numberInput.value : null,
            numberPlaceholder: numberInput ? numberInput.placeholder : null,
            selects,
        };
    }, name);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // A completed cardio session a few days ago.
        const workoutHistory = [
            workoutEntry({
                date: '2026-06-23T20:00:00Z', day: 'cardio', submitted: true,
                exercises: [
                    { id: 'body-weight-squats', name: 'Body Weight Squats', type: 'bodyweight', weight: 'BW', reps: '50' },
                    { id: 'stairmaster', name: 'Stairmaster', type: 'stairmaster', level: 'Level 9', time: '12:00' },
                    { id: 'assault-bike', name: 'Assault Bike', type: 'assault-bike', watts: '30', intensity: '25/35' },
                ],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'cardio');

        const squats = await readCardioCard(page, 'Body Weight Squats');
        ok(squats, 'squats card present');
        eq(squats.numberValue, '50', 'squats carries over last reps (50, not +25)');
        ok(!squats.text.includes('+25 reps'), 'squats shows no green +reps badge');

        const stair = await readCardioCard(page, 'Stairmaster');
        ok(stair, 'stairmaster card present');
        eq(stair.selects.level, 'Level 9', 'stairmaster carries over last session level (9)');
        eq(stair.selects.time, '12:00', 'stairmaster carries over last time (12:00, not +30s)');
        ok(!stair.text.includes('+30 seconds'), 'stairmaster shows no green +seconds badge');

        const bike = await readCardioCard(page, 'Assault Bike');
        ok(bike, 'assault bike card present');
        eq(bike.selects.watts, '30', 'assault bike carries over last session watts (30)');
        eq(bike.selects.intensity, '25/35', 'assault bike carries over last intensity (25/35, not +1)');
        ok(!bike.text.includes('→'), 'assault bike shows no green → badge');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: cardio fields carry over last session (no progression, no green hints).');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
