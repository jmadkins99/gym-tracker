// What this test covers
// ----------------------
// The Enabled switch in Settings > Manage Exercises (Oct 2026): a per-exercise
// on/off in the pencil form, committed by Save and undone by Cancel, that
// takes an exercise off the workout without touching its place in the order
// or anything already logged.
//
//   - The form opens on, Cancel writes nothing, Save writes `enabled: false`
//     to that one exercise, stamped with the config version, and the row
//     dims in place in the list.
//   - The deck drops the disabled cards and keeps every other card in order;
//     the Manage Exercises list keeps all of them, so they can still be moved.
//   - A day logged while they are off is saved without rows for them.
//   - History hides a disabled exercise's row on a session where it was not
//     logged, and still shows it where it was: nothing logged is ever hidden.
//   - Re-enabling puts the card back in the same spot.
//   - The answer survives a version bump (it is user-owned, like loadType),
//     and a reload reopens the right card when a disabled one sits before it.
//
// To verify this test is real: drop the `enabled` line from the result.push in
// migrateExerciseConfig. The version-bump half fails with JM Press back on.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, waitFor, tap } = require('../lib/browser');
const { readDeckNames, activeName, goToCard, revealCard, logCard, todayWorkout, bottomNav } = require('../lib/deck');
const { seedPersonalApp, seedExerciseConfig, workoutEntry } = require('../lib/state');
const { HISTORY_CARD, historyGoTo } = require('../lib/history');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

const JM = 'triceps-elbow-extension-during-shoulder-flexion';      // JM Press
// Both subjects are on Anterior, the day a load with no Anterior or Posterior
// history opens on, so the deck half never has to switch day. Chest Press took
// over from Supinations when v28 (Nov 2026) put Supinations on Posterior.
const CP = 'pecs-transverse-shoulder-adduction-with-elbow-extension'; // Chest Press
const TRICEPS = 'triceps-elbow-extension';                          // Tricep Extensions, right after Chest Press

// Monday of last week plus `dayOffset` days; see case 100 for why.
function lastWeek(dayOffset) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day) - 7 + dayOffset);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
}

const rowSel = (id) => `.exercise-row[data-exercise-id="${id}"]`;

async function openManageExercises(page) {
    await tap(page, '.settings-btn');
    await tap(page, '.modal-btn', { text: /Manage Exercises/ });
    await waitFor(page, 'the exercise rows',
        () => document.querySelectorAll('.exercise-row').length > 0);
}

async function closeSettings(page) {
    await tap(page, '.modal-btn', { text: /Back to Settings/ });
    await tap(page, '.modal-btn', { text: 'Close' });
    await waitFor(page, 'Settings to close', () => !document.querySelector('.modal'));
}

// Edit swaps the row's Edit button for Save and Cancel, and either of those
// swaps it back, so the press has landed once the other button shows.
async function rowButton(page, id, label) {
    const next = label === 'Edit' ? 'Save' : 'Edit';
    await tap(page, rowSel(id) + ' button', { text: label });
    await waitFor(page, `${label} on ${id} to show its ${next} button`, (sel, next) =>
        Array.from(document.querySelectorAll(sel + ' button'))
            .some(b => b.textContent.trim() === next), rowSel(id), next);
}

const readSwitch = (page, id) => page.evaluate((sel) => {
    const box = document.querySelector(sel + ' input[data-field="enabled"]');
    return box ? box.checked : null;
}, rowSel(id));

// The checkbox itself is 0x0; a finger hits the track drawn right after it.
async function setEnabled(page, id, on) {
    const box = rowSel(id) + ' input[data-field="enabled"]';
    if (await page.$eval(box, (b) => b.checked) !== on) await tap(page, box + ' + .switch-track');
    await waitFor(page, `the Enabled switch on ${id} to read ${on ? 'on' : 'off'}`,
        (sel, on) => document.querySelector(sel).checked === on, box, on);
}

// Toggle through the real form: pencil, switch, Save.
async function saveEnabled(page, id, on) {
    await rowButton(page, id, 'Edit');
    await setEnabled(page, id, on);
    await rowButton(page, id, 'Save');
}

const rowOpacity = (page, id) => page.evaluate((sel) =>
    Number(getComputedStyle(document.querySelector(sel)).opacity), rowSel(id));

const readSaved = (page) => page.evaluate((ns) => {
    const cfg = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig'));
    return { version: cfg.version, byId: Object.fromEntries(cfg.exercises.map(e => [e.id, e])) };
}, NS);

