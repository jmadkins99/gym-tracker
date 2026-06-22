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
//   3. Auto-enable of gympinMode triggers (his categories are now FB).
//   4. Every retained exercise that we expect to classify shows the
//      Weight Breakdown button.
//   5. Kelso Shrugs renders the overflow panel correctly at 215 lbs.
//   6. No console errors during load.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PUBLIC_APP_ROOT = path.resolve(__dirname, '..', '..', '..', 'public_gym_app');
const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'jessi-backup-2026-06-09-config.json');

// Names that should be in the new Full Body program AND classify into a
// breakdown config. Names not in this list either got dropped (lateral/
// wrist movements) or never classified in the first place.
const EXPECTED_BREAKDOWN_NAMES = [
    'Preacher Curls',
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
        await new Promise(r => setTimeout(r, 1500));

        const state = await page.evaluate(() => {
            const cfgRaw = localStorage.getItem('gym-local:gymExerciseConfig');
            const cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
            return {
                gympinMode: cfg.gympinMode,
                fbFlag: localStorage.getItem('gym-local:jessiFullBodyMigrationApplied3'),
                gympinFlag: localStorage.getItem('gym-local:jessiGympinEnabled'),
                day1: (cfg.days?.[1] || []).map(e => e.name),
                day2Exists: !!cfg.days?.[2],
                categories: cfg.categories,
            };
        });
        eq(state.gympinMode, true, 'gympinMode auto-enabled on Jessi-shaped install');
        eq(state.gympinFlag, 'true', 'jessiGympinEnabled flag set so auto-enable does not re-fire');
        eq(state.fbFlag, 'true',     'Full Body migration ran (flag3 set)');
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

        // Every classified exercise has a Weight Breakdown button.
        const namesWithButton = await page.evaluate(() => {
            const out = [];
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                const name = c.querySelector('.exercise-name')?.textContent?.trim();
                const has = !!Array.from(c.querySelectorAll('button'))
                    .find(b => b.textContent.includes('Weight Breakdown'));
                if (has && name) out.push(name);
            }
            return out;
        });

        const seen = new Set(namesWithButton);
        const missing = EXPECTED_BREAKDOWN_NAMES.filter(n => !seen.has(n));
        eq(missing, [],
            `every retained classified exercise must show the Weight Breakdown button (missing: ${JSON.stringify(missing)})`);

        // Kelso Shrugs overflow at 215 lbs.
        const interacted = await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Kelso Shrugs') {
                    const input = c.querySelector('input[type="number"]');
                    if (!input) return false;
                    const setter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, 'value').set;
                    setter.call(input, '215');
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    const btn = Array.from(c.querySelectorAll('button'))
                        .find(b => b.textContent.includes('Weight Breakdown'));
                    btn?.click();
                    return true;
                }
            }
            return false;
        });
        ok(interacted, 'set Kelso Shrugs weight to 215 and clicked Weight Breakdown');
        await new Promise(r => setTimeout(r, 300));

        const text = await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Kelso Shrugs') {
                    return c.textContent;
                }
            }
            return '';
        });
        contains(text, 'Warmup Set #1 (~70%): 150 lbs',
            'Kelso warmup 1 at 215 → 150 (on pin)');
        contains(text, 'Warmup Set #2 (~90%): 193.75 lbs',
            'Kelso warmup 2 at 215 → 193.75 (micro-plate, still under cap)');
        contains(text, 'Top Set: 215 lbs',
            'Kelso top set 215 shown (overflow)');
        contains(text, 'Pin: 200 lbs',
            'Kelso top set "Pin: 200 lbs" line');

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
