// What this test covers
// ----------------------
// The day-filter regression: getSimplePR was once `w.day === currentDay`-
// filtered. Under Full Body that filter would silently drop history from
// pre-FB-migration entries (which were day:1 or day:2 under Torso/Limbs).
//
// We seed two history entries for frontal-pulldowns:
//   - Stale (Feb 1) at 220 × 8 — would PR-bump to 222.5 if surfaced.
//   - Recent (May 30) at 160 × 4 — the real "Last:".
//
// Default should be "160" — matching "Last:" — not "222.5".

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readCards } = require('../lib/browser');
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

        const workoutHistory = [
            // newest first
            workoutEntry({
                date: '2026-05-30T20:00:00Z', day: 2,
                exercises: [{ id: 'frontal-pulldowns', name: 'Frontal Plane Pulldowns', weight: '160', reps: '4' }],
            }),
            workoutEntry({
                date: '2026-02-01T20:00:00Z', day: 1,
                exercises: [{ id: 'frontal-pulldowns', name: 'Frontal Plane Pulldowns', weight: '220', reps: '8' }],
            }),
        ];

        await seedPersonalApp(page, { workoutHistory });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        const cards = await readCards(page);
        const frontal = cards.find(c => c.name === 'Frontal Plane Pulldowns');

        ok(frontal, 'Frontal Plane Pulldowns card is rendered in Full Body view');
        contains(frontal.last, '160', '"Last:" shows recent weight');
        contains(frontal.last, '4',   '"Last:" shows recent reps');
        eq(frontal.weightValue, '160',
            'default Weight (lbs) field equals recent weight, ' +
            'not a stale PR bump (would be 222.5 with the bug)');
        eq(errors, [], 'no console errors during load');

        console.log('PASS: personal app default weight tracks most-recent session regardless of day slot.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
