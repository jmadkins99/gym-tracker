// What this test covers
// ----------------------
// The two places outside DEFAULT_EXERCISES that hardcode the day order, and
// which have to stay in step with it:
//
//   1. The workout-view toggle  (WorkoutView.jsx, dayTypeButton calls)
//   2. The Settings > Manage Exercises grouping  (SettingsModal.jsx)
//
// config.js says all three orderings are independent and must be kept in step
// by hand. Test 42 pins the toggle half. The Settings half had NO coverage at
// all, which matters more than it looks: moveExercise refuses to swap an
// exercise across the day boundary, so if the grouping list disagrees with the
// roster, the up/down arrows render enabled and silently do nothing — a
// failure with no error and nothing visibly wrong on screen.
//
// To verify this test is real: swap the two tuples in SettingsModal.jsx's
// grouping array. This case fails and test 42 stays green. Swap the two
// dayTypeButton calls in WorkoutView.jsx instead and both fail.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const EXPECTED_ANTERIOR = [
    'Chest Press', 'Incline Chest Press', 'Chest Flies', 'Shoulder Press',
    'Lateral Raises', 'Overhead Tricep Extensions', 'Ab Crunches',
    'Leg Extensions', 'Tricep Extensions', 'Reverse Wrist Curls',
    'Cable Wrist Curls', 'Leg Press',
];

const EXPECTED_POSTERIOR = [
    'Recline Curls', 'Frontal Plane Pulldowns', 'Sagittal Plane Pulldowns',
    'Transverse Plane Rows', 'Kelso Shrugs', 'Preacher Curls',
    'Back Extensions', 'Hip Adduction', 'Calf Raises',
];

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

        // 1. The toggle: order AND labels. Test 42 checks the attribute values;
        // this also pins the visible text, so a half-done rename is caught.
        const toggle = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-day-type]')).map(b => ({
                type: b.getAttribute('data-day-type'),
                label: b.textContent.trim(),
            })));
        eq(toggle.map(t => t.type), ['anterior', 'posterior'],
            'the toggle is Anterior then Posterior');
        eq(toggle.map(t => t.label), ['Anterior', 'Posterior'],
            'the toggle buttons are labelled Anterior and Posterior');

        // 2. Settings > Manage Exercises.
        await page.click('.settings-btn');
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('.modal-btn'))
                .find(b => b.textContent.includes('Manage Exercises'));
            btn.click();
        });
        await new Promise(r => setTimeout(r, 300));

        const headings = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.modal .section-title')).map(e => e.textContent.trim()));
        eq(headings, ['Anterior', 'Posterior'],
            'Manage Exercises groups by day, Anterior first — matching the toggle and DEFAULT_EXERCISES');

        // Each group's rows, in order. The grouping renders a .section-title
        // followed by that day's rows, so walk the container in document order
        // and split on the headings.
        const grouped = await page.evaluate(() => {
            const out = {};
            let current = null;
            const container = document.querySelector('.modal');
            for (const el of Array.from(container.querySelectorAll('.section-title, .exercise-row'))) {
                if (el.classList.contains('section-title')) {
                    current = el.textContent.trim();
                    out[current] = [];
                } else if (current) {
                    // Read the name off its own element rather than stripping
                    // control glyphs off the row's textContent: the row also
                    // holds a <select>, and a select's textContent is every
                    // option's label, not just the selected one.
                    const label = el.querySelector('.exercise-row-name')?.textContent.trim();
                    if (label) out[current].push(label);
                }
            }
            return out;
        });

        eq(grouped['Anterior'], EXPECTED_ANTERIOR,
            'the Anterior group lists its 12 movements in canonical order');
        eq(grouped['Posterior'], EXPECTED_POSTERIOR,
            'the Posterior group lists its 9 movements in canonical order');

        // The arrows must stop at each day boundary — that is the whole reason
        // the list is grouped. First row of a group cannot go up; last cannot
        // go down.
        const arrowState = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.exercise-row'));
            const at = (i) => {
                const btns = Array.from(rows[i].querySelectorAll('button'));
                return {
                    up: btns.find(b => b.textContent.trim() === '↑')?.disabled,
                    down: btns.find(b => b.textContent.trim() === '↓')?.disabled,
                };
            };
            return { count: rows.length, first: at(0), lastAnterior: at(11), firstPosterior: at(12), last: at(rows.length - 1) };
        });

        eq(arrowState.count, 21, 'all 21 movements are listed across the two groups');
        ok(arrowState.first.up, 'the first Anterior row cannot move up');
        ok(arrowState.lastAnterior.down, 'the last Anterior row cannot move down past the boundary');
        ok(arrowState.firstPosterior.up, 'the first Posterior row cannot move up past the boundary');
        ok(arrowState.last.down, 'the last Posterior row cannot move down');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: the day toggle and the Settings grouping agree with the roster.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
