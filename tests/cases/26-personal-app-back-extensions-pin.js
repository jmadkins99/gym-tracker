// What this test covers
// ----------------------
// Back Extensions (id `leg-curls`) is a pin stack capped at 260, so a working
// weight above the cap renders the OVERFLOW shape: the pin pegged at its max
// plus loose plates for the excess, as one pile with no per-side split. This
// guards leg-curls's seeded loadType of 'pin' in DEFAULT_EXERCISES and its
// PIN_STACK_CAPS entry together — the cap is unreachable config without the
// classification, so either one alone is a silent no-op.
//
// This case has been handed down twice and reclassified once. It first ran
// against Leg Press (`hip-adduction`), the program's two-sided station until
// Aug 2026; Back Extensions inherited it when it moved single-plate -> two-side
// in the same trip. Sep 2026 then established that the machine is a stack and
// always was, which turns this case from the two-sided pin into the second home
// for overflow rendering that 08's header asks for. Two-sided coverage did not
// go with it: Leg Press is two-sided again and case 46 renders it in full.
//
// At a working weight of 270 against a 260 cap:
//   - Warmup 1 = 70% of 270 = 189 → nearest-10 = 190 → fits on the pin
//   - Warmup 2 = 90% of 270 = 243 → nearest-10 = 240 → fits on the pin
//   - Top set  = 270 → overflow → pin 260 + a 10 = 270
// Only the top set overflows, which is the case worth having: it proves the
// two branches coexist on ONE card rather than a card rendering all-or-nothing.
//
// It also exercises a real restored backup: josh-backup-2026-06-30.json is an
// actual auto-backup whose in-progress top workout had three blank movements
// (cable wrist curls, chest flies, leg curls) filled with mock values. Seeding
// its workoutHistory reproduces post-restore state, so we confirm the restore
// roundtrips those values AND that the render is correct on top of it. Cable
// Wrist Curls left the program in Sep 2026 and its assertion below deliberately
// stays: a retired movement's history has to survive a restore untouched.
//
// To verify this test is real: in js/config.js, delete the 'leg-curls' entry
// from PIN_STACK_CAPS. The "pin 260" row disappears, the top set renders as a
// plain 270 pin position, and the test fails.

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

        // Open the Back Extensions breakdown at 270 lbs — 10 over the cap.
        const text = await setWeightAndOpen(page, 'Back Extensions', 270);

        contains(text, '270 lbs', 'top set total shown as 270 lbs (unrounded)');
        contains(text, 'pin 260', 'top set overflows: the pin is pegged at the 260 cap');
        contains(text, '10', 'the 10 lb excess is rendered as a loose plate');
        contains(text, '190 lbs', 'warmup #1 = 189 -> nearest-10 = 190, under the cap');
        contains(text, '240 lbs', 'warmup #2 = 243 -> nearest-10 = 240, under the cap');

        // A stack has no per-side split, so the plate-loaded shape must be
        // absent entirely. Its presence would mean the two-sided branch is
        // still reachable for this id — the exact half-applied state a
        // reclassification invites.
        ok(text.indexOf('/side') === -1,
            'no per-side figures — Back Extensions is a stack, not a two-sided sled');

        // The warmups sit below the cap while the top set sits above it, so one
        // card is rendering both branches. This is what the case is for, and
        // reading the two halves separately is what proves it: a card that put
        // the pin row on a warmup would satisfy every `contains` above.
        const [warmupHalf, topSetHalf] = text.split('TOP SET');
        ok(topSetHalf && topSetHalf.indexOf('pin 260') !== -1,
            'the overflow row belongs to the top set');
        ok(warmupHalf.indexOf('pin ') === -1,
            'neither warmup overflows — both round to a position under the cap');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Back Extensions renders pin-stack overflow; josh backup restores cleanly.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
