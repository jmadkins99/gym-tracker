// What this test covers
// ----------------------
// Jessi shouldn't need to load the app with ?gympin=on. Any user whose
// exerciseConfig has Anterior/Posterior or Torso/Limbs or Full Body
// categories (the signal we use to identify Jessi-shaped installs) gets
// gympinMode auto-enabled once.
//
// What we assert:
//   - After loading a Jessi-shaped config WITHOUT any URL param,
//     gympinMode persists to exerciseConfig as true.
//   - The one-shot flag `jessiGympinEnabled` gets set so it doesn't
//     re-run on every page load.
//   - After the Full Body migration runs, Kelso Shrugs (still in her
//     program) renders the Weight Breakdown button without any URL param.
//
// To verify this test is real: remove the `enableGympinForJessi()` call
// from the App mount useEffect. Test should fail.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiPreMigrationConfig, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PUBLIC_APP_ROOT = path.resolve(__dirname, '..', '..', '..', 'public_gym_app');

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Standard Jessi-shaped config, gympinMode explicitly omitted.
        const cfg = jessiPreMigrationConfig();
        delete cfg.gympinMode;

        await seedPublicApp(page, {
            exerciseConfig: cfg,
            schedule: jessiDefaultSchedule(),
        });
        // Also clear the auto-enable flag so this run exercises the one-shot.
        await page.evaluate(() => {
            localStorage.removeItem('gym-local:jessiGympinEnabled');
        });

        // Plain reload — no ?gympin param.
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1500));

        // gympinMode should now be true in storage.
        const state = await page.evaluate(() => {
            const raw = localStorage.getItem('gym-local:gymExerciseConfig');
            const cfg = raw ? JSON.parse(raw) : {};
            return {
                gympinMode: cfg.gympinMode,
                flagSet: localStorage.getItem('gym-local:jessiGympinEnabled'),
            };
        });
        eq(state.gympinMode, true,
            'enableGympinForJessi flips gympinMode for an AP/TL-shaped install on first load');
        eq(state.flagSet, 'true',
            'jessiGympinEnabled flag is set so the one-shot does not re-run');

        // Kelso Shrugs stays in Jessi's Full Body program — confirm the
        // breakdown button is visible without any URL param.
        const hasButton = await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Kelso Shrugs') {
                    return !!Array.from(c.querySelectorAll('button'))
                        .find(b => b.textContent.includes('Weight Breakdown'));
                }
            }
            return false;
        });
        ok(hasButton, 'Kelso Shrugs card shows the Weight Breakdown button after auto-enable');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: AP/TL/FB-shaped install auto-enables gympinMode without ?gympin param.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
