// What this test covers
// ----------------------
// Shoulder Press was reclassified from pin-stack to TWO-sided plate-loaded
// (Aug 2026). Test 16 only asserts that a Weight Breakdown button exists, so
// it passes either way — the breakdown *style* needs its own pin, the same way
// test 26 pins Leg Press.
//
// Two-sided means the target is split in half with a "Per side" line, and the
// pin/micro-plate math must no longer be reachable for this id. Warmups round
// each per-side figure to the nearest 10 lb; the top set is never rounded.
//
// At 200 lbs: per side 100. Warmup 70% = 140 -> 70/side -> 140 total.
// Warmup 90% = 180 -> 90/side -> 180 total.
//
// Also guards the matching PR increment. On a two-sided machine 1.25 lb total
// is 0.625 per side, which is not a real plate; the increment moved to 2.5
// (= 1.25/side) when the classification changed. Leaving one without the other
// is the easy mistake, so both are asserted here.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

function extractLiteral(source, name) {
    const start = source.indexOf(`const ${name} =`);
    if (start === -1) throw new Error(`could not find ${name} in config.js`);
    const openIdx = source.indexOf('{', start);
    const closeIdx = source.indexOf('};', openIdx);
    return new Function(`return ${source.slice(openIdx, closeIdx + 1)}`)();
}

(async () => {
    const configSrc = fs.readFileSync(path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const PLATE_LOADED = extractLiteral(configSrc, 'PLATE_LOADED_EXERCISES');
    const PIN_STACK = extractLiteral(configSrc, 'PIN_STACK_EXERCISES');
    const INCREMENTS = extractLiteral(configSrc, 'PR_WEIGHT_INCREMENTS');

    // Config-level invariants, before touching the browser.
    eq(PLATE_LOADED['shoulder-press'], { type: 'two-sided', machineWeight: 0 },
        'shoulder-press is registered as two-sided plate-loaded');
    ok(!PIN_STACK['shoulder-press'],
        'shoulder-press is no longer in PIN_STACK_EXERCISES (would shadow the plate branch)');
    eq(INCREMENTS['shoulder-press'], 2.5,
        'shoulder-press PR increment is 2.5 total = 1.25/side, the smallest real plate move');

    // Every two-sided machine must move in steps that halve to a real plate.
    for (const [id, cfg] of Object.entries(PLATE_LOADED)) {
        if (cfg.type !== 'two-sided') continue;
        const inc = INCREMENTS[id];
        if (inc === undefined) continue;
        ok((inc / 2) % 1.25 === 0,
            `${id} increment ${inc} halves to ${inc / 2}/side, a multiple of the 1.25 lb plate`);
    }

    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate(() => localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'upper');

        const interacted = await page.evaluate(() => {
            const card = Array.from(document.querySelectorAll('.exercise-card'))
                .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === 'Shoulder Press');
            if (!card) return false;
            const input = card.querySelector('input[type="number"]');
            if (!input) return false;
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, '200');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const btn = Array.from(card.querySelectorAll('button'))
                .find(b => b.textContent.includes('Weight Breakdown'));
            if (!btn) return false;
            btn.click();
            return true;
        });
        ok(interacted, 'set Shoulder Press to 200 and opened its Weight Breakdown');
        await new Promise(r => setTimeout(r, 300));

        const text = await page.evaluate(() => {
            const card = Array.from(document.querySelectorAll('.exercise-card'))
                .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === 'Shoulder Press');
            return card ? card.textContent : '';
        });

        contains(text, 'Top Set (200 lbs)', 'top set total shown as 200 lbs, unrounded');
        contains(text, 'Per side: 100 lbs', 'two-sided: top set per side = 100 lbs');
        contains(text, 'Warmup Set #1 (140 lbs', 'warmup #1 total = 140 lbs (70/side)');
        contains(text, 'Per side: 70 lbs', 'warmup #1 per side = 70 lbs');
        contains(text, 'Warmup Set #2 (180 lbs', 'warmup #2 total = 180 lbs (90/side)');
        contains(text, 'Per side: 90 lbs', 'warmup #2 per side = 90 lbs');

        // The pin-stack branch renders a "Pin:" line and never a "Per side" one.
        // Its absence is what proves the reclassification actually took effect
        // rather than both branches somehow rendering.
        ok(!/\bPin:/.test(text),
            'no pin-stack rendering remains on Shoulder Press');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Shoulder Press renders a two-sided plate breakdown with a matching increment.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
