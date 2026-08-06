// What this test covers
// ----------------------
// Shoulder Press's breakdown STYLE, which has now changed twice. It was
// pin-stack, was reclassified to two-sided plate-loaded in Aug 2026, and moved
// back to pin-stack later the same month. Test 16 only asserts that a Weight
// Breakdown button exists, so it passes under any classification — the style
// needs its own pin, the same way test 26 pins Leg Press.
//
// A plain (non-overflow) pin stack renders one "<label>: N lbs" row per warmup
// and NO "Per side" line anywhere. Two absences carry the weight here: no
// "Per side" proves the plate-splitting branch is unreachable for this id, and
// no "Pin:" proves it took the plain branch rather than the overflow one —
// WorkoutView only emits a literal "Pin:" row when a set overflows a capped
// stack, the way cable wrist curls do above 97.5. There is likewise no top-set
// row, which the component renders only when overflow is in play.
//
// At 200 lbs: warmup 70% = 140, warmup 90% = 180 — both already land on the
// 5 lb stack, so no micro-plate is involved.
//
// Also guards the matching PR increment. 2.5 was chosen back when this was
// two-sided (= 1.25/side, the smallest real plate); it survives the move back
// because 2.5 is also a legal pin-stack micro-plate step. The increment and the
// classification have to be read together — that pairing is why both are
// asserted here rather than in separate tests.

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
    eq(PIN_STACK['shoulder-press'], true,
        'shoulder-press is registered as a plain pin stack');
    ok(!PLATE_LOADED['shoulder-press'],
        'shoulder-press is no longer in PLATE_LOADED_EXERCISES (would shadow the pin branch)');
    eq(INCREMENTS['shoulder-press'], 2.5,
        'shoulder-press PR increment is 2.5, a legal pin-stack micro-plate step');

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

        contains(text, 'Warmup Set #1 (~70%): 140 lbs',
            'warmup #1 = 70% of 200 = 140, already on the stack');
        contains(text, 'Warmup Set #2 (~90%): 180 lbs',
            'warmup #2 = 90% of 200 = 180, already on the stack');

        // The plate-loaded branch is what renders "Per side". Its absence is
        // what proves the reclassification actually took effect rather than
        // both branches somehow rendering.
        ok(!/Per side/.test(text),
            'no two-sided plate rendering remains on Shoulder Press');
        ok(!/Pin:/.test(text),
            'plain pin stack, not the capped-overflow branch');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Shoulder Press renders a pin-stack breakdown with a matching increment.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
