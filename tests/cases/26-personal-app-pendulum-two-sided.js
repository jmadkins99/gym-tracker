// What this test covers
// ----------------------
// Back Extensions (id `leg-curls`) is a TWO-sided plate-loaded machine:
// you load matching plates on each side, so the breakdown must split the
// target in half and show a "Per side" line. This guards leg-curls's seeded
// loadType of 'plate-two-sided' in DEFAULT_EXERCISES plus the matching 5 lb PR
// increment (= 2.5/side, smallest real plate).
//
// This case used to run against Leg Press (`hip-adduction`), which was the
// program's two-sided station until Aug 2026 replaced it with a pin stack.
// Back Extensions moved the other way in the same trip — single-plate station
// to two-side — so it inherits the coverage. It is now the ONLY two-sided
// plate-loaded movement in the program, so if it is ever retired this needs a
// new home rather than deletion. The arithmetic below is weight-driven and
// unchanged from the Leg Press era; only the card it runs against moved.
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
const { setWeightAndOpen } = require('../lib/deck');
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

        await selectDayType(page, 'posterior');

        // Open the Back Extensions breakdown at 270 lbs.
        const text = await setWeightAndOpen(page, 'Back Extensions', 270);

        contains(text, '270 lbs', 'top set total shown as 270 lbs (unrounded)');
        contains(text, '135/side', 'two-sided: top set per side = 135 lbs (= 270/2)');
        contains(text, '190 lbs',
            'warmup #1 total = 190. Under the Aug 2026 rule a warmup rounds to the ' +
            'nearest load you can BUILD, so 94.5/side becomes 95 (45+45+5) rather than ' +
            'the old nearest-10 answer of 90');
        contains(text, '95/side', 'warmup #1 per side: 94.5 -> 95');
        contains(text, '240 lbs', 'warmup #2 total = 240 lbs (121.5 -> 120/side)');
        contains(text, '120/side', 'warmup #2 per side: 121.5 -> 120');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Back Extensions renders two-sided breakdown; josh backup restores cleanly.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
