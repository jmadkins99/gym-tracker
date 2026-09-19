// What this test covers
// ----------------------
// The public app's PR increment dropdown, the twin of case 110. In
// Settings > Manage Day N Exercises > ✏️ there is a "PR Increment" dropdown
// under "How It's Loaded", offering the four real plate steps. It is saved by
// the same Save button as the rest of the form, so Cancel undoes it, and the
// saved number reaches the card's PR suggestion.
//
// The public app has no id-keyed seed map the way the personal app does. An
// exercise with no saved increment steps by 2.5, as it always has, and the
// dropdown opens on that 2.5. Only an explicit choice is written, so a client
// who never opens the form never grows an `increment` key.
//
// Two-sided doubling comes along with it: a step that does not split into real
// plates on a two-sided machine is doubled on the card, and the form says so
// under the dropdown rather than letting the card disagree with it silently.
//
// To verify this test is real: make getMinimalistPR ignore the saved value and
// return 2.5. The card reads 202.5 where it expects 205.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, waitFor } = require('../lib/browser');
const { readDeckCard, selectDeckDay } = require('../lib/deck');
const { seedPublicApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { PUBLIC_APP_ROOT } = require('../lib/paths');

const NS = 'gym-local:';
const PIN = 'c-flies';      // Chest Flies: pin stack
const TWO = 'c-legpress';   // Leg Press: two-sided plates

function daysAgo(n) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.toISOString();
}

function config() {
    const mk = (id, name, order) => ({
        id, name, category: 'Push', order, typeId: 'standard', sets: 1, minReps: 6, maxReps: 8,
    });
    return {
        version: 2,
        categories: ['Push'],
        minimalistPrTracking: true,
        days: { 1: [mk(PIN, 'Chest Flies', 0), mk(TWO, 'Leg Press', 1)] },
    };
}

const SCHEDULE = {
    version: 2,
    workoutDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        .map(dayOfWeek => ({ dayOfWeek, workoutDayNumber: 1 })),
    totalWorkoutDays: 1,
    scheduleIsExplicit: true,
};

async function openManageDay(page) {
    await page.click('.settings-btn');
    await waitFor(page, 'the Manage Day 1 button',
        () => Array.from(document.querySelectorAll('.modal-btn'))
            .some(b => b.textContent.includes('Manage Day 1 Exercises')));
    await page.evaluate(() => {
        Array.from(document.querySelectorAll('.modal-btn'))
            .find(b => b.textContent.includes('Manage Day 1 Exercises')).click();
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
    const loadType = row.querySelector('select[data-field="loadType"]');
    const hint = row.querySelector('[data-field="increment-hint"]');
    return {
        value: field ? field.value : null,
        options: field ? Array.from(field.options).map(o => o.value) : null,
        below: field && loadType
            ? !!(loadType.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING)
            : null,
        hint: hint ? hint.textContent.trim() : null,
    };
}, id);

const countIncrementFields = (page) =>
    page.evaluate(() => document.querySelectorAll('[data-field="increment"]').length);

const savedIncrements = (page) => page.evaluate((ns) => {
    const cfg = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig'));
    return Object.fromEntries(Object.values(cfg.days).flat()
        .filter(e => e.increment !== undefined).map(e => [e.id, e.increment]));
}, NS);

async function reload(page) {
    await page.reload({ waitUntil: 'networkidle0' });
    await waitForApp(page);
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Both at the top of the 6-8 range last time, so both suggest a bump.
        await seedPublicApp(page, {
            exerciseConfig: config(),
            schedule: SCHEDULE,
            workoutHistory: [workoutEntry({
                date: daysAgo(3),
                day: 1,
                exercises: [
                    { id: PIN, name: 'Chest Flies', weight: '200', reps: '8' },
                    { id: TWO, name: 'Leg Press', weight: '300', reps: '8' },
                ],
            })],
        });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
            localStorage.setItem(ns + 'hasSeenTutorial', 'true');
        }, NS);
        await reload(page);

        // Control: nothing saved, so the card steps by 2.5.
        await selectDeckDay(page, 1);
        let flies = await readDeckCard(page, 'Chest Flies');
        eq(flies.weightValue, '202.5', 'before editing, the card suggests 200 + 2.5');
        await reload(page);

        // --- Edit mode only ---------------------------------------------
        await openManageDay(page);
        eq(await countIncrementFields(page), 0, 'no increment field is shown before the pencil');
        await clickPencil(page, PIN);
        let row = await readRow(page, PIN);
        eq(row.value, '2.5', 'an exercise with nothing saved opens on 2.5');
        eq(row.below, true, 'the increment dropdown sits below the load-type dropdown');
        eq(row.options, ['1.25', '2.5', '5', '10'], 'it offers exactly the four plate steps');
        eq(row.hint, null, 'no two-sided hint on a pin stack');

        // --- Cancel discards --------------------------------------------
        await chooseIncrement(page, PIN, '10');
        await clickRowButton(page, PIN, 'Cancel');
        eq(await countIncrementFields(page), 0, 'Cancel closes the form');
        eq(await savedIncrements(page), {}, 'Cancel saved nothing');

        // --- Two-sided hint ---------------------------------------------
        await clickPencil(page, TWO);
        await chooseIncrement(page, TWO, '1.25');
        eq((await readRow(page, TWO)).hint, 'Two-sided: suggests +2.5 lbs',
            'a step that will not split onto real plates says what the card will suggest');
        await chooseIncrement(page, TWO, '5');
        eq((await readRow(page, TWO)).hint, null, 'a step that splits cleanly needs no hint');
        await clickRowButton(page, TWO, 'Cancel');

        // --- Save --------------------------------------------------------
        await clickPencil(page, PIN);
        await chooseIncrement(page, PIN, '5');
        await clickRowButton(page, PIN, 'Save');
        eq(await savedIncrements(page), { [PIN]: 5 },
            'Save writes 5, as a number, on that exercise only');

        // --- Survives a reload and reaches the card -----------------------
        await reload(page);
        await openManageDay(page);
        await clickPencil(page, PIN);
        eq((await readRow(page, PIN)).value, '5', 'after a reload the field reads 5');

        await reload(page);
        await selectDeckDay(page, 1);
        flies = await readDeckCard(page, 'Chest Flies');
        eq(flies.weightValue, '205', 'the card now suggests 200 + 5');
        const tag = await page.evaluate(() => {
            const t = document.querySelector('.deck-slot:not([aria-hidden="true"]) .hero-tag.up');
            return t ? t.textContent.trim() : null;
        });
        eq(tag, '+5 lbs', 'and the hero tag reads +5 lbs');

        // A saved 1.25 on the two-sided machine is doubled on the card.
        await page.evaluate((ns, id) => {
            const cfg = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig'));
            Object.values(cfg.days).flat().find(e => e.id === id).increment = 1.25;
            localStorage.setItem(ns + 'gymExerciseConfig', JSON.stringify(cfg));
        }, NS, TWO);
        await reload(page);
        await selectDeckDay(page, 1);
        const press = await readDeckCard(page, 'Leg Press');
        eq(press.weightValue, '302.5', 'a 1.25 step on a two-sided machine suggests 300 + 2.5');

        ok(errors.length === 0, `no console errors (${JSON.stringify(errors)})`);
        console.log('PASS: the public PR increment field edits, persists and reaches the card.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
