// What this test covers
// ----------------------
// Two things that must survive an exercise going to a PR increment of 0
// (spec #27, ticket #29; case 149 covers logging and History at 0):
//   - A session logged under a custom 7-9 range keeps its failed-set verdict
//     after the real Settings switch is set to 0, and the same set logged with
//     no range is a PR.
//   - The app's own Export writes a backup holding stamped (noRange) and
//     unstamped sets, and its own Import restores both unchanged.
//
// To verify this test is real: in plateauLogic.js make isFailedSet ignore the
// stored range stamp (the verdict step fails); in App.jsx exportData drop the
// workout history from the file (the restore step fails).

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType, waitFor, tap, openSettings, closeSettings } = require('../lib/browser');
const { goToCardById, revealCard } = require('../lib/deck');
const { seedPersonalApp, seedExerciseConfig, workoutEntry } = require('../lib/state');
const { eq } = require('../lib/assert');
const { HISTORY_SESSION, dateKey, historyGoTo } = require('../lib/history');

const ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const TARGET = 'pecs-transverse-shoulder-adduction';   // Chest Flies, anterior-2
const CONTROL = 'pecs-shoulder-flexion';              // Low to High Flies, anterior-2

function daysAgo(n) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.toISOString();
}
const today = () => daysAgo(0).slice(0, 10);

const flies = (daysBack, weight, reps, extra = {}) => workoutEntry({
    date: daysAgo(daysBack), day: 'anterior-2',
    exercises: [{ id: TARGET, name: 'Chest Flies', weight, reps, ...extra }] });

const readStore = (page) => page.evaluate((ns) =>
    JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory')) || [], NS);

async function setup(page, VERSION, history, overrides = { increment: 0 }) {
    await seedPersonalApp(page, { workoutHistory: history });
    await seedExerciseConfig(page, { overrides: { [TARGET]: overrides }, version: VERSION });
    await page.reload({ waitUntil: 'networkidle0' });
    await waitForApp(page);
    await selectDayType(page, 'anterior-2');
    await goToCardById(page, TARGET);
    await revealCard(page);
}

async function bottomTo(page, label) {
    await tap(page, '.bottom-nav-btn', { text: new RegExp(label) });
}

// The Chest Flies row's PR badge (its streak, 'PR' for a lone one, null for
// none) on the History card of every stored session, newest first.
async function readHistory(page) {
    const dates = [...new Set((await readStore(page)).map(w => dateKey(w.date)))].sort().reverse();
    await bottomTo(page, 'History');
    await waitFor(page, 'the History deck', () => !!document.querySelector('[data-history-shown]'));
    const rows = [];
    for (const date of dates) {
        await historyGoTo(page, date);
        rows.push(...await page.evaluate((session) => Array.from(document.querySelectorAll(session + ' .history-exercise'))
            .filter(r => r.querySelector('.history-exercise-name').textContent.trim() === 'Chest Flies')
            .map(r => {
                const b = r.querySelector('[data-pr-badge]');
                return b ? (b.getAttribute('data-streak') || 'PR') : null;
            }), HISTORY_SESSION));
    }
    return rows;
}

async function importBackup(page, backup) {
    await openSettings(page);
    await page.evaluate((json) => {
        const input = document.querySelector('input.file-input');
        const dt = new DataTransfer();
        dt.items.add(new File([json], 'gym-tracker-backup.json', { type: 'application/json' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }, JSON.stringify(backup));
    await waitFor(page, 'the import to land', (n) =>
        JSON.parse(localStorage.getItem('gym-local:gymWorkoutHistory') || '[]').length === n,
        backup.workoutHistory.length);
    await closeSettings(page);
}

// The app's real Export: the download link's blob is captured and read back.
async function exportBackup(page) {
    await openSettings(page);
    await page.evaluate(() => {
        const make = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => { window.__exported = blob; return make(blob); };
        Array.from(document.querySelectorAll('.modal-btn'))
            .find(b => b.textContent.includes('Export Data')).click();
    });
    await waitFor(page, 'the export', () => !!window.__exported);
    const text = await page.evaluate(() => window.__exported.text());
    await closeSettings(page);
    return JSON.parse(text);
}

async function changeIncrement(page, step) {
    await openSettings(page);
    await page.evaluate(() => Array.from(document.querySelectorAll('.modal-btn'))
        .find(b => b.textContent.includes('Manage Exercises')).click());
    await waitFor(page, 'the exercise rows', () => document.querySelectorAll('.exercise-row').length > 0);
    const row = `.exercise-row[data-exercise-id="${TARGET}"]`;
    await page.evaluate((row) => Array.from(document.querySelector(row).querySelectorAll('button'))
        .find(b => b.textContent.trim() === 'Edit').click(), row);
    await waitFor(page, 'the increment field', (row) => !!document.querySelector(row + ' select[data-field="increment"]'), row);
    await page.evaluate((row, step) => {
        const s = document.querySelector(row + ' select[data-field="increment"]');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, step);
        s.dispatchEvent(new Event('change', { bubbles: true }));
    }, row, step);
    await page.evaluate((row) => Array.from(document.querySelector(row).querySelectorAll('button'))
        .find(b => b.textContent.trim() === 'Save').click(), row);
    await waitFor(page, 'the form to close', (row) => !document.querySelector(row + ' select[data-field="increment"]'), row);
    await page.evaluate(() => Array.from(document.querySelectorAll('.modal button'))
        .find(b => b.textContent.includes('Back to Settings')).click());
    await waitFor(page, 'the Settings menu', () => Array.from(document.querySelectorAll('.modal .modal-btn'))
        .some(b => b.textContent.trim() === 'Close'));
    await closeSettings(page);
}

(async () => {
    const server = await start({ root: ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        const VERSION = await page.evaluate(() => EXERCISE_CONFIG_VERSION);

        // --- A custom-range verdict survives the switch to 0 ---------------------
        // The exercise runs a 7-9 range, then the Settings switch is set to 0.
        const older = flies(14, '200', '5', { repMin: 5, repMax: 8 });
        await setup(page, VERSION, [flies(7, '200', '6', { repMin: 7, repMax: 9 }), older],
            { increment: 2.5, repMin: 7, repMax: 9 });
        await changeIncrement(page, '0');
        eq(await readHistory(page), [null, null],
            '200 x 6 under a 7-9 range was a failed set, and stays one after the switch to 0');
        await setup(page, VERSION, [flies(7, '200', '6', { noRange: true }), older],
            { increment: 2.5, repMin: 7, repMax: 9 });
        await changeIncrement(page, '0');
        eq(await readHistory(page), ['PR', null], 'the same set logged with no range is a PR');

        // --- Backup and restore: the app's own Export, then Import -----------------
        const sets = [
            flies(7, '200', '3', { noRange: true }),
            flies(14, '200', '2', { noRange: true }),
            flies(21, '200', '4'),
        ];
        await setup(page, VERSION, sets);
        const backup = await exportBackup(page);
        await setup(page, VERSION, []);
        await importBackup(page, backup);
        const restored = (await readStore(page)).map(w => w.exercises.find(e => e.id === TARGET));
        eq(restored.map(e => [e.reps, e.noRange, e.repMin]),
            [['3', true, undefined], ['2', true, undefined], ['4', undefined, undefined]],
            'stamped sets keep noRange and the legacy set stays unstamped after restore');
        eq(await readHistory(page), ['PR', null, null],
            'restored verdicts: the stamped 3 beats the stamped 2; the legacy 4 is the baseline');

        eq(errors, [], 'no console errors');
        console.log('PASS: custom-range verdicts and backup restore at a PR increment of 0');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
