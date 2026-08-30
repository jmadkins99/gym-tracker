// What this test covers
// ----------------------
// Chest Flies was reclassified from two-sided plate-loaded to plain pin-stack.
// The Weight Breakdown popover should now show the pin-stack format
// (just two warmup percentages as a single number each), NOT the
// plate-loaded format ("Warmup Set #1 (NNN lbs - ~70%):" + per-plate lines).
//
// To verify this test is real: in js/config.js, change chest-flies's seeded
// loadType in DEFAULT_EXERCISES from 'pin' to 'plate-two-sided'. This test
// fails. Note it pins the SEED only — the user can change the setting in
// Settings > Manage Exercises, and case 58 is what covers that path.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { readDeckCard } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Seed a Chest Flies history so the input has a known weight.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-27T20:00:00Z', day: 1,
                exercises: [{ id: 'chest-flies', name: 'Chest Flies', weight: '165', reps: '5' }],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior');

        // The breakdown is no longer behind its own button: it is part of the
        // card's revealed face, so this navigates to Chest Flies and swipes up.
        const card = await readDeckCard(page, 'Chest Flies');
        ok(card.hasWeightBreakdown, 'Chest Flies shows a warmup breakdown when opened');

        // Pin-stack rows carry ONE weight and no plate list. Plate-loaded rows
        // carry a per-side figure and a comma-separated plate list after a
        // middot — that is the signature this must not have.
        const rows = card.breakdown;
        ok(rows.length >= 2, 'both warmup rows render');
        contains(rows[0], 'WARMUP 1', 'first row is warmup 1');
        contains(rows[0], '70%', 'labelled 70%');
        contains(rows[1], 'WARMUP 2', 'second row is warmup 2');
        contains(rows[1], '90%', 'labelled 90%');

        ok(
            rows.every(r => !/\/side/.test(r)),
            'must NOT show a per-side figure — that is the plate-loaded signature, and ' +
            'seeing it here would mean Chest Flies had been reclassified'
        );
        ok(
            rows.every(r => !/\d+(?:\.\d+)? × \d+/.test(r)),
            'and must NOT list plates like "45 × 2" — a pin stack has no plates to list'
        );
        ok(
            rows.every(r => /\d+ lbs/.test(r)),
            'each row states a single pin weight'
        );
        // Pin warmups sit on a round position: the stack moves in 5 lb steps so
        // every multiple of 10 is reachable without a micro-plate.
        ok(
            rows.slice(0, 2).every(r => /(\d+) lbs/.test(r) && parseInt(/(\d+) lbs/.exec(r)[1], 10) % 10 === 0),
            'and it is a multiple of 10 — no 1.25 micro-plate balanced on the pin'
        );

        eq(errors, [], 'no console errors during load');

        console.log('PASS: Chest Flies renders pin-stack weight breakdown (not plate-loaded).');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
