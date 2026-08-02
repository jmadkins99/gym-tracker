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
const { launch, attachConsole, waitForApp, readCards, selectDayType } = require('../lib/browser');
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
        await selectDayType(page, 'upper');

        // Log frontal-pulldowns with its pre-filled weight/reps.
        await page.evaluate(() => {
            const card = document.querySelector('[data-exercise-id="frontal-pulldowns"]');
            const btn = Array.from(card.querySelectorAll('button')).find(b => /LOG/i.test(b.textContent));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 250));

        // Persisted immediately (before any reload)?
        let saved = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]'), NS);
        eq(saved.length, 2, 'unsubmitted today-entry added to history');
        ok(!saved[0].submitted, 'today entry is unsubmitted');

        // Reload: the mid-workout state must come back.
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'upper');

        const restored = await page.evaluate(() => {
            const card = document.querySelector('[data-exercise-id="frontal-pulldowns"]');
            return {
                logged: card.classList.contains('logged'),
                btnText: Array.from(card.querySelectorAll('button'))
                    .find(b => /LOG/i.test(b.textContent))?.textContent?.trim() || '',
            };
        });
        ok(restored.logged, 'card restored in logged state after reload');
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
