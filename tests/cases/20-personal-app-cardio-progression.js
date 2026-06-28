// What this test covers
// ----------------------
// Cardio-day session-over-session progression, driven off a seeded prior
// cardio workout:
//   - Body Weight Squats: +25 reps (50 -> 75), green "+25 reps" badge.
//   - Stairmaster: time +30s (12:00 -> 12:30) and Level carried over from
//     last session (Level 9, NOT reset to 7), green "+30 seconds" badge.
//   - Assault Bike: rounds +1 (5 -> 6) pre-filled as the value, green
//     "+1 round" badge.

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
                    { id: 'assault-bike', name: 'Assault Bike', type: 'assault-bike', intensity: '20/40', rounds: '5' },
                ],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'cardio');

        const squats = await readCardioCard(page, 'Body Weight Squats');
        ok(squats, 'squats card present');
        eq(squats.numberValue, '75', 'squats suggests last reps + 25 (50 -> 75)');
        contains(squats.text, '+25 reps', 'squats shows green +25 reps badge');

        const stair = await readCardioCard(page, 'Stairmaster');
        ok(stair, 'stairmaster card present');
        eq(stair.selects.level, 'Level 9', 'stairmaster carries over last session level (9, not 7)');
        eq(stair.selects.time, '12:30', 'stairmaster suggests last time + 30s (12:00 -> 12:30)');
        contains(stair.text, '+30 seconds', 'stairmaster shows green +30 seconds badge');

        const bike = await readCardioCard(page, 'Assault Bike');
        ok(bike, 'assault bike card present');
        eq(bike.numberValue, '6', 'assault bike suggests last rounds + 1 (5 -> 6)');
        contains(bike.text, '+1 round', 'assault bike shows green +1 round badge');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: cardio progression (+25 reps / +30s / level carryover / +1 round).');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
