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
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { readDeckNames, activeName, goToCard, revealCard, logCard, todayWorkout, bottomNav } = require('../lib/deck');
const { seedPersonalApp, seedExerciseConfig, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const JM = 'triceps-elbow-extension-during-shoulder-flexion';      // JM Press
const SUP = 'biceps-wrist-supination';                              // Supinations
const TRICEPS = 'triceps-elbow-extension';                          // Tricep Extensions, right after Supinations

// Monday of last week plus `dayOffset` days; see case 100.
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
    await page.click('.settings-btn');
    await sleep(200);
    await page.evaluate(() => Array.from(document.querySelectorAll('.modal-btn'))
        .find(b => b.textContent.includes('Manage Exercises')).click());
    await sleep(300);
}

async function closeSettings(page) {
    for (const label of ['Back to Settings', 'Close']) {
        await page.evaluate((l) => {
            const b = Array.from(document.querySelectorAll('.modal-btn')).find(x => x.textContent.includes(l));
            if (b) b.click();
        }, label);
        await sleep(250);
    }
}

async function rowButton(page, id, label) {
    const clicked = await page.evaluate((sel, label) => {
        const btn = Array.from(document.querySelector(sel).querySelectorAll('button'))
            .find(b => b.textContent.trim() === label);
        if (!btn) return false;
        btn.click();
        return true;
    }, rowSel(id), label);
    ok(clicked, `clicked ${label} on ${id}`);
    await sleep(250);
}

const readSwitch = (page, id) => page.evaluate((sel) => {
    const box = document.querySelector(sel + ' input[data-field="enabled"]');
    return box ? box.checked : null;
}, rowSel(id));

async function setEnabled(page, id, on) {
    await page.evaluate((sel, on) => {
        const box = document.querySelector(sel + ' input[data-field="enabled"]');
        if (box.checked !== on) box.click();
    }, rowSel(id), on);
    await sleep(150);
}

// Toggle through the real form: pencil, switch, Save.
async function saveEnabled(page, id, on) {
    await rowButton(page, id, '✏️');
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

        const { roster, version } = await page.evaluate(() => ({
            roster: DEFAULT_EXERCISES.map(e => [e.id, e.name]),
            version: EXERCISE_CONFIG_VERSION,
        }));
        const allNames = roster.map(([, n]) => n);
        const nameOf = (id) => roster.find(([i]) => i === id)[1];

        // Last week's session, as the deck writes one: a row for every
        // exercise, blank where nothing was logged. JM Press was not logged;
        // Supinations was.
        const session = workoutEntry({
            date: lastWeek(0), day: 'full-body',
            exercises: roster.map(([id, name]) => ({
                id, name, category: 'Full Body', weight: '', reps: '',
                ...(id === SUP ? { weight: '40', reps: '5' } : {}),
            })),
        });
        await seedPersonalApp(page, { workoutHistory: [session] });
        await seedExerciseConfig(page, { version });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // === 1. The form ====================================================
        await openManageExercises(page);
        eq(await readSwitch(page, JM), null, 'no switch outside edit mode');
        await rowButton(page, JM, '✏️');
        eq(await readSwitch(page, JM), true, 'the switch opens on');
        await setEnabled(page, JM, false);
        await rowButton(page, JM, 'Cancel');
        eq('enabled' in (await readSaved(page)).byId[JM], false, 'Cancel writes nothing');

        await saveEnabled(page, JM, false);
        await saveEnabled(page, SUP, false);
        let saved = await readSaved(page);
        eq([saved.byId[JM].enabled, saved.byId[SUP].enabled], [false, false], 'Save writes enabled: false');
        eq(saved.version, version, 'stamped with the current EXERCISE_CONFIG_VERSION');
        eq(Object.values(saved.byId).filter(e => 'enabled' in e).map(e => e.id).sort(), [JM, SUP].sort(),
            'no other exercise gained the field');
        ok(await rowOpacity(page, JM) < 1, 'a disabled row is dimmed');
        eq(await rowOpacity(page, TRICEPS), 1, 'an enabled row is not');
        eq(await listNames(page), allNames, 'Manage Exercises still lists every exercise, in place');
        await rowButton(page, JM, '✏️');
        eq(await readSwitch(page, JM), false, 'and the form reopens off');
        await rowButton(page, JM, 'Cancel');
        await closeSettings(page);

        // === 2. The deck ====================================================
        const without = allNames.filter(n => n !== nameOf(JM) && n !== nameOf(SUP));
        eq(await readDeckNames(page), without, 'the deck drops the two disabled cards and keeps the order');

        // === 3. History =====================================================
        await bottomNav(page, 'History');
        await page.evaluate(() => {
            const prev = Array.from(document.querySelectorAll('.week-nav-btn'))
                .find(b => b.textContent.indexOf('Prev') !== -1);
            if (prev && !prev.disabled) prev.click();
        });
        await page.waitForSelector('.history-item', { timeout: 8000 });
        const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.history-exercise-name'))
            .map(e => e.textContent.trim()));
        ok(!rows.includes(nameOf(JM)), 'History hides a disabled row that was not logged');
        ok(rows.includes(nameOf(SUP)), 'and keeps a disabled row that was');
        eq(rows.length, roster.length - 1, 'every other row is still there');
        await bottomNav(page, 'Workout');

        // === 4. A day logged while they are off =============================
        await goToCard(page, nameOf(TRICEPS));
        await revealCard(page);
        await logCard(page);
        const today = await todayWorkout(page);
        ok(today && !today.exercises.some(e => e.id === JM || e.id === SUP),
            'today\'s session is saved without rows for the disabled exercises');

        // === 5. Re-enabling puts it back in the same spot ===================
        await openManageExercises(page);
        await saveEnabled(page, JM, true);
        await closeSettings(page);
        eq(await readDeckNames(page), allNames.filter(n => n !== nameOf(SUP)),
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
        // Supinations, off, sits right before Tricep Extensions. An index
        // counted over every exercise would reopen one card too far along.
        await seedPersonalApp(page, { workoutHistory: [] });
        await seedExerciseConfig(page, { version, overrides: { [SUP]: { enabled: false } } });
        await page.evaluate((ns, id) => localStorage.setItem(ns + 'exerciseStartTimes', JSON.stringify({
            date: new Date().toDateString(), times: { [id]: Date.now() - 60000 },
        })), NS, TRICEPS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await sleep(400);
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
