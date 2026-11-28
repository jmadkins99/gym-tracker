// What this test covers
// ----------------------
// A PR increment of 4 (Nov 2026), for a machine that only moves in 4 lb steps
// and takes no micro-plates. 4 is just another entry in PR_INCREMENT_OPTIONS,
// so this case checks it follows every rule the other steps do:
//
//   - the Settings dropdown lists 0, 1.25, 2.5, 4, 5, 10 in that order, and
//     choosing 4 saves `increment: 4` (a number) that survives a reload;
//   - after a max-reps session the card's green tag reads "+4 lbs" on a pin
//     stack and on a one-sided plate machine;
//   - on a two-sided plate machine it suggests +8, because 2 a side is not a
//     plate (getWeightIncrement doubles it, like a 1.25), and the Settings
//     hint under the dropdown says so;
//   - with the Dutch cable stack switch on, the suggestion snaps up to a
//     weight that stack can make (53 + 4 = 57 → 58), capped at 84.5;
//   - a saved 4 survives migrateExerciseConfig on a version bump, and a
//     backup restore through the real Settings file input.
//
// resolveIncrement rejects any value outside PR_INCREMENT_OPTIONS, so before 4
// joined the list a saved 4 read back as the 2.5 default.
//
// To verify this test is real: remove 4 from PR_INCREMENT_OPTIONS in
// config.js. The dropdown check fails first; past it, the card reads 202.5
// where this expects 204.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType, waitFor, tap } = require('../lib/browser');
const { ACTIVE, readDeckCard } = require('../lib/deck');
const { seedPersonalApp, seedExerciseConfig, workoutEntry } = require('../lib/state');
const { eq } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const TARGET = 'pecs-transverse-shoulder-adduction';   // Chest Flies, pin, default 2.5

function daysAgo(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
}

const rowSel = (id) => `.exercise-row[data-exercise-id="${id}"]`;

async function reload(page) {
    await page.reload({ waitUntil: 'networkidle0' });
    await waitForApp(page);
}

async function openManageExercises(page) {
    await tap(page, '.settings-btn');
    await tap(page, '.modal-btn', { text: /Manage Exercises/ });
    await waitFor(page, 'the exercise rows',
        () => document.querySelectorAll('.exercise-row').length > 0);
}

async function clickPencil(page, id) {
    await tap(page, rowSel(id) + ' button', { text: 'Edit' });
    await waitFor(page, `the increment field on ${id}`,
        (sel) => !!document.querySelector(sel + ' select[data-field="increment"]'), rowSel(id));
}

// Save and Cancel both swap the row's Edit button back, so the press has
// landed once Edit shows again.
async function clickRowButton(page, id, label) {
    await tap(page, rowSel(id) + ' button', { text: label });
    await waitFor(page, `${label} on ${id} to show its Edit button`, (sel) =>
        Array.from(document.querySelectorAll(sel + ' button'))
            .some(b => b.textContent.trim() === 'Edit'), rowSel(id));
}

// Native setter + change event: React ignores a plain `.value =` assignment.
async function chooseIncrement(page, id, value) {
    await page.evaluate((sel, value) => {
        const select = document.querySelector(sel + ' select[data-field="increment"]');
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, 'value').set;
        setter.call(select, value);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }, rowSel(id), value);
}

const readIncrementField = (page, id) => page.evaluate((sel) => {
    const field = document.querySelector(sel + ' select[data-field="increment"]');
    return { value: field.value, options: Array.from(field.options).map(o => o.value) };
}, rowSel(id));

const savedIncrement = (page) => page.evaluate((ns, id) => {
    const cfg = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig'));
    return { version: cfg.version, increment: cfg.exercises.find(e => e.id === id).increment };
}, NS, TARGET);

const readGreenTag = (page) => page.evaluate((sel) => {
    const t = document.querySelector(sel + ' .hero-tag.up');
    return t ? t.textContent.trim() : null;
}, ACTIVE);

async function readCard(page) {
    await selectDayType(page, 'anterior-2');
    const card = await readDeckCard(page, 'Chest Flies');
    return { weight: card.weightValue, tag: await readGreenTag(page) };
}

async function seedHistory(page, weight) {
    await seedPersonalApp(page, {
        workoutHistory: [workoutEntry({
            date: daysAgo(7), day: 'anterior',
            exercises: [{ id: TARGET, name: 'Chest Flies', weight, reps: '6' }],
        })],
    });
}

