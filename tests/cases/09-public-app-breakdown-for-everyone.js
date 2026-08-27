// What this test covers
// ----------------------
// Every exercise on the public app shows a Weight Breakdown button, for every
// user, with no opt-in of any kind.
//
// This case is the exact inversion of what it used to assert. Until Aug 2026
// the feature was gated behind an `exerciseConfig.gympinMode` flag, switched on
// by visiting with `?gympin=on` and auto-enabled for "Jessi-shaped" installs,
// and this file existed to guarantee we did NOT ship it to everyone. Letting
// each user say how their own machines are loaded removed the reason for the
// gate, so the flag, its URL toggle and its one-shot enabler are all gone and
// this file now guards the opposite property.
//
// The sharp half is the second block. An old backup or an untouched device can
// still carry `gympinMode: false`, because that field really was persisted and
// really did travel with a restore. A stale false must be ignored, not obeyed —
// if any code still reads it, those users would be the only ones left without
// the feature, and it would be invisible to everyone testing on a fresh device.
//
// The one-shot that used to auto-enable the flag was covered by case 11, which
// was deleted along with the function it tested.
//
// To verify this test is real: put `gympinMode ? … : null` back on the
// breakdownConfigFor call in the card render. The first block fails.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiPreMigrationConfig, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const { PUBLIC_APP_ROOT } = require('../lib/paths');
const NS = 'gym-local:';

// Every rendered card, with whether it has a breakdown button.
async function readBreakdownButtons(page) {
    return page.evaluate(() => {
        return Array.from(document.querySelectorAll('.exercise-card')).map(c => ({
            name: c.querySelector('.exercise-name')?.textContent?.trim() || '',
            hasButton: !!Array.from(c.querySelectorAll('button'))
                .find(b => b.textContent.includes('Weight Breakdown')),
        }));
    });
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // === 1. A plain install, no flag of any kind ========================
        const clean = jessiPreMigrationConfig();
        delete clean.gympinMode;
        await seedPublicApp(page, {
            exerciseConfig: clean,
            schedule: jessiDefaultSchedule(),
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1500));

        let cards = await readBreakdownButtons(page);
        ok(cards.length > 0, `rendered some exercise cards (got ${cards.length})`);

        let missing = cards.filter(c => !c.hasButton).map(c => c.name);
        eq(missing, [], 'every card shows a Weight Breakdown button with no opt-in');

        // === 2. A device carrying a stale gympinMode: false =================
        // This is what an old backup restores, and what a device that ran
        // ?gympin=off still has sitting in its config.
        const stale = jessiPreMigrationConfig();
        stale.gympinMode = false;
        await seedPublicApp(page, {
            exerciseConfig: stale,
            schedule: jessiDefaultSchedule(),
        });
        await page.evaluate((ns) => {
            // The old one-shot's flag, set so it could not "re-enable" anything
            // even back when it existed. Nothing should read either key now.
            localStorage.setItem(ns + 'jessiGympinEnabled', 'true');
        }, NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1500));

        cards = await readBreakdownButtons(page);
        ok(cards.length > 0, `rendered cards on the stale-flag install (got ${cards.length})`);

        missing = cards.filter(c => !c.hasButton).map(c => c.name);
        eq(missing, [],
            'a stale gympinMode:false in a restored config cannot suppress the breakdown');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: the Weight Breakdown is unconditional for every user.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
