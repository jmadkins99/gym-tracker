// What this test covers
// ----------------------
// Settings > Manage Exercises agrees with the roster, and its reorder arrows
// stop at each day's edge.
//
// The list is grouped by PROGRAM_DAYS because moveExercise refuses to swap an
// exercise across a day boundary: if the grouping disagreed with the roster,
// the arrows would render enabled and silently do nothing — no error, nothing
// visibly wrong. With two days (Anterior and Posterior, v28, Nov 2026) there
// are two headed groups, and the arrows must be live on every row except the
// two ends of each group. A leftover one-day grouping would either hide every
// row (no exercise is on 'full-body' any more) or leave arrows enabled across
// the boundary.
//
// From Sep to Nov 2026 the program was one Full Body day and this case pinned
// the absence of a heading instead.
//
// To verify this test is real: put the Sep 2026 `[['full-body', 'Full Body']]`
// grouping back in SettingsModal.jsx. The list comes back empty and this fails.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, openManageExercises, tap, waitFor } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// Fresh-install names, in canonical order, by day.
const ANTERIOR = [
    'Chest Flies', 'Low to High Flies', 'High to Low Flies', 'Chest Press',
    'Tricep Extensions', 'Lateral Raises', 'Overhead Tricep Extensions',
    'Lu Raises', 'JM Press', 'Leg Extensions', 'Squats',
];
const POSTERIOR = [
    'Recline Curls', 'Preacher Curls', 'Supinations', 'Sagittal Pulldowns',
    'Frontal Pulldowns', 'Ab Crunches', 'Kelso Shrugs', 'Reverse Wrist Curls',
    'Wrist Curls', 'Calf Raises', 'Stiff Legged Deadlift',
];
const EXPECTED = [...ANTERIOR, ...POSTERIOR];

// Read the name off its own element rather than stripping control glyphs off
// the row's textContent: the row also holds a <select>, and a select's
// textContent is every option's label, not just the selected one.
const readRows = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('.modal .exercise-row'))
        .map(el => el.querySelector('.exercise-row-name')?.textContent.trim()));

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate(() =>
            localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        await openManageExercises(page);

        const headings = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.modal .section-title')).map(e => e.textContent.trim()));
        eq(headings, ['Anterior', 'Posterior'], 'a heading per program day');
        eq(await readRows(page), EXPECTED, 'every movement is listed, by day, in canonical order');

        const arrows = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.modal .exercise-row')).map(row => {
                const btns = Array.from(row.querySelectorAll('button'));
                return {
                    up: btns.find(b => b.textContent.trim() === '↑')?.disabled,
                    down: btns.find(b => b.textContent.trim() === '↓')?.disabled,
                };
            }));
        // Each day's first row cannot move up and its last cannot move down;
        // every other row can move both ways.
        const firsts = [0, ANTERIOR.length];
        const lasts = [ANTERIOR.length - 1, EXPECTED.length - 1];
        const wrong = arrows.map((a, i) => {
            const want = { up: firsts.includes(i), down: lasts.includes(i) };
            return (a.up !== want.up || a.down !== want.down) ? EXPECTED[i] : null;
        }).filter(Boolean);
        eq(wrong, [], 'arrows stop at each day\'s ends and are live everywhere else');

        // And an arrow actually moves a row: Kelso Shrugs down one swaps it
        // with whatever follows it. Derived, so a reorder does not rot it.
        const kelsoIndex = EXPECTED.indexOf('Kelso Shrugs');
        await tap(page, await page.evaluateHandle(() => {
            const row = Array.from(document.querySelectorAll('.modal .exercise-row'))
                .find(r => r.querySelector('.exercise-row-name')?.textContent.trim() === 'Kelso Shrugs');
            return Array.from(row.querySelectorAll('button')).find(b => b.textContent.trim() === '↓');
        }));
        await waitFor(page, 'Kelso Shrugs to move down a row', (want) =>
            document.querySelectorAll('.modal .exercise-row-name')[want]?.textContent.trim() === 'Kelso Shrugs', kelsoIndex + 1);
        const moved = await readRows(page);
        eq(moved.slice(kelsoIndex, kelsoIndex + 2), [EXPECTED[kelsoIndex + 1], 'Kelso Shrugs'], 'the down arrow moved Kelso Shrugs one place');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Manage Exercises lists Anterior then Posterior in order, arrows stopping at each day\'s ends.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
