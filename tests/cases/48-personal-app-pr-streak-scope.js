// What this test covers
// ----------------------
// Which sessions getPRStreak is allowed to look at, using seeded history for
// the states you cannot type on a card. Case 47 covers the rule itself through
// the real inputs; this one covers the filter around it.
//
// Four independent exercises, one concern each:
//
//   Chest Press          an unsubmitted entry is invisible to the streak, even
//                        though it would break it if counted
//   Incline Chest Press  an NA session is skipped by isValidExercise rather
//                        than read as a change, so the run spans it
//   Chest Flies          a non-numeric weight ('Body Weight') ends the run
//                        instead of falling through to a reps-only comparison
//   Lateral Raises       six identical sessions is a plateau, which by
//                        construction is a streak of 0 — the gold banner and
//                        the green pill can never share a card
//
// The Chest Flies case is the one with a wrong answer worth naming: without
// the isNaN guard, parseFloat('Body Weight') is NaN, both weight comparisons
// are false, and the walk falls through to `newReps > oldReps` — which is true
// there, giving 3 instead of 2.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NA = { weight: 'NA', reps: 'NA' };

function daysAgo(n) {
    return new Date(Date.now() - n * 86400000).toISOString();
}

// Per-date values for each exercise. Anything absent on a date is written NA,
// which is exactly what the app does to unlogged rows on Submit Day.
const TIMELINE = [
    { offset: 14, submitted: true,  sets: { 'lateral-raises': { weight: '100', reps: '4' } } },
    { offset: 12, submitted: true,  sets: { 'lateral-raises': { weight: '100', reps: '4' } } },
    { offset: 10, submitted: true,  sets: {
        'lateral-raises':      { weight: '100', reps: '4' },
        'incline-chest-press': { weight: '100', reps: '4' },
        'chest-flies':         { weight: 'Body Weight', reps: '3' },
    } },
    { offset: 8,  submitted: true,  sets: {
        'lateral-raises':      { weight: '100', reps: '4' },
        'incline-chest-press': { weight: '100', reps: '5' },
        'chest-flies':         { weight: '100', reps: '4' },
    } },
    { offset: 6,  submitted: true,  sets: {
        'lateral-raises':      { weight: '100', reps: '4' },
        'incline-chest-press': NA,
        'chest-flies':         { weight: '100', reps: '5' },
        'chest-press':         { weight: '100', reps: '4' },
    } },
    { offset: 4,  submitted: true,  sets: {
        'lateral-raises':      { weight: '100', reps: '4' },
        'incline-chest-press': { weight: '100', reps: '6' },
        'chest-flies':         { weight: '100', reps: '6' },
        'chest-press':         { weight: '100', reps: '5' },
    } },
    // Never submitted. Chest Press regresses here; if the streak counted it,
    // the badge below would be gone instead of reading 2.
    { offset: 2,  submitted: false, sets: {
        'chest-press':         { weight: '100', reps: '4' },
    } },
];

const TRACKED = ['chest-press', 'incline-chest-press', 'chest-flies', 'lateral-raises'];
const NAMES = {
    'chest-press': 'Chest Press',
    'incline-chest-press': 'Incline Chest Press',
    'chest-flies': 'Chest Flies',
    'lateral-raises': 'Lateral Raises',
};

function buildHistory() {
    return TIMELINE.map(({ offset, submitted, sets }) => workoutEntry({
        date: daysAgo(offset),
        day: 'upper',
        submitted,
        exercises: TRACKED.map(id => ({
            id,
            name: NAMES[id],
            ...(sets[id] || NA),
        })),
    }));
}

async function readBadge(page, exerciseId) {
    return page.evaluate((id) => {
        const el = document.querySelector(`[data-exercise-id="${id}"] .streak-badge`);
        return el ? el.textContent.trim() : null;
    }, exerciseId);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: buildHistory() });
        await page.evaluate(() => localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'upper');

        eq(await readBadge(page, 'chest-press'), '🔥 1',
            'an unsubmitted session neither extends nor breaks the streak');

        eq(await readBadge(page, 'incline-chest-press'), '🔥 2',
            'an NA session is skipped, not read as a change, so the run spans it');

        eq(await readBadge(page, 'chest-flies'), '🔥 2',
            'a non-numeric weight ends the run rather than falling through to a reps comparison');

        // Six identical sessions: the plateau banner, and necessarily no streak.
        eq(await readBadge(page, 'lateral-raises'), null,
            'six identical sessions is a streak of 0, so no badge');

        const plateau = await page.evaluate(() => {
            const card = document.querySelector('[data-exercise-id="lateral-raises"]');
            return /Plateau Detected/.test(card.textContent);
        });
        ok(plateau, 'the gold Plateau Detected banner still fires on that card');

        // The badge is a sibling of .exercise-name, never a child — a pile of
        // other cases compare that node's textContent to the bare name.
        const names = await page.evaluate((ids) => ids.map(id => {
            const el = document.querySelector(`[data-exercise-id="${id}"] .exercise-name`);
            return el ? el.textContent.trim() : null;
        }), ['chest-press', 'incline-chest-press', 'chest-flies']);
        eq(names, ['Chest Press', 'Incline Chest Press', 'Chest Flies'],
            '.exercise-name carries the bare name on every badged card');

        eq(errors, [], 'no console errors');
        console.log('PASS: the streak reads only submitted, valid, numeric sessions, and never shares a card with the plateau banner.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
