// What this test covers
// ----------------------
// The write path end-to-end: logging an exercise through the UI persists an
// unsubmitted entry to storage, and a full page reload restores it — the card
// comes back in its "✓ Logged" state with today's entry still unsubmitted.
// This is what a user relies on when they close the tab mid-workout.
//
// Written as a pin-down BEFORE the async storage-repo refactor: it guards
// every history-save call site conversion (a dropped or broken save shows up
// here as a missing entry after reload).

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { ACTIVE, goToCard, goToCardAndLog } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Seed one prior session so the weight input pre-fills to a known value.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-30T20:00:00Z', day: 'fullbody',
                exercises: [{ id: 'frontal-pulldowns', name: 'Frontal Plane Pulldowns', weight: '160', reps: '4' }],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.evaluate((ns) => localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'posterior');

        // Log Frontal Plane Pulldowns with its pre-filled weight/reps. The deck
        // mounts three cards, so this navigates to it and opens it first —
        // reaching straight for [data-exercise-id] only worked when every card
        // was on screen.
        await goToCardAndLog(page, 'Frontal Plane Pulldowns');

        // Persisted immediately (before any reload)?
        let saved = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]'), NS);
        eq(saved.length, 2, 'unsubmitted today-entry added to history');
        ok(!saved[0].submitted, 'today entry is unsubmitted');

        // Reload: the mid-workout state must come back.
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'posterior');

        // A logged card opens itself as a review, so after the reload it should
        // be found already showing its numbers with a spent LOG button.
        await goToCard(page, 'Frontal Plane Pulldowns');
        const restored = await page.evaluate((sel) => {
            const slot = document.querySelector(sel);
            const btn = slot.querySelector('.log-btn');
            return {
                logged: !!slot.querySelector('.card.is-done'),
                review: !!slot.querySelector('.card-open'),
                btnText: btn ? btn.textContent.trim() : '',
            };
        }, ACTIVE);
        ok(restored.logged, 'card restored in logged state after reload');
        ok(restored.review, 'and opens itself as a review');
        eq(restored.btnText, '✓ Logged', 'LOG button shows logged after reload');

        saved = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]'), NS);
        eq(saved.length, 2, 'history intact after reload');
        const today = saved[0];
        ok(!today.submitted, 'today entry still unsubmitted after reload');
        const fp = today.exercises.find(e => e.id === 'frontal-pulldowns');
        eq(fp.weight, '160', 'logged weight persisted through reload');
        eq(fp.reps, '4', 'logged reps persisted through reload');

        eq(errors, [], 'no console errors during log/reload');
        console.log('PASS: mid-workout logged state persists to storage and restores after reload.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
