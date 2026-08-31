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
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { ACTIVE, readDeckCard, goToCard, revealCard, logCard } = require('../lib/deck');
const {
    seedPublicApp,
    workoutEntry,
    jessiPreMigrationConfig,
    jessiDefaultSchedule,
} = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const { PUBLIC_APP_ROOT } = require('../lib/paths');
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

        const before = await readDeckCard(page, 'Frontal Plane Pulldowns');
        ok(before, 'Frontal Plane Pulldowns card rendered before logging');

        // Log it with its pre-filled values. readDeckCard has already navigated
        // to it and swiped it open, which is where LOG lives.
        await logCard(page);

        let saved = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]'), NS);
        eq(saved.length, 2, 'unsubmitted today-entry added to history');
        ok(!saved[0].submitted, 'today entry is unsubmitted');

        // Reload: mid-workout state must come back.
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // A logged card renders its open face unconditionally — it is a review
        // at that point — so navigating to it is enough to read its state back.
        await goToCard(page, 'Frontal Plane Pulldowns');
        const restored = await page.evaluate((sel) => {
            const card = document.querySelector(sel + ' .card');
            return { logged: !!card && card.classList.contains('logged') };
        }, ACTIVE);
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
