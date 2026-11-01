// What this test covers
// ----------------------
// A PR increment of 0 — "never bump this exercise". The step is a user setting
// (case 110 covers the field itself), and 0 is the one value that turns the
// suggestion off rather than resizing it:
//   - the dropdown offers it, labelled rather than a bare "0", and explains
//     itself in the hint under the field;
//   - Save writes a literal 0 for that one exercise and it survives a reload —
//     the thing a `saved || DEFAULT` in resolveIncrement would silently undo;
//   - the card then carries last session's weight AND reps forward after a
//     max-reps session, instead of suggesting the next weight up at the bottom
//     of the rep range, and the green "+N lbs" hero tag is gone;
//   - the session still counts as a PR everywhere PRs are read from history:
//     the flame streak pill is untouched;
//   - 0 is not doubled on a two-sided machine the way a 1.25 is (case 61),
//     because off is off on every load type.
//
// To verify this test is real: in config.js drop the 0 from
// PR_INCREMENT_OPTIONS. resolveIncrement then rejects the saved 0 and falls
// back to 2.5, so the card reads 202.5 where this expects 200 and the reps
// reset to 4 where this expects 6.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType, waitFor } = require('../lib/browser');
const { ACTIVE, readDeckCard } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const TARGET = 'pecs-transverse-shoulder-adduction';   // seeds 2.5, pin stack
const CONTROL = 'calves-ankle-extension';   // left on the 2.5 seed throughout

function daysAgo(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
}

// Two sessions, the later one an improvement on the first, so there is a flame
// streak to watch as well as a bump: 200x5 then 200x6, and 6 tops the default
// 4-6 range. Newest first, the order App.jsx writes history in — the card's
// "last session" reads the array, not the dates.
const history = [
    workoutEntry({
        date: daysAgo(7),
        day: 'full-body',
        exercises: [
            { id: TARGET, name: 'Chest Flies', weight: '200', reps: '6' },
            { id: CONTROL, name: 'Calf Raises', weight: '100', reps: '6' },
        ],
    }),
    workoutEntry({
        date: daysAgo(14),
        day: 'full-body',
        exercises: [
            { id: TARGET, name: 'Chest Flies', weight: '200', reps: '5' },
            { id: CONTROL, name: 'Calf Raises', weight: '100', reps: '5' },
        ],
    }),
];

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
    await waitFor(page, `the increment field on ${id}`,
        (id) => !!document.querySelector(
            `.exercise-row[data-exercise-id="${id}"] select[data-field="increment"]`), id);
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
async function chooseIncrement(page, id, value) {
    await page.evaluate((id, value) => {
        const select = document.querySelector(
            `.exercise-row[data-exercise-id="${id}"] select[data-field="increment"]`);
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, 'value').set;
        setter.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }, id, value);
    await new Promise(r => setTimeout(r, 50));
}

const readRow = (page, id) => page.evaluate((id) => {
    const row = document.querySelector(`.exercise-row[data-exercise-id="${id}"]`);
    const field = row.querySelector('select[data-field="increment"]');
    const hint = row.querySelector('[data-field="increment-hint"]');
    return {
        value: field ? field.value : null,
        options: field ? Array.from(field.options).map(o => o.value) : null,
        labels: field ? Array.from(field.options).map(o => o.textContent.trim()) : null,
        hint: hint ? hint.textContent.replace(/\s+/g, ' ').trim() : null,
    };
}, id);

