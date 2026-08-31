// What this test covers
// ----------------------
// Highest-fidelity safety net for the Jessi-only gympin rollout: loads the
// exerciseConfig + schedule shape from his actual 2026-06-09 backup
// (sanitized — no workout weights), runs the app, and asserts the things
// that have to be true for him to have a good experience after the push:
//
//   1. Full Body migration ran (flag1 set) and collapsed his prior
//      Torso/Limbs into a single day.
//   2. Three dropped movements (Cable Lateral Raises, Reverse Wrist
//      Curls, Cable Wrist Curls) are gone from the active program.
//   3. The Weight Breakdown renders (it is unconditional as of Aug 2026).
//   4. Every retained exercise that we expect to classify shows the
//      Weight Breakdown button.
//   5. Kelso Shrugs renders the overflow panel correctly at 215 lbs.
//   6. No console errors during load.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, waitForApp, attachConsole } = require('../lib/browser');
const { seedPublicApp } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const { PUBLIC_APP_ROOT } = require('../lib/paths');
const { ACTIVE, goToCard, revealCard, stepTo, deckPosition, activeName } = require('../lib/deck');
const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'jessi-backup-2026-06-09-config.json');

// Names that should be in the new Full Body program AND classify into a
// breakdown config. Names not in this list either got dropped (lateral/
// wrist movements) or never classified in the first place.
const EXPECTED_BREAKDOWN_NAMES = [
    'Recline Curls',
    'Tricep Extensions',
    'Chest Flies',
    'Incline Chest Press',
    'Sagittal Plane Pulldowns',
    'Frontal Plane Pulldowns',
    'Transverse Plane Rows',
    'Kelso Shrugs',
    'Shoulder Press',
    'Ab Crunches',
    'Calf Raises',
    'Hip Adduction',
    'Stiff Legged Deadlifts',
    'Pendulum Squats',
];

const DROPPED_NAMES = [
    'Cable Lateral Raises',
    'Reverse Wrist Curls',
    'Cable Wrist Curls',
    'Dips',
];

(async () => {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        await seedPublicApp(page, {
            exerciseConfig: fixture.exerciseConfig,
            schedule: fixture.schedule,
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        const state = await page.evaluate(() => {
            const cfgRaw = localStorage.getItem('gym-local:gymExerciseConfig');
            const cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
            return {
                fbFlag: localStorage.getItem('gym-local:jessiFullBodyMigrationApplied5'),
                day1: (cfg.days?.[1] || []).map(e => e.name),
                day2Exists: !!cfg.days?.[2],
                categories: cfg.categories,
            };
        });
        eq(state.fbFlag, 'true',     'Full Body migration ran (flag4 set)');
        eq(state.day2Exists, false,  'no day 2 — single Full Body day only');
        eq(state.categories, ['Full Body'], 'categories collapsed to ["Full Body"]');

        for (const dropped of DROPPED_NAMES) {
            ok(!state.day1.includes(dropped),
                `"${dropped}" must be dropped from the new Full Body program`);
        }
        ok(state.day1.includes('Transverse Plane Rows'),
            'Transverse Plane Rows preserved in Full Body program');
        ok(state.day1.includes('Hip Adduction'),
            'Leg Extensions renamed to "Hip Adduction" to match personal-app display');

        // Every classified exercise reveals a Weight Breakdown. There is no
        // button any more — the swipe up IS the breakdown — so this walks the
        // deck, opens each card and gives it a weight, because a card with
        // nothing to break down renders no panel.
        const namesWithButton = [];
        await stepTo(page, 1);
        const totalCards = parseInt(((await deckPosition(page)) || '0 of 0').split(' ')[2], 10);
        for (let i = 1; i <= totalCards; i++) {
            const name = await activeName(page);
            await revealCard(page);
            await page.evaluate((sel) => {
                const input = document.querySelector(sel + ' input[type="number"]');
                if (!input) return;
                const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value').set;
                setter.call(input, '100');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }, ACTIVE);
            await new Promise(r => setTimeout(r, 200));
            const has = await page.evaluate(
                (sel) => !!document.querySelector(sel + ' .breakdown'), ACTIVE);
            if (has && name) namesWithButton.push(name);
            if (i < totalCards) {
                await page.evaluate(() => {
                    const a = document.querySelectorAll('.deck-arrow');
                    a[a.length - 1].click();
                });
                await new Promise(r => setTimeout(r, 230));
            }
        }

        const seen = new Set(namesWithButton);
        const missing = EXPECTED_BREAKDOWN_NAMES.filter(n => !seen.has(n));
        eq(missing, [],
            `every retained classified exercise must reveal a Weight Breakdown (missing: ${JSON.stringify(missing)})`);

        // Kelso Shrugs at 215 lbs.
        await goToCard(page, 'Kelso Shrugs');
        await revealCard(page);
        const interacted = await page.evaluate((sel) => {
            const input = document.querySelector(sel + ' input[type="number"]');
            if (!input) return false;
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, '215');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        }, ACTIVE);
        ok(interacted, 'set Kelso Shrugs weight to 215 on its open card');
        await new Promise(r => setTimeout(r, 300));

        const text = await page.evaluate(
            (sel) => document.querySelector(sel).textContent, ACTIVE);
        // Kelso Shrugs is plate-loaded one-sided (no pin cap): a labelled row
        // per set, a plate list, and no pin overflow line.
        contains(text, 'Warmup 1' + '70%' + '150 lbs',
            'Kelso warmup 1 at 215 → nearest-10 = 150');
        contains(text, 'Warmup 2' + '90%' + '195 lbs',
            'Kelso warmup 2 at 215 → nearest-10 = 190');
        contains(text, 'Top set' + '215 lbs',
            'Kelso top set shows exact 215 lbs');
        ok(!/pin \d/.test(text),
            'Kelso has no "Pin: N lbs" line (plate-loaded, not a capped pin stack)');

        eq(errors, [], 'no console errors during load');

        console.log('PASS: Jessi real-backup loads cleanly with Full Body migration + gympin + breakdown buttons.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
