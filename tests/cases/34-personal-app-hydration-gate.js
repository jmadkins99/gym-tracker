// What this test covers
// ----------------------
// Storage hydration at mount: everything the app derives from persisted state
// must be on screen after a load. Seeds (a) workout history for
// frontal-pulldowns and (b) an exerciseConfig with a user-renamed exercise
// plus the migratedToFullBody2 flag so the config survives the FB wipe.
// Asserts the renamed card renders with "Last:" and default weight from
// history, and the header week is derived from the earliest seeded workout
// (the week-migration effect recomputes it from history, ignoring any cache).
//
// Written as a pin-down BEFORE the async storage-repo refactor: if the
// hydration path breaks (config not loaded, history not loaded, render
// before hydration), this fails.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readCards, selectDayType } = require('../lib/browser');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

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
                date: '2026-05-30T20:00:00Z', day: 'fullbody',
                exercises: [{ id: 'frontal-pulldowns', name: 'Frontal Plane Pulldowns', weight: '160', reps: '4' }],
            }),
            workoutEntry({
                date: '2026-02-01T20:00:00Z', day: 'fullbody',
                exercises: [{ id: 'frontal-pulldowns', name: 'Frontal Plane Pulldowns', weight: '150', reps: '8' }],
            }),
        ];

        await seedPersonalApp(page, { workoutHistory });
        await page.evaluate((ns) => {
            // Renamed exercise in an otherwise-default config; set the FB flag
            // so the mount migration doesn't wipe it.
            const exercises = DEFAULT_EXERCISES.map(e =>
                e.id === 'frontal-pulldowns' ? { ...e, name: 'My Custom Pulldowns' } : e
            );
            localStorage.setItem(ns + 'gymExerciseConfig', JSON.stringify({ exercises }));
            localStorage.setItem(ns + 'migratedToFullBody2', 'true');
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'posterior');

        const cards = await readCards(page);
        const renamed = cards.find(c => c.name === 'My Custom Pulldowns');

        ok(renamed, 'renamed exercise card rendered (config hydrated)');
        contains(renamed.last, '160', '"Last:" shows recent weight (history hydrated)');
        contains(renamed.last, '4',   '"Last:" shows recent reps');
        eq(renamed.weightValue, '160', 'default weight tracks most-recent session');

        // Expected week = weeks between the Monday of the earliest seeded
        // workout (2026-02-01) and the Monday of today, + 1 (mirrors
        // getConsecutiveWeek, which the week-migration effect re-derives
        // from history after wiping the cache).
        const mondayOf = (date) => {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            const day = d.getDay();
            d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
            return d;
        };
        const expectedWeek = Math.floor(
            (mondayOf(new Date()) - mondayOf('2026-02-01T20:00:00Z')) / (7 * 24 * 60 * 60 * 1000)
        ) + 1;
        const week = await page.evaluate(() =>
            document.querySelector('.week-indicator')?.textContent?.trim() || '');
        eq(week, `Week ${expectedWeek}`, 'header week derives from earliest workout in history');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: history, config, and week state all hydrate into the UI at mount.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