const listNames = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('.modal .exercise-row'))
        .map(r => r.querySelector('.exercise-row-name').textContent.trim()));

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        const { roster, version, anteriorNames } = await page.evaluate(() => ({
            roster: DEFAULT_EXERCISES.map(e => [e.id, e.name]),
            version: EXERCISE_CONFIG_VERSION,
            anteriorNames: DEFAULT_EXERCISES.filter(e => e.day === 'anterior-2').map(e => e.name),
        }));
        const allNames = roster.map(([, n]) => n);
        const nameOf = (id) => roster.find(([i]) => i === id)[1];

        // Last week's session, as the deck writes one: a row for every
        // exercise, blank where nothing was logged. JM Press was not logged;
        // Chest Press was.
        const session = workoutEntry({
            date: lastWeek(0), day: 'full-body',
            exercises: roster.map(([id, name]) => ({
                id, name, category: 'Full Body', weight: '', reps: '',
                ...(id === CP ? { weight: '150', reps: '5' } : {}),
            })),
        });
        await seedPersonalApp(page, { workoutHistory: [session] });
        await seedExerciseConfig(page, { version });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // === 1. The form ====================================================
        await openManageExercises(page);
        eq(await readSwitch(page, JM), null, 'no switch outside edit mode');
        await rowButton(page, JM, 'Edit');
        eq(await readSwitch(page, JM), true, 'the switch opens on');
        await setEnabled(page, JM, false);
        await rowButton(page, JM, 'Cancel');
        eq('enabled' in (await readSaved(page)).byId[JM], false, 'Cancel writes nothing');

        await saveEnabled(page, JM, false);
        await saveEnabled(page, CP, false);
        let saved = await readSaved(page);
        eq([saved.byId[JM].enabled, saved.byId[CP].enabled], [false, false], 'Save writes enabled: false');
        eq(saved.version, version, 'stamped with the current EXERCISE_CONFIG_VERSION');
        eq(Object.values(saved.byId).filter(e => 'enabled' in e).map(e => e.id).sort(), [JM, CP].sort(),
            'no other exercise gained the field');
        ok(await rowOpacity(page, JM) < 1, 'a disabled row is dimmed');
        eq(await rowOpacity(page, TRICEPS), 1, 'an enabled row is not');
        eq(await listNames(page), allNames, 'Manage Exercises still lists every exercise, in place');
        await rowButton(page, JM, 'Edit');
        eq(await readSwitch(page, JM), false, 'and the form reopens off');
        await rowButton(page, JM, 'Cancel');
        await closeSettings(page);

        // === 2. The deck ====================================================
        const without = anteriorNames.filter(n => n !== nameOf(JM) && n !== nameOf(CP));
        eq(await readDeckNames(page), without, 'the deck drops the two disabled cards and keeps the order');

        // === 3. History =====================================================
        await bottomNav(page, 'History');
        await historyGoTo(page, session.date);
        const rows = await page.evaluate((card) => Array.from(document.querySelectorAll(card + ' .history-exercise-name'))
            .map(e => e.textContent.trim()), HISTORY_CARD);
        ok(!rows.includes(nameOf(JM)), 'History hides a disabled row that was not logged');
        ok(rows.includes(nameOf(CP)), 'and keeps a disabled row that was');
        eq(rows.length, roster.length - 1, 'every other row is still there');
        await bottomNav(page, 'Workout');

        // === 4. A day logged while they are off =============================
        await goToCard(page, nameOf(TRICEPS));
        await revealCard(page);
        await logCard(page);
        const today = await todayWorkout(page);
        ok(today && !today.exercises.some(e => e.id === JM || e.id === CP),
            'today\'s session is saved without rows for the disabled exercises');

        // === 5. Re-enabling puts it back in the same spot ===================
        await openManageExercises(page);
        await saveEnabled(page, JM, true);
        await closeSettings(page);
        eq(await readDeckNames(page), anteriorNames.filter(n => n !== nameOf(CP)),
            'JM Press is back on the deck where it was');

        // === 6. It survives a version bump ==================================
        await seedPersonalApp(page, { workoutHistory: [] });
        await seedExerciseConfig(page, { version: version - 1, overrides: { [JM]: { enabled: false } } });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        saved = await readSaved(page);
        eq(saved.version, version, 'the bump ran');
        eq(saved.byId[JM].enabled, false, 'and JM Press is still off after it');

        // === 7. Reopening the open card counts enabled cards only ==========
        // Chest Press, off, sits right before Tricep Extensions. An index
        // counted over every exercise would reopen one card too far along.
        await seedPersonalApp(page, { workoutHistory: [] });
        await seedExerciseConfig(page, { version, overrides: { [CP]: { enabled: false } } });
        await page.evaluate((ns, id) => localStorage.setItem(ns + 'exerciseStartTimes', JSON.stringify({
            date: new Date().toDateString(), times: { [id]: Date.now() - 60000 },
        })), NS, TRICEPS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        eq(await activeName(page), nameOf(TRICEPS), 'a reload reopens Tricep Extensions, not the card after it');

        eq(errors, [], 'no console errors');
        console.log('PASS: the Enabled switch hides a card in place, never hides logged data, and survives a bump.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