// Feeds a backup to the real <input class="file-input"> in Settings, the way
// picking a file would (same approach as case 60).
async function importBackup(page, backup) {
    await tap(page, '.settings-btn');
    await waitFor(page, 'the Settings file input', () => !!document.querySelector('input.file-input'));
    const fed = await page.evaluate((json) => {
        const input = document.querySelector('input.file-input');
        if (!input) return 'no file input';
        const dt = new DataTransfer();
        dt.items.add(new File([json], 'gym-tracker-backup.json', { type: 'application/json' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return 'ok';
    }, JSON.stringify(backup));
    eq(fed, 'ok', 'fed the backup to the Settings file input');
    // importData saves the restored config with no version key, so that is the
    // sign the FileReader has landed.
    await waitFor(page, 'the imported config to be saved', (ns) => {
        const cfg = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig'));
        return !!cfg && cfg.version === undefined;
    }, NS);
    // Importing closes Settings by itself.
    await waitFor(page, 'Settings to close after the import', () => !document.querySelector('.modal'));
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Last session topped the default range (6), so the card suggests a bump.
        await seedHistory(page, '200');
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS);
        await reload(page);
        const VERSION = await page.evaluate(() => EXERCISE_CONFIG_VERSION);

        // --- The dropdown, and a 4 saved through it --------------------------
        await openManageExercises(page);
        await clickPencil(page, TARGET);
        eq((await readIncrementField(page, TARGET)).options, ['0', '1.25', '2.5', '4', '5', '10'],
            'the dropdown lists 0, 1.25, 2.5, 4, 5, 10 in that order');
        await chooseIncrement(page, TARGET, '4');
        await clickRowButton(page, TARGET, 'Save');
        eq(await savedIncrement(page), { version: VERSION, increment: 4 },
            'Save writes increment 4 as a number, stamped with the current version');

        await reload(page);
        await openManageExercises(page);
        await clickPencil(page, TARGET);
        eq((await readIncrementField(page, TARGET)).value, '4', 'after a reload the field reads 4');

        // --- The card, per load type -----------------------------------------
        await reload(page);
        eq(await readCard(page), { weight: '204', tag: '+4 lbs' },
            'on a pin stack, 200 x 6 suggests 204 and the tag reads +4 lbs');

        await seedExerciseConfig(page, { version: VERSION, ns: NS,
            overrides: { [TARGET]: { increment: 4, loadType: 'plate-one-sided' } } });
        await reload(page);
        eq(await readCard(page), { weight: '204', tag: '+4 lbs' },
            'on a one-sided plate machine it is also +4');

        await seedExerciseConfig(page, { version: VERSION, ns: NS,
            overrides: { [TARGET]: { increment: 4, loadType: 'plate-two-sided' } } });
        await reload(page);
        await openManageExercises(page);
        await clickPencil(page, TARGET);
        eq(await page.evaluate((sel) => {
            const hint = document.querySelector(sel + ' [data-field="increment-hint"]');
            return hint ? hint.textContent.trim() : null;
        }, rowSel(TARGET)), 'Two-sided: suggests +8 lbs', 'the Settings hint says a two-sided 4 suggests +8');
        await reload(page);
        eq(await readCard(page), { weight: '208', tag: '+8 lbs' },
            'on a two-sided plate machine it doubles to +8: 2 a side is not a plate');

        // --- The Dutch cable stack: snapped to a weight it can make ----------
        const suggest = (last) => page.evaluate((last, date) => {
            const hist = [{ date, day: 'anterior', submitted: true, exercises: [
                { type: 'standard', id: 'probe', name: 'Probe', weight: String(last), reps: '6' }] }];
            const ex = { id: 'probe', loadType: 'pin', increment: 4, cableStack: true };
            const pr = getSimplePR(ex, hist, resolveLoadType(ex));
            return pr && { weight: pr.weight, increment: pr.increment };
        }, last, daysAgo(7));
        eq(await suggest(52.5), { weight: '56.5', increment: 4 }, '52.5 + 4 → 56.5 (54 + both 1.25s)');
        eq(await suggest(53), { weight: '58', increment: 5 }, '53 + 4 = 57 → 58, the next stack plate');
        eq(await suggest(82), { weight: '84.5', increment: 2.5 }, '82 + 4 is capped at 84.5');

        await seedHistory(page, '53');
        await seedExerciseConfig(page, { version: VERSION, ns: NS,
            overrides: { [TARGET]: { increment: 4, cableStack: true } } });
        await reload(page);
        eq(await readCard(page), { weight: '58', tag: '+5 lbs' },
            'on the cable stack the card suggests 58 after 53 and tags the real +5');

        // --- A version bump keeps the 4 ----------------------------------------
        await seedHistory(page, '200');
        await seedExerciseConfig(page, { version: VERSION - 1, ns: NS,
            overrides: { [TARGET]: { increment: 4 } } });
        await reload(page);
        eq(await savedIncrement(page), { version: VERSION, increment: 4 },
            'increment 4 survives migrateExerciseConfig on a version bump');
        eq(await readCard(page), { weight: '204', tag: '+4 lbs' }, 'and still reaches the card');

        // --- A backup restore keeps the 4 --------------------------------------
        // Start from a config with no increment saved, so the 4 can only come
        // from the backup.
        await seedExerciseConfig(page, { version: VERSION, ns: NS });
        await reload(page);
        const backup = await page.evaluate((id, date) => ({
            workoutHistory: [{ date, day: 'anterior', submitted: true, week: 1, plateauBusters: [],
                exercises: [{ type: 'standard', id, name: 'Chest Flies', weight: '200', reps: '6',
                    minReps: 6, maxReps: 8 }] }],
            exerciseConfig: {
                exercises: DEFAULT_EXERCISES.map(ex => (ex.id === id ? { ...ex, increment: 4 } : { ...ex })),
            },
            exportDate: new Date().toISOString(),
        }), TARGET, daysAgo(7));
        await importBackup(page, backup);
        await reload(page);
        eq(await savedIncrement(page), { version: VERSION, increment: 4 },
            'increment 4 survives a backup restore and the rebuild after it');
        eq(await readCard(page), { weight: '204', tag: '+4 lbs' }, 'and the restored 4 reaches the card');

        eq(errors, [], 'no console errors');
        console.log('PASS: a PR increment of 4 saves, persists, and follows the two-sided and cable stack rules');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
