// What this test covers
// ----------------------
// Pendulum Squats (id `hip-adduction`) is a TWO-sided plate-loaded machine:
// you load matching plates on each side, so the breakdown must split the
// target in half and show a "Per side" line. This guards the config change
// from one-sided -> two-sided (PLATE_LOADED_EXERCISES['hip-adduction'].type)
// plus the matching 2.5 lb PR increment (= 1.25/side, smallest real plate).
//
// It also exercises a real restored backup: josh-backup-2026-06-30.json is an
// actual auto-backup whose in-progress top workout had three blank movements
// (cable wrist curls, chest flies, leg curls) filled with mock values. Seeding
// its workoutHistory reproduces post-restore state, so we confirm the restore
// roundtrips those values AND that the two-sided render is correct.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'josh-backup-2026-06-30.json');

(async () => {
    const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: fixture.workoutHistory });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // The restored backup roundtrips: the three movements that were blank in
        // the live capture come back with the filled mock values.
        const restored = await page.evaluate(() => {
            const raw = localStorage.getItem('gym-local:gymWorkoutHistory');
            const hist = raw ? JSON.parse(raw) : [];
            const top = hist[0] || {};
            const byId = {};
            for (const e of (top.exercises || [])) byId[e.id] = { weight: e.weight, reps: e.reps };
            return { len: hist.length, byId };
        });
        eq(restored.len, fixture.workoutHistory.length, 'full workout history restored');
        eq(restored.byId['cable-wrist-curls'], { weight: '53.75', reps: '5' }, 'cable wrist curls filled');
        eq(restored.byId['chest-flies'], { weight: '192.5', reps: '5' }, 'chest flies filled');
        eq(restored.byId['leg-curls'], { weight: '520', reps: '5' }, 'leg curls filled');

        await selectDayType(page, 'fullbody');

        // Open the Pendulum Squats breakdown at 270 lbs.
        const interacted = await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Pendulum Squats') {
                    const input = c.querySelector('input[type="number"]');
                    if (!input) return false;
                    const setter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, 'value').set;
                    setter.call(input, '270');
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    const btn = Array.from(c.querySelectorAll('button'))
                        .find(b => b.textContent.includes('Weight Breakdown'));
                    btn?.click();
                    return true;
                }
            }
            return false;
        });
        ok(interacted, 'set Pendulum Squats weight to 270 and clicked Weight Breakdown');
        await new Promise(r => setTimeout(r, 300));

        const text = await page.evaluate(() => {
            const cards = document.querySelectorAll('.exercise-card');
            for (const c of cards) {
                if (c.querySelector('.exercise-name')?.textContent?.trim() === 'Pendulum Squats') {
                    return c.textContent;
                }
            }
            return '';
        });

        // Two-sided: total is full target, per side is half (snapped to plate-
        // loadable increments). The "Per side" line only renders when isTwoSided.
        contains(text, 'Top Set (270 lbs)', 'top set total shown as 270 lbs');
        contains(text, 'Per side: 135 lbs', 'two-sided: top set per side = 135 lbs (= 270/2)');
        contains(text, 'Warmup Set #1 (187.5 lbs', 'warmup #1 total = 187.5 lbs');
        contains(text, 'Per side: 93.75 lbs', 'warmup #1 per side = 93.75 lbs');
        contains(text, 'Warmup Set #2 (242.5 lbs', 'warmup #2 total = 242.5 lbs');
        contains(text, 'Per side: 121.25 lbs', 'warmup #2 per side = 121.25 lbs');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Pendulum Squats renders two-sided breakdown; josh backup restores cleanly.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
