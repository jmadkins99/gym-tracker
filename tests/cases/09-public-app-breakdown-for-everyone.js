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
//
// The workout screen is a deck now, so "shows a Weight Breakdown button" has
// become "reveals a breakdown when you swipe up". There is no button any more:
// the reveal IS the breakdown, and it is what stamps the movement's start time.
// The property under test is unchanged — every exercise gets one, for every
// user — but it has to be checked one card at a time, because the deck mounts
// three rather than the whole roster.

const path = require('path');
const { start } = require('../lib/server');
const { launch, waitForApp, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiPreMigrationConfig, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { ACTIVE, stepTo, deckPosition, activeName, revealCard } = require('../lib/deck');

const { PUBLIC_APP_ROOT } = require('../lib/paths');
const NS = 'gym-local:';

// Walk the whole day's deck, revealing each card, and report whether each one
// produced a breakdown panel.
async function readBreakdownButtons(page) {
    await stepTo(page, 1);
    const total = parseInt(((await deckPosition(page)) || '0 of 0').split(' ')[2], 10);
    const out = [];
    for (let i = 1; i <= total; i++) {
        const name = await activeName(page);
        await revealCard(page);
        // The panel is drawn from a target weight, so a card with no history
        // and no startingWeight has nothing to break down and renders none.
        // That is true of most of this fixture, and it is not what this case is
        // about — the question is whether the breakdown is gated on anything,
        // not whether a blank card produces one. So give each card a weight and
        // then ask.
        await page.evaluate((sel) => {
            const input = document.querySelector(sel + ' input[type="number"]');
            if (!input) return;
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, '100');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }, ACTIVE);
        await new Promise((r) => setTimeout(r, 220));
        out.push({
            name,
            hasButton: await page.evaluate(
                (sel) => !!document.querySelector(sel + ' .breakdown'), ACTIVE),
        });
        if (i < total) {
            await page.evaluate(() => {
                const a = document.querySelectorAll('.deck-arrow');
                a[a.length - 1].click();
            });
            await new Promise((r) => setTimeout(r, 230));
        }
    }
    return out;
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
        await waitForApp(page);

        let cards = await readBreakdownButtons(page);
        ok(cards.length > 0, `rendered some exercise cards (got ${cards.length})`);

        let missing = cards.filter(c => !c.hasButton).map(c => c.name);
        eq(missing, [], 'every card reveals a Weight Breakdown with no opt-in');

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
        await waitForApp(page);

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
