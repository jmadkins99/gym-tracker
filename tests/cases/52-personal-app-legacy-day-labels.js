// What this test covers
// ----------------------
// That the Anterior/Posterior switch did not rewrite the past.
//
// Workout history is NEVER migrated — a session logged in August 2026 keeps
// `day: 'upper'` in localStorage forever. getWorkoutDayLabel therefore has to
// keep mapping the retired literals, and getWorkoutExerciseList has to keep
// rendering those workouts against the roster they were actually performed
// with rather than remapping them onto a day that did not exist yet.
//
// Three eras, three titles, from one config:
//   day: 'anterior'  -> "Anterior Day", 12 fields (current, live-config branch)
//   day: 'upper'     -> "Upper Day",    13 fields (legacy, stored branch)
//   day: 'lower'     -> "Lower Day",     8 fields (legacy, stored branch)
//
// To verify this test is real: delete the `if (workout.day === 'upper')` line
// from getWorkoutDayLabel in js/utils.js. The Upper workout's Edit title
// silently becomes "Full Body Day" — it falls through to the numeric-era check
// — and this case fails. Nothing else in the suite notices.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const ANTERIOR_IDS = [
    'pecs-transverse-shoulder-adduction-with-elbow-extension', 'pecs-shoulder-flexion', 'pecs-transverse-shoulder-adduction', 'delts-shoulder-abduction-above-90-degrees',
    'delts-shoulder-abduction-stop-at-90-degrees', 'triceps-elbow-extension-with-shoulder-flexion', 'triceps-elbow-extension',
    'reverse-wrist-curls', 'cable-wrist-curls', 'abs-spinal-flexion',
    'quads-knee-extension', 'quads-knee-extension-during-hip-flexion',
];

// The Aug 2026 rosters, as those workouts were actually performed.
const LEGACY_UPPER_IDS = [
    'pecs-transverse-shoulder-adduction', 'pecs-shoulder-flexion', 'biceps-elbow-flexion-with-shoulder-extension',
    'triceps-elbow-extension-with-shoulder-flexion', 'pecs-transverse-shoulder-adduction-with-elbow-extension', 'delts-shoulder-abduction-stop-at-90-degrees',
    'delts-shoulder-abduction-above-90-degrees', 'lats-frontal-shoulder-adduction', 'delts-transverse-shoulder-abduction-with-elbow-flexion', 'traps-scapular-retraction',
    'lats-sagittal-shoulder-extension', 'triceps-elbow-extension', 'biceps-elbow-flexion-with-shoulder-flexion',
];
const LEGACY_LOWER_IDS = [
    'erectors-spinal-extension', 'reverse-wrist-curls', 'cable-wrist-curls', 'abs-spinal-flexion',
    'quads-knee-extension', 'adductors-transverse-hip-adduction', 'calves-ankle-extension', 'quads-knee-extension-during-hip-flexion',
];

async function clickNav(page, label) {
    await page.evaluate((l) => {
        // The nav moved to a bottom bar, and each button now carries an icon
        // glyph beside its label, so this matches on containment rather than
        // an exact trim.
        const btn = Array.from(document.querySelectorAll('.bottom-nav-btn'))
            .find(b => b.textContent.indexOf(l) !== -1);
        if (btn) btn.click();
    }, label);
    await new Promise(r => setTimeout(r, 300));
}

// Opens the Edit modal on the nth Weekly item and reads back its title and the
// exercise rows it offers, then closes it again.
async function openEdit(page, index) {
    await page.evaluate((i) => {
        document.querySelectorAll('.history-item')[i].querySelector('.history-date button').click();
    }, index);
    await new Promise(r => setTimeout(r, 400));
    const result = await page.evaluate(() => ({
        title: document.querySelector('.modal-title')?.textContent?.trim() || '',
        rows: Array.from(document.querySelectorAll('.modal > div > div'))
            .map(d => d.firstChild?.textContent?.trim())
            .filter(Boolean),
    }));
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('.modal button'))
            .find(b => /Cancel|Close|×/i.test(b.textContent));
        if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 300));
    return result;
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        const history = await page.evaluate((ant, up, low) => {
            const monday = new Date();
            monday.setHours(0, 0, 0, 0);
            const dow = monday.getDay();
            monday.setDate(monday.getDate() + (dow === 0 ? -6 : 1 - dow));
            // All three land on Monday, separated by hour, so none can fall on
            // a future date whenever in the week the suite runs.
            const at = (hour) => {
                const d = new Date(monday);
                d.setHours(hour, 0, 0, 0);
                return d.toISOString();
            };
            const std = (id) => ({
                id, name: id, category: 'Legacy', type: 'standard', weight: '100', reps: '5',
            });
            const entry = (hour, day, ids) => ({
                date: at(hour), day, week: 1, submitted: true, plateauBusters: [],
                exercises: ids.map(std),
            });
            // Newest first once Weekly sorts them: anterior, upper, lower.
            return [entry(18, 'anterior', ant), entry(16, 'upper', up), entry(14, 'lower', low)];
        }, ANTERIOR_IDS, LEGACY_UPPER_IDS, LEGACY_LOWER_IDS);

        await seedPersonalApp(page, { workoutHistory: history });
        await page.evaluate(() =>
            localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await clickNav(page, 'History');

        const count = await page.evaluate(() => document.querySelectorAll('.history-item').length);
        eq(count, 3, 'all three eras render in the current week');

        // Current era: live-config branch, today's 12.
        const anterior = await openEdit(page, 0);
        contains(anterior.title, 'Anterior', 'a day:anterior workout is titled Anterior');
        eq(anterior.rows.length, 12, 'the Anterior workout offers 12 fields');

        // Legacy Upper: stored branch, the 13 it was performed with.
        const upper = await openEdit(page, 1);
        contains(upper.title, 'Upper', 'a legacy day:upper workout is still titled Upper');
        ok(!/Anterior|Posterior|Full Body/.test(upper.title),
            `legacy Upper is not relabelled (got "${upper.title}")`);
        eq(upper.rows.length, 13, 'the legacy Upper workout keeps its 13 fields, not today\'s 12');

        // Legacy Lower: stored branch, the 8 it was performed with.
        const lower = await openEdit(page, 2);
        contains(lower.title, 'Lower', 'a legacy day:lower workout is still titled Lower');
        ok(!/Anterior|Posterior|Full Body/.test(lower.title),
            `legacy Lower is not relabelled (got "${lower.title}")`);
        eq(lower.rows.length, 8, 'the legacy Lower workout keeps its 8 fields, not today\'s 9');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: legacy Upper/Lower history keeps its own labels and rosters.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
