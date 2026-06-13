// What this test covers
// ----------------------
// The Weight Breakdown feature on the public app (Jessi's app) is gated
// behind exerciseConfig.gympinMode. Default users should NOT see the
// button at all.
//
// This locks in that we don't accidentally ship the feature to every
// public_gym_app user. If someone removes the gympinMode check from the
// card render, this test fails.

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

        // Standard Jessi-shaped config but with gympinMode explicitly OFF.
        // Also pre-set jessiGympinEnabled so the auto-enable one-shot doesn't
        // override the explicit false (simulates "I ran ?gympin=off after the
        // first load").
        const cfg = jessiPreMigrationConfig();
        cfg.gympinMode = false;
        await seedPublicApp(page, {
            exerciseConfig: cfg,
            schedule: jessiDefaultSchedule(),
        });
        await page.evaluate(() => {
            localStorage.setItem('gym-local:jessiGympinEnabled', 'true');
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1500));

        // Count Weight Breakdown buttons. Expected: zero.
        const breakdownButtonCount = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.filter(b => b.textContent.includes('Weight Breakdown')).length;
        });
        eq(breakdownButtonCount, 0,
            'gympinMode=false: no Weight Breakdown button should appear on any card');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: gympinMode off → Weight Breakdown button hidden for all exercises.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
