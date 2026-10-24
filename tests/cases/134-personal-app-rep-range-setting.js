// What this test covers
// ----------------------
// The per-exercise rep range in Settings > Manage Exercises: the Min reps /
// Max reps dropdowns that appear under the pencil. That they open on the
// default 4-6, that Min offers 4-12 and Max never offers less than Min, that
// raising Min past Max drags Max up, that Cancel discards, that Save writes
// `repMin`/`repMax` for that one exercise and it survives a reload.
//
// Then that the setting reaches everything the range drives:
//   - the card's reps dropdown runs from one below Min up to Max (6-8 -> 5..8),
//     while an untouched exercise keeps 3..6;
//   - the PR bump fires at the new top (8), not the old one (6);
//   - a logged set is stamped with the range it was done under;
//   - isFailedSet judges a set by its OWN stamp, so changing a range never
//     rewrites history, and an unstamped (pre-feature) set keeps the 4-6 bottom;
//   - migrateExerciseConfig keeps the pair through a version bump.
//
// To verify this test is real: in config.js make getStandardRepRange return
// DEFAULT_STANDARD_REP_RANGE unconditionally. The save still lands, but the
// form reopens on 4-6 where it expects 6-8; past that, the card's dropdown
// would read 3..6 and the 6-rep session would still bump to 202.5.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType, waitFor } = require('../lib/browser');
const { ACTIVE, readDeckCard, goToCardAndLog } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const TARGET = 'chest-flies';   // seeds 2.5, pin stack
const CONTROL = 'calf-raise';   // left on the default range throughout

function daysAgo(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
}

const lastSession = (reps) => [workoutEntry({
    date: daysAgo(7),
    day: 'full-body',
    exercises: [{ id: TARGET, name: 'Chest Flies', weight: '200', reps }],
})];

async function openManageExercises(page) {
    await page.click('.settings-btn');
    await waitFor(page, 'the Manage Exercises button',
        () => Array.from(document.querySelectorAll('.modal-btn'))
            .some(b => b.textContent.includes('Manage Exercises')));
    await page.evaluate(() => {
        Array.from(document.querySelectorAll('.modal-btn'))
            .find(b => b.textContent.includes('Manage Exercises')).click();
    });
    await waitFor(page, 'the exercise rows',
        () => document.querySelectorAll('.exercise-row').length > 0);
}

async function clickPencil(page, id) {
    await page.evaluate((id) => {
        const row = document.querySelector(`.exercise-row[data-exercise-id="${id}"]`);
        Array.from(row.querySelectorAll('button'))
            .find(b => b.textContent.includes('✏')).click();
    }, id);
    await waitFor(page, `the rep range fields on ${id}`,
        (id) => !!document.querySelector(
            `.exercise-row[data-exercise-id="${id}"] select[data-field="repMin"]`), id);
}

async function clickRowButton(page, id, label) {
    await page.evaluate((id, label) => {
        const row = document.querySelector(`.exercise-row[data-exercise-id="${id}"]`);
        Array.from(row.querySelectorAll('button'))
            .find(b => b.textContent.trim() === label).click();
    }, id, label);
    await new Promise(r => setTimeout(r, 100));
}

// Native setter + change event: React ignores a plain `.value =` assignment.
async function choose(page, id, field, value) {
    await page.evaluate((id, field, value) => {
        const select = document.querySelector(
            `.exercise-row[data-exercise-id="${id}"] select[data-field="${field}"]`);
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, 'value').set;
        setter.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }, id, field, value);
    await new Promise(r => setTimeout(r, 50));
}

const readRange = (page, id) => page.evaluate((id) => {
    const row = document.querySelector(`.exercise-row[data-exercise-id="${id}"]`);
    const read = (field) => {
        const s = row.querySelector(`select[data-field="${field}"]`);
        return s ? { value: s.value, options: Array.from(s.options).map(o => o.value) } : null;
    };
    return { min: read('repMin'), max: read('repMax') };
}, id);

