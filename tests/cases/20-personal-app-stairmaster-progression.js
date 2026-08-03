// What this test covers
// ----------------------
// Stairmaster Time progresses +10 seconds per session (Aug 2026; cardio PRs had
// been off since June) with the green "+10 seconds" hint on the Time box, while
// Level is still carried over verbatim. From 12:00 / Level 9 the next session
// suggests 12:10 / Level 9.
//
// Two things make this worth its own case after the Aug 2026 split:
//   1. Stairmaster moved out of the code-only CARDIO_EXERCISES constant and
//      into the user-configurable DEFAULT_EXERCISES list, on Lower. The
//      suggestion is driven off `type === 'stairmaster'`, not off which list it
//      lives in, and this proves the move didn't drop its progression.
//   2. The lookup source here is a *legacy Cardio-day* workout — the last
//      stairmaster session most real history has. Lookups are by exercise id
//      and ignore `day`, so a Lower day must still find it.

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
        await selectDayType(page, 'lower');

        const stair = await readCardioCard(page, 'Stairmaster');
        ok(stair, 'stairmaster card present on the Lower day');
        eq(stair.selects.level, 'Level 9', 'stairmaster carries over last session level (9)');
        eq(stair.selects.time, '12:10', 'stairmaster suggests last time + 10s (12:00 -> 12:10)');
        contains(stair.text, '+10 seconds', 'stairmaster shows the green +10 seconds badge');

        // The retired cardio movements are not on this day (or any other).
        eq(await readCardioCard(page, 'Body Weight Squats'), null,
            'Body Weight Squats is retired and does not render on Lower');
        eq(await readCardioCard(page, 'Assault Bike'), null,
            'Assault Bike is retired and does not render on Lower');

        // At the 20:00 top of the dropdown the suggestion pins there and the
        // hint goes away — there is no +10 left to offer.
        await seedPersonalApp(page, {
            workoutHistory: [
                workoutEntry({
                    date: '2026-06-23T20:00:00Z', day: 'cardio', submitted: true,
                    exercises: [
                        { id: 'stairmaster', name: 'Stairmaster', type: 'stairmaster', level: 'Level 10', time: '20:00' },
                    ],
                }),
            ],
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'lower');

        const capped = await readCardioCard(page, 'Stairmaster');
        eq(capped.selects.time, '20:00', 'stairmaster suggestion caps at 20:00');
        ok(!capped.text.includes('+10 seconds'), 'no +10 seconds badge once capped at 20:00');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: stairmaster suggests +10s per session on Lower, capped at 20:00.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
