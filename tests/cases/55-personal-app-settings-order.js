// What this test covers
// ----------------------
// Settings > Manage Exercises agrees with the roster, and its reorder arrows
// work across the whole list on a one-day program.
//
// The list is grouped by PROGRAM_DAYS because moveExercise refuses to swap an
// exercise across a day boundary: if the grouping disagreed with the roster,
// the arrows would render enabled and silently do nothing — no error, nothing
// visibly wrong. With one day (Full Body, Sep 2026) there is one group and no
// heading, so the arrows must be live on every row except the two ends. A
// leftover two-day grouping would either hide every row (no exercise is on
// 'anterior' any more) or disable arrows mid-list.
//
// Until Sep 2026 this also pinned the Anterior | Posterior toggle's order and
// labels. The toggle is gone for a one-day program; test 123 pins its absence.
//
// To verify this test is real: put the old `[['anterior', 'Anterior'],
// ['posterior', 'Posterior']]` grouping back in SettingsModal.jsx. The list
// comes back empty and this fails.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// Fresh-install names, in canonical order.
const EXPECTED = [
    'Tricep Extensions', 'Lateral Raises', 'Recline Curls', 'Shoulder Flexion Curls',
    'Chest Flies', 'Chest Press', 'Incline Chest Press', 'Overhead Tricep Extensions',
    'Ab Crunches', 'Sagittal Plane Pullovers', 'Kelso Shrugs', 'Transverse Plane Rows',
    'Frontal Plane Pulldowns', 'Shoulder Press', 'Back Extensions', 'Leg Press',
    'Hip Adduction', 'Calf Raises', 'Leg Extensions',
];

async function openManageExercises(page) {
    await page.click('.settings-btn');
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('.modal-btn'))
            .find(b => b.textContent.includes('Manage Exercises'));
        btn.click();
    });
    await new Promise(r => setTimeout(r, 300));
}

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
        eq(headings, [], 'one program day, so no day heading');
        eq(await readRows(page), EXPECTED, 'every movement is listed, in canonical order');

        const arrows = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.modal .exercise-row')).map(row => {
                const btns = Array.from(row.querySelectorAll('button'));
                return {
                    up: btns.find(b => b.textContent.trim() === '↑')?.disabled,
                    down: btns.find(b => b.textContent.trim() === '↓')?.disabled,
                };
            }));
        ok(arrows[0].up, 'the first row cannot move up');
        ok(arrows[arrows.length - 1].down, 'the last row cannot move down');
        const stuck = arrows.slice(1, -1).map((a, i) => (a.up || a.down) ? EXPECTED[i + 1] : null).filter(Boolean);
        eq(stuck, [], 'every row between the ends can move both ways');

        // And an arrow actually moves a row: Kelso Shrugs down one swaps it
        // with Transverse Plane Rows.
        await page.evaluate(() => {
            const row = Array.from(document.querySelectorAll('.modal .exercise-row'))
                .find(r => r.querySelector('.exercise-row-name')?.textContent.trim() === 'Kelso Shrugs');
            Array.from(row.querySelectorAll('button')).find(b => b.textContent.trim() === '↓').click();
        });
        await new Promise(r => setTimeout(r, 200));
        const moved = await readRows(page);
        eq(moved.slice(10, 12), ['Transverse Plane Rows', 'Kelso Shrugs'], 'the down arrow moved Kelso Shrugs one place');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Manage Exercises lists the one Full Body day in order, arrows live throughout.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
