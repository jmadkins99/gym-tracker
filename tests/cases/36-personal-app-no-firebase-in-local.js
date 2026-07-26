// What this test covers
// ----------------------
// The local-mode silence contract for the Firebase integration: when the app
// runs under the `gym-local:` namespace (localhost, this test suite), Firebase
// must NOT initialize, the repo must be the localStorage implementation, the
// Settings modal must not offer cloud sync, and nothing may hit the console
// as an error. This is what keeps the suite runnable with zero Firebase
// credentials and keeps test behavior byte-identical to the pre-cloud app.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
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

        await seedPersonalApp(page, {
            workoutHistory: [
                workoutEntry({
                    date: '2026-05-30T20:00:00Z', day: 'fullbody',
                    exercises: [{ id: 'frontal-pulldowns', name: 'Frontal Plane Pulldowns', weight: '160', reps: '4' }],
                }),
            ],
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
        const settingsText = await page.evaluate(() =>
            document.querySelector('.modal, .settings-modal, .modal-content')?.textContent || document.body.textContent);
        ok(!/sign in with google/i.test(settingsText), 'no Google sign-in offered in local mode');

        eq(errors, [], 'no console errors with Firebase inactive');
        console.log('PASS: gym-local namespace runs fully local — no Firebase init, no sync UI, no errors.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
