// What this test covers
// ----------------------
// Highest-fidelity safety net for the Jessi-only gympin rollout: loads the
// exerciseConfig + schedule shape from his actual 2026-06-09 backup
// (sanitized — no workout weights), runs the app, and asserts the things
// that have to be true for him to have a good experience after the push:
//
//   1. TL classifier-fix migration places his stale-name "Dips" and
//      "Transverse Plane Rows" on Torso (regression coverage already
//      lives in test 06, but it's a precondition for everything else
//      so we assert it again here against the real backup).
//   2. Auto-enable of gympinMode triggers (his categories are TL).
//   3. Every exercise in his program that we expect to classify (every
//      one of his current 11 unique movements) shows the Weight
//      Breakdown button.
//   4. Cable Wrist Curls — his cap exercise — renders the overflow
//      panel correctly when we set his weight to 115 in the input field.
//   5. No console errors during load.
//
// If any of these break, Jessi sees a broken/empty/missing button on his
// phone after he refreshes.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PUBLIC_APP_ROOT = path.resolve(__dirname, '..', '..', '..', 'public_gym_app');
const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'jessi-backup-2026-06-09-config.json');

// Names that should classify into a breakdown config (pin-stack or
// plate-loaded). Mirrors getWeightBreakdownConfig in public_gym_app.
const EXPECTED_BREAKDOWN_NAMES = [
    // Torso (Day 1 post-migration)
    'Chest Flies',
    'Incline Chest Press',
    'Sagittal Plane Pulldowns',
    'Dips',
    'Cable Lateral Raises',
    'Frontal Plane Pulldowns',
    'Transverse Plane Rows',
    'Kelso Shrugs',
    'Shoulder Press Machine',
    // Limbs (Day 2 post-migration)
    'Preacher Curls',
    'Tricep Pushdown',
    'Reverse Wrist Curls',
    'Cable Wrist Curls',
    'Ab Crunch Machine',
    'Calf Raises',
    'Leg Extensions',
    'Stiff Legged Deadlifts',
    'Pendulum Squats',
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

        // 1 + 2: migration + auto-enable.
        const state = await page.evaluate(() => {
            const cfgRaw = localStorage.getItem('gym-local:gymExerciseConfig');
            const cfg = cfgRaw ? JSON.parse(cfgRaw) : {};
            return {
                gympinMode: cfg.gympinMode,
                tlFlag: localStorage.getItem('gym-local:jessiTLMigrationApplied5'),
                gympinFlag: localStorage.getItem('gym-local:jessiGympinEnabled'),
                day1: (cfg.days?.[1] || []).map(e => e.name),
                day2: (cfg.days?.[2] || []).map(e => e.name),
            };
        });
        eq(state.gympinMode, true, 'gympinMode auto-enabled on Jessi-shaped install');
        eq(state.gympinFlag, 'true', 'jessiGympinEnabled flag set so auto-enable does not re-fire');
        eq(state.tlFlag, 'true',     'TL classifier-fix migration ran (flag 5 set)');
        ok(state.day1.includes('Dips'),
            'TL migration placed "Dips" on Torso');
        ok(state.day1.includes('Transverse Plane Rows'),
            'TL migration placed "Transverse Plane Rows" on Torso');

        // 3: every expected exercise has a Weight Breakdown button.
        // Need to check across both Day 1 and Day 2.
        const seen = new Set();
        for (const dayLabel of ['Torso', 'Limbs']) {
            await page.evaluate((label) => {
                const btn = Array.from(document.querySelectorAll('.day-btn'))
                    .find(b => b.textContent.trim() === label);
                btn?.click();
            }, dayLabel);
            await new Promise(r => setTimeout(r, 400));
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
            namesWithButton.forEach(n => seen.add(n));
        }

        const missing = EXPECTED_BREAKDOWN_NAMES.filter(n => !seen.has(n));
        eq(missing, [],
            `every classified exercise must show the Weight Breakdown button (missing: ${JSON.stringify(missing)})`);

        // 4: Cable Wrist Curls overflow at 115 lbs against Jessi's real exercise id.
        // Switch back to Limbs, type 115 into the Weight input on CWC, click Breakdown.
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('.day-btn'))
                .find(b => b.textContent.trim() === 'Limbs');
            btn?.click();
        });
        await new Promise(r => setTimeout(r, 400));

        const interacted = await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Cable Wrist Curls') {
                    const input = c.querySelector('input[type="number"]');
                    if (!input) return false;
                    const setter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, 'value').set;
                    setter.call(input, '115');
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    const btn = Array.from(c.querySelectorAll('button'))
                        .find(b => b.textContent.includes('Weight Breakdown'));
                    btn?.click();
                    return true;
                }
            }
            return false;
        });
        ok(interacted, 'set CWC weight to 115 and clicked Weight Breakdown');
        await new Promise(r => setTimeout(r, 300));

        const text = await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Cable Wrist Curls') {
                    return c.textContent;
                }
            }
            return '';
        });
        contains(text, 'Warmup Set #1 (~70%): 80 lbs',
            'CWC warmup 1 at 115 → 80 (on pin)');
        contains(text, 'Warmup Set #2 (~90%): 102.5 lbs',
            'CWC warmup 2 at 115 → 102.5 (97.5 pin + 5 plate)');
        contains(text, 'Top Set: 115 lbs',
            'CWC top set 115 shown (overflow)');
        ok((text.match(/Pin: 97\.5 lbs/g) || []).length >= 2,
            'two "Pin: 97.5 lbs" lines present (warmup 2 + top set)');

        // 5: no console errors.
        eq(errors, [], 'no console errors during load');

        console.log('PASS: Jessi real-backup loads cleanly with gympin auto-enabled + breakdown buttons on every classified exercise.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
