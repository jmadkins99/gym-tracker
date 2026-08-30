// What this test covers
// ----------------------
// The Weight Breakdown popover must render even when an exercise has NEVER
// been logged — using the configured WEEK_1_DEFAULTS weight as a fallback.
//
// Regression: a newly added exercise (curls-shoulder-extension) past Week 1
// had no previous data and no week-gated defaultWeight, so the breakdown's
// currentWeight resolved to 0 and the whole popover rendered empty. The user
// shouldn't have to log a first weight before the breakdown appears.
//
// We seed history for a DIFFERENT exercise several weeks ago so currentWeek
// is well past 1, then open the breakdown on the never-logged new exercise
// and assert it shows the pin-stack format computed from its default (25 lbs:
// 70% -> 17.5, 90% -> 22.5).

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { goToCard, revealCard, isRevealed, readDeckCard } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const TARGET_NAME = 'Recline Curls';

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // History for a different exercise ~4 weeks ago -> currentWeek > 1, and
        // the new exercise still has no previous data of its own.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-25T20:00:00Z', day: 1,
                exercises: [{ id: 'lateral-raises', name: 'Lateral Raises', weight: '30', reps: '7' }],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        // Pin the cached first-workout Monday so currentWeek is computed from the
        // seeded history (otherwise the first empty render caches "today" -> Week 1).
        await page.evaluate(() => {
            localStorage.setItem('gym-local:firstWorkoutMonday', '2026-05-25T00:00:00.000Z');
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'posterior');

        // Confirm we're genuinely past Week 1 (otherwise the week-gated
        // defaultWeight would mask the bug this test guards against).
        const weekText = await page.evaluate(() =>
            document.querySelector('.week-indicator')?.textContent || '');
        ok(/Week\s+(?:[2-9]|\d\d+)/.test(weekText),
            `app is past Week 1 (indicator: "${weekText}")`);

        // Open the Weight Breakdown on the never-logged new exercise.
        await goToCard(page, TARGET_NAME);
        await revealCard(page);
        const clicked = await isRevealed(page);
        ok(clicked, `${TARGET_NAME} opens to show its breakdown`);

        const breakdownText = (await readDeckCard(page, TARGET_NAME)).breakdown.join('  ~  ');

        // The breakdown must actually render (the bug produced an empty popover),
        // using the 25 lb default: 70% -> 17.5 lbs, 90% -> 22.5 lbs.
        contains(breakdownText, 'WARMUP 1', 'breakdown renders warmup #1 from default weight');
        contains(breakdownText, 'WARMUP 2', 'breakdown renders warmup #2 from default weight');
        contains(breakdownText, '10 lbs',
            'warmup #1 from the 25 lb default. Under the Aug 2026 rule a pin warmup ' +
            'rounds to the nearest 10 — 17.5 became 20 — and then steps down to 10 so ' +
            'the ramp still ascends past warmup #2');
        contains(breakdownText, '20 lbs', 'warmup #2 rounds 22.5 to a real pin position of 20');
        eq(errors, [], 'no console errors during load');

        console.log('PASS: Weight Breakdown renders from default weight with no logged history.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
