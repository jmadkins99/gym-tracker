// What this test covers
// ----------------------
// Public-app write path end-to-end: logging an exercise through the UI
// persists an unsubmitted entry to storage, and a full page reload restores
// the card in its logged state with the entry still unsubmitted. Mirrors
// case 35 for the personal app.
//
// Written as a pin-down BEFORE the public app's async storage-repo refactor:
// it guards every history-save call site conversion there.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readCards } = require('../lib/browser');
const {
    seedPublicApp,
    workoutEntry,
    jessiPreMigrationConfig,
    jessiDefaultSchedule,
} = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PUBLIC_APP_ROOT = path.resolve(__dirname, '..', '..', '..', 'public_gym_app');
const NS = 'gym-local:';

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // One prior session so the weight input pre-fills to a known value.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-30T20:00:00Z', day: 1,
                exercises: [{ id: 'jfront', name: 'Frontal Plane Pulldowns', weight: '160', reps: '6' }],
            }),
        ];
        await seedPublicApp(page, {
            exerciseConfig: jessiPreMigrationConfig(),
            workoutHistory,
            schedule: jessiDefaultSchedule(),
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        const cards = await readCards(page);
        ok(cards.find(c => c.name === 'Frontal Plane Pulldowns'),
            'Frontal Plane Pulldowns card rendered before logging');

        // Log it with its pre-filled values.
        await page.evaluate(() => {
            const card = Array.from(document.querySelectorAll('.exercise-card'))
                .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === 'Frontal Plane Pulldowns');
            const btn = Array.from(card.querySelectorAll('button')).find(b => /LOG/i.test(b.textContent));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 250));

        let saved = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]'), NS);
        eq(saved.length, 2, 'unsubmitted today-entry added to history');
        ok(!saved[0].submitted, 'today entry is unsubmitted');

        // Reload: mid-workout state must come back.
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        const restored = await page.evaluate(() => {
            const card = Array.from(document.querySelectorAll('.exercise-card'))
                .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === 'Frontal Plane Pulldowns');
            return {
                logged: !!card && card.classList.contains('logged'),
            };
        });
        ok(restored.logged, 'card restored in logged state after reload');

        saved = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]'), NS);
        eq(saved.length, 2, 'history intact after reload');
        const today = saved[0];
        ok(!today.submitted, 'today entry still unsubmitted after reload');
        const fp = today.exercises.find(e =>
            e.id === 'jfront' || e.name === 'Frontal Plane Pulldowns');
        ok(fp, 'logged exercise present in the persisted entry');
        eq(fp.weight, '160', 'logged weight persisted through reload');
        ok(fp.reps && fp.reps !== 'NA', 'logged reps persisted through reload');

        eq(errors, [], 'no console errors during log/reload');
        console.log('PASS: public app mid-workout logged state persists and restores after reload.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