const readConfig = (page) =>
    page.evaluate((ns) => JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig')), NS);

const cardExtras = (page) => page.evaluate((sel) => {
    const slot = document.querySelector(sel);
    const tag = slot.querySelector('.hero-tag.up');
    const streak = slot.querySelector('.streak-badge');
    return {
        heroTag: tag ? tag.textContent.trim() : null,
        streak: streak ? streak.textContent.trim() : null,
    };
}, ACTIVE);

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

        await seedPersonalApp(page, { workoutHistory: history });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS);
        await reload(page);
        const VERSION = await page.evaluate(() => EXERCISE_CONFIG_VERSION);

        // --- Control: on the 2.5 seed a max-reps session bumps ---------------
        await selectDayType(page, 'full-body');
        let flies = await readDeckCard(page, 'Chest Flies');
        eq(flies.weightValue, '202.5', 'on the 2.5 seed, 6 reps bumps the weight: 200 + 2.5');
        eq(flies.repsValue, '4', 'and the reps reset to the bottom of the rep range');
        eq(await cardExtras(page), { heroTag: '+2.5 lbs', streak: '🔥 1' },
            'the green hero tag and the flame streak both show');
        await reload(page);

        // --- 0 is on offer, labelled, and explains itself -------------------
        await openManageExercises(page);
        await clickPencil(page, TARGET);
        let row = await readRow(page, TARGET);
        eq(row.value, '2.5', 'the field opens on the 2.5 seed');
        eq(row.options, ['0', '1.25', '2.5', '5', '10'], '0 is offered alongside the plate steps');
        eq(row.labels[0], '0 — never bump', 'and reads as words, not a bare 0');
        eq(row.hint, null, 'a plain 2.5 on a pin stack needs no hint');

        await chooseIncrement(page, TARGET, '0');
        row = await readRow(page, TARGET);
        eq(row.value, '0', 'the dropdown holds the 0');
        eq(row.hint, "Never bumps: max reps still counts as a PR, but the card keeps last session's weight and reps.",
            'and the hint under it says what 0 does');

        // --- Cancel discards, then Save writes a literal 0 -------------------
        await clickRowButton(page, TARGET, 'Cancel');
        await clickPencil(page, TARGET);
        eq((await readRow(page, TARGET)).value, '2.5', 'after Cancel it reopens on 2.5');
        await chooseIncrement(page, TARGET, '0');
        await clickRowButton(page, TARGET, 'Save');

        let saved = await readConfig(page);
        let byId = Object.fromEntries(saved.exercises.map(e => [e.id, e]));
        eq(byId[TARGET].increment, 0, 'the 0 reached localStorage as the number 0');
        eq(saved.version, VERSION, 'stamped with the current EXERCISE_CONFIG_VERSION');
        const stray = saved.exercises
            .filter(e => e.id !== TARGET && e.increment !== undefined)
            .map(e => `${e.id}: ${e.increment}`);
        eq(stray, [], 'no other exercise gained an increment — seeds stay unsaved');

        // The reopen is the real guard on resolveIncrement: a truthiness test
        // there would read the saved 0 as "nothing saved" and show 2.5.
        await reload(page);
        await openManageExercises(page);
        await clickPencil(page, TARGET);
        eq((await readRow(page, TARGET)).value, '0', 'after a reload the field still reads 0');

        // --- The card stops suggesting anything ------------------------------
        await reload(page);
        await selectDayType(page, 'full-body');
        flies = await readDeckCard(page, 'Chest Flies');
        eq(flies.weightValue, '200', 'a max-reps session no longer bumps the weight');
        eq(flies.repsValue, '6', "and last session's 6 reps carry over, no reset to the range bottom");
        eq(flies.heroWeight, '200', 'the hero number is last session\'s weight');
        eq(await cardExtras(page), { heroTag: null, streak: '🔥 1' },
            'the green hero tag is gone, but the PR streak still counts the session');

        // The control proves 0 is per-exercise, not a global switch.
        const calves = await readDeckCard(page, 'Calf Raises');
        eq(calves.weightValue, '102.5', 'the untouched control still bumps by its 2.5 seed');
        eq(calves.repsValue, '4', 'and still resets to the bottom of its range');

        // --- Off is off on every load type -----------------------------------
        const steps = await page.evaluate(() => ({
            pin: getWeightIncrement({ id: 'x', increment: 0 }, 'pin'),
            oneSided: getWeightIncrement({ id: 'x', increment: 0 }, 'plate-one-sided'),
            twoSided: getWeightIncrement({ id: 'x', increment: 0 }, 'plate-two-sided'),
        }));
        eq(steps, { pin: 0, oneSided: 0, twoSided: 0 },
            'a 0 is never doubled onto a two-sided machine the way a 1.25 is');

        eq(errors, [], 'no console errors');
        console.log('PASS: a 0 PR increment saves, persists, and switches the bump off for that exercise');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
