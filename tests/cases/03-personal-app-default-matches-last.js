// What this test covers
// ----------------------
// The same day-filter regression as case 02, but on the personal app.
//
// Personal app uses SIMPLE_PR_TRACKING (bump when last reps >= 6).
// frontal-pulldowns is on Day 1 (Torso) per the current canonical
// program. We give it stale Day 1 history (220 × 8 → would PR-bump to
// 222.5 with the bug) AND recent Day 2 history (160 × 4 → no PR bump,
// the real "Last:").
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

        ok(frontal, 'Frontal Plane Pulldowns card is rendered on Day 1 (Torso)');
        contains(frontal.last, '160', '"Last:" shows recent Day-2 weight');
        contains(frontal.last, '4',   '"Last:" shows recent Day-2 reps');
        eq(frontal.weightValue, '160',
            'default Weight (lbs) field should equal recent weight, ' +
            'not a stale Day-1 PR bump (would be 222.5 with the bug)');
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