const countRangeFields = (page) =>
    page.evaluate(() => document.querySelectorAll('[data-field="repMin"], [data-field="repMax"]').length);

const readConfig = (page) =>
    page.evaluate((ns) => JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig')), NS);

const cardRepOptions = (page) => page.evaluate((sel) =>
    Array.from(document.querySelector(sel + ' select[data-field="reps"]').options).map(o => o.value),
ACTIVE);

const nums = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

async function reload(page) {
    await page.reload({ waitUntil: 'networkidle0' });
    await waitForApp(page);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Last session: 6 reps, the top of the default range.
        await seedPersonalApp(page, { workoutHistory: lastSession('6') });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS);
        await reload(page);
        const VERSION = await page.evaluate(() => EXERCISE_CONFIG_VERSION);

        // Control: on the default range, 6 reps is the top, so the card bumps.
        await selectDayType(page, 'full-body');
        let flies = await readDeckCard(page, 'Chest Flies');
        eq(flies.weightValue, '202.5', 'before editing, 6 reps tops the default range: 200 + 2.5');
        eq(await cardRepOptions(page), nums(3, 6), 'before editing, the dropdown is 3..6');
        await reload(page);

        // --- Edit mode only, opens on 4-6 ------------------------------------
        await openManageExercises(page);
        eq(await countRangeFields(page), 0, 'no rep range fields before the pencil');

        await clickPencil(page, CONTROL);
        let range = await readRange(page, CONTROL);
        eq([range.min.value, range.max.value], ['4', '6'], 'an untouched exercise opens on 4-6');
        eq(range.min.options, nums(4, 12), 'Min reps offers 4 through 12, never lower than 4');
        eq(range.max.options, nums(4, 12), 'Max reps offers Min (4) through 12');

        // --- Min drags Max up; Cancel discards --------------------------------
        await choose(page, CONTROL, 'repMin', '9');
        range = await readRange(page, CONTROL);
        eq(range.max.value, '9', 'raising Min to 9 past Max 6 lifts Max to 9');
        eq(range.max.options, nums(9, 12), 'and Max no longer offers anything below 9');
        await clickRowButton(page, CONTROL, 'Cancel');
        eq(await countRangeFields(page), 0, 'Cancel closes the fields');
        await clickPencil(page, CONTROL);
        range = await readRange(page, CONTROL);
        eq([range.min.value, range.max.value], ['4', '6'], 'after Cancel it reopens on 4-6');
        await clickRowButton(page, CONTROL, 'Cancel');

        // --- 6-8 saves --------------------------------------------------------
        await clickPencil(page, TARGET);
        await choose(page, TARGET, 'repMin', '6');
        range = await readRange(page, TARGET);
        eq(range.max.value, '6', 'Min 6 with Max 6 leaves Max alone');
        eq(range.max.options, nums(6, 12), 'Max offers 6 through 12');
        await choose(page, TARGET, 'repMax', '8');
        await clickRowButton(page, TARGET, 'Save');
        eq(await countRangeFields(page), 0, 'Save closes the row');

        let saved = await readConfig(page);
        let byId = Object.fromEntries(saved.exercises.map(e => [e.id, e]));
        eq([byId[TARGET].repMin, byId[TARGET].repMax], [6, 8], '6 and 8 reached localStorage as numbers');
        eq(saved.version, VERSION, 'stamped with the current EXERCISE_CONFIG_VERSION');
        const stray = saved.exercises
            .filter(e => e.id !== TARGET && (e.repMin !== undefined || e.repMax !== undefined))
            .map(e => e.id);
        eq(stray, [], 'no other exercise gained a rep range — defaults stay unsaved');

        await reload(page);
        await openManageExercises(page);
        await clickPencil(page, TARGET);
        range = await readRange(page, TARGET);
        eq([range.min.value, range.max.value], ['6', '8'], 'after a reload the form reads 6-8');

        // --- It reaches the cards ---------------------------------------------
        await reload(page);
        await selectDayType(page, 'full-body');
        flies = await readDeckCard(page, 'Chest Flies');
        eq(await cardRepOptions(page), nums(5, 8), '6-8 gives a 5..8 dropdown: one under Min, up to Max');
        eq(flies.weightValue, '200', '6 reps is no longer the top, so no bump');
        eq(flies.repsValue, '6', 'and last session\'s 6 carries over');
        await readDeckCard(page, 'Calf Raises');
        eq(await cardRepOptions(page), nums(3, 6), 'the untouched control keeps 3..6');

        // Hitting the new top bumps the weight and resets to Min.
        await page.evaluate((ns, hist) => {
            localStorage.setItem(ns + 'gymWorkoutHistory', JSON.stringify(hist));
        }, NS, lastSession('8'));
        await reload(page);
        await selectDayType(page, 'full-body');
        flies = await readDeckCard(page, 'Chest Flies');
        eq(flies.weightValue, '202.5', '8 reps tops 6-8: 200 + 2.5');
        eq(flies.repsValue, '6', 'and reps reset to Min, 6');

        // --- A logged set carries its range -----------------------------------
        await goToCardAndLog(page, 'Chest Flies');
        const logged = await page.evaluate((ns, id) => {
            const hist = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory'));
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const w = hist.find(w => { const d = new Date(w.date); d.setHours(0, 0, 0, 0); return d.getTime() === today.getTime(); });
            const e = w && w.exercises.find(e => e.id === id);
            return e ? [e.repMin, e.repMax] : null;
        }, NS, TARGET);
        eq(logged, [6, 8], 'the logged set is stamped repMin 6, repMax 8');

        // --- History is judged by its own range --------------------------------
        const verdicts = await page.evaluate((id) => {
            const stamped = { id, type: 'standard', weight: '210', reps: '5', repMin: 6, repMax: 8 };
            const legacy = { id, type: 'standard', weight: '210', reps: '5' };
            const older = { id, type: 'standard', weight: '200', reps: '8' };
            return {
                stampedFailed: isFailedSet(stamped),
                legacyFailed: isFailedSet(legacy),
                legacyBottom: isFailedSet({ ...legacy, reps: '3' }),
                stampedPR: isImprovement(stamped, older),
                legacyPR: isImprovement(legacy, older),
            };
        }, TARGET);
        eq(verdicts.stampedFailed, true, '5 reps logged under 6-8 is a failed set');
        eq(verdicts.legacyFailed, false, 'the same 5 reps with no stamp keeps the 4-6 bottom: not failed');
        eq(verdicts.legacyBottom, true, 'an unstamped 3 is still failed');
        eq(verdicts.stampedPR, false, 'heavier but failed under 6-8: no PR');
        eq(verdicts.legacyPR, true, 'heavier and unstamped: still the PR it always was');

        // --- Junk pairs fall back; migration keeps a good one ------------------
        const checks = await page.evaluate((id, version) => {
            const valid = [[4, 4], [6, 8], [4, 12], [3, 8], [6, 13], [8, 6], ['6', '8'], [6.5, 8]]
                .map(([a, b]) => isValidRepRange(a, b));
            const migrated = migrateExerciseConfig({
                version: version - 1,
                exercises: DEFAULT_EXERCISES.map(e => e.id === id ? { ...e, repMin: 6, repMax: 8 } : e),
            });
            const m = migrated.exercises.find(e => e.id === id);
            return { valid, migrated: [m.repMin, m.repMax] };
        }, TARGET, VERSION);
        eq(checks.valid, [true, true, true, false, false, false, false, false],
            'isValidRepRange accepts 4-4, 6-8, 4-12 and rejects 3-8, 6-13, 8-6, strings, fractions');
        eq(checks.migrated, [6, 8], 'a version-bump migration keeps repMin/repMax');

        eq(errors, [], 'no console errors');
        console.log('PASS: the rep range setting edits, persists and drives the dropdown, PRs and history');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
