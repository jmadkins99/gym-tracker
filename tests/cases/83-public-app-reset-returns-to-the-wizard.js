// What this test covers
// ----------------------
// Clicking the real "Reset All Data" button, through both confirms, and
// landing back on the setup wizard without a reload.
//
// This is the case that catches a bug case 33 could not. Case 33 asserts that
// resetData clears every one-shot gate, but it does so by SIMULATING the reset
// — it removes the keys itself inside page.evaluate and then greps the app's
// source to check the real implementation lists the same ones. That design
// keeps the storage list honest, and its own comment says so, but it means the
// reset handler is never actually invoked. Nothing in the suite clicked the
// button.
//
// So this shipped and nothing noticed: resetData's tail called
// `setGympinMode(false)`, a setter for state that was deleted in Aug 2026 when
// the Weight Breakdown became unconditional. It threw a ReferenceError partway
// down the handler, which meant the THREE statements after it never ran —
// setRepsDropdown(null), setShowSettings(false) and setShowWizard(true). The
// storage side of the reset had already happened, so the user saw their data
// wiped, the Settings modal still open, and no wizard. It looked like the
// reset had half-worked until they refreshed the page by hand.
//
// The ordering is the whole point of the assertions below: everything that
// happens BEFORE the bad line still worked, which is exactly why this was
// invisible. Only the tail was lost. So the check is not "did storage clear"
// (it did, even when broken) but "did the UI arrive where the handler says it
// should, in the same tick, with no page error".
//
// Mutation to try: put `setGympinMode(false);` back anywhere in resetData
// before its last line. This case fails on the pageerror and on the missing
// wizard; every other case in the suite stays green.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, waitFor } = require('../lib/browser');
const { seedPublicApp, jessiDefaultSchedule, DEFAULT_NS } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { PUBLIC_APP_ROOT } = require('../lib/paths');

// A minimal completed install: enough that the app boots past the wizard and
// renders Settings. The program itself does not matter here.
function simpleConfig() {
    return {
        version: 2,
        days: {
            1: [
                { id: 'ex-1', name: 'Chest Press', category: 'Anterior', typeId: 'standard',
                  sets: 3, minReps: 5, maxReps: 8, order: 0, loadType: 'plate-two-sided' },
                { id: 'ex-2', name: 'Shoulder Press', category: 'Anterior', typeId: 'standard',
                  sets: 3, minReps: 5, maxReps: 8, order: 1, loadType: 'pin' },
            ],
            2: [
                { id: 'ex-3', name: 'Lat Pulldown', category: 'Posterior', typeId: 'standard',
                  sets: 3, minReps: 5, maxReps: 8, order: 0, loadType: 'pin' },
            ],
        },
        categories: ['Anterior', 'Posterior'],
    };
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);

        // Both confirms are answered yes. Attached before the click so neither
        // dialog can block the handler.
        page.on('dialog', (d) => d.accept());

        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPublicApp(page, {
            exerciseConfig: simpleConfig(),
            schedule: jessiDefaultSchedule(),
            workoutHistory: [],
        });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), DEFAULT_NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // Sanity: we really are past the wizard before we reset.
        const beforeWizard = await page.evaluate(() =>
            Array.from(document.querySelectorAll('button'))
                .some(b => /have a coach/i.test(b.textContent)));
        eq(beforeWizard, false, 'the app starts on the workout screen, not the wizard');

        await page.click('.settings-btn');
        await waitFor(page, 'the Settings modal to open',
            () => Array.from(document.querySelectorAll('.modal-btn'))
                .some(b => /reset all data/i.test(b.textContent)));

        const clicked = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('.modal-btn'))
                .find(b => /reset all data/i.test(b.textContent));
            if (!btn) return false;
            btn.click();
            return true;
        });
        ok(clicked, 'clicked the real "Reset All Data" button');

        // === The tail of the handler ===================================
        // No reload between the click and these checks. That is deliberate:
        // a reload would have masked the bug entirely, because the wizard
        // does render on the next load once gymSetupCompleted is gone.
        await waitFor(page, 'the setup wizard to render after the reset',
            () => Array.from(document.querySelectorAll('button'))
                .some(b => /have a coach/i.test(b.textContent)));

        const settingsStillOpen = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.modal-btn'))
                .some(b => /reset all data/i.test(b.textContent)));
        eq(settingsStillOpen, false,
            'setShowSettings(false) ran — the Settings modal closed behind the reset');

        // === The storage side, which worked even when broken ===========
        // Asserted anyway so a future change that moves the clearAll below
        // the UI calls cannot pass on the wizard alone.
        const cleared = await page.evaluate((ns) => ({
            config: localStorage.getItem(ns + 'gymExerciseConfig'),
            history: localStorage.getItem(ns + 'gymWorkoutHistory'),
            setup: localStorage.getItem(ns + 'gymSetupCompleted'),
            repsFlag: localStorage.getItem(ns + 'jessiRepsDropdownEnabled'),
        }), DEFAULT_NS);
        eq(cleared.config, null, 'the exercise config is gone');
        eq(cleared.history, null, 'the workout history is gone');
        eq(cleared.setup, null, 'the setup-completed marker is gone');
        eq(cleared.repsFlag, null, 'the one-shot gates are gone');

        // A ReferenceError in an onClick reaches puppeteer as a pageerror, so
        // this assertion is the direct pin on the bug rather than a courtesy.
        eq(errors, [], 'no page errors while resetting');
        console.log('PASS: a real reset closes Settings and returns to the wizard.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
