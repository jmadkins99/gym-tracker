// What this test covers
// ----------------------
// The public app's local-mode silence contract for the Firebase integration:
// under the `gym-local:` namespace (localhost, this suite), Firebase must not
// initialize, the repo must be the localStorage implementation, the Settings
// modal must not offer cloud sync, and nothing may hit the console as an
// error. Mirrors case 36 for the personal app.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
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

        await seedPublicApp(page, {
            exerciseConfig: jessiPreMigrationConfig(),
            workoutHistory: [
                workoutEntry({
                    date: '2026-05-30T20:00:00Z', day: 1,
                    exercises: [{ id: 'jfront', name: 'Frontal Plane Pulldowns', weight: '160', reps: '6' }],
                }),
            ],
            schedule: jessiDefaultSchedule(),
        });
        await page.evaluate((ns) => localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        const state = await page.evaluate(() => ({
            firebaseReady: window.FIREBASE_READY,
            repoMode: window.repo && window.repo.mode,
        }));
        eq(state.firebaseReady, false, 'FIREBASE_READY is explicitly false in gym-local namespace');
        eq(state.repoMode, 'local', 'repo resolves to the localStorage implementation');

        // Settings modal must not offer cloud sync in local mode.
        await page.evaluate(() => {
            const btn = document.querySelector('.settings-btn');
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 250));
        // Inspect only the rendered modal: the public app's source is an
        // inline script in <body>, so body.textContent would match the code.
        const modalText = await page.evaluate(() =>
            document.querySelector('.modal')?.textContent || '');
        ok(modalText.includes('Settings'), 'settings modal actually opened');
        ok(!/sign in with google/i.test(modalText), 'no Google sign-in offered in local mode');

        eq(errors, [], 'no console errors with Firebase inactive');
        console.log('PASS: public app gym-local namespace runs fully local — no Firebase, no sync UI, no errors.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
