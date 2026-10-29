// What this test covers
// ----------------------
// The Oct 2026 switch to new exercise ids (v25). Every movement took an id
// that describes it and that no earlier program used, and NOTHING was
// migrated: the 19 old ids retired with their history, the same way the wrist
// pair did in Sep 2026, and the new ids start from nothing. That is the whole
// design, chosen over rewriting history, so what this case pins is that the
// fresh start is fresh and that nothing old was touched:
//
//   - A v24 device reloads into the 19 new ids, in order, under the new names,
//     at version 25, every one pin-loaded, 2.5 lb steps, Gympin off and the
//     default rep range. The v24 customisations (1.25 steps, 4-8 ranges, a
//     Gympin left off) stay behind on the retired ids rather than carrying.
//   - Stored history is left exactly as it was, old ids, plateau busters and
//     names included.
//   - A never-logged card opens empty: no "Last:", a blank weight box, "—" for
//     the hero number and no breakdown. WEEK_1_DEFAULTS, the starting weights
//     that used to fill those, went in the same change.
//   - A card logged under a new id DOES read it back as "Last:", so the empty
//     cards are empty because their history is old, not because history broke.
//   - History still shows the old sessions under the names they were logged
//     with ("Shoulder Press 255lbs × 4", now that the row is Lu Raises).
//   - An old backup imported after the switch comes back on the new ids at the
//     next reload, with its history intact. No import code does that; it is
//     the ordinary reconcile retiring unknown ids.
//
// V24_CONFIG and OLD_SESSION are the state a device migrates FROM. Do not
// update them to the current roster; that would make this case assert nothing.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { workoutEntry } = require('../lib/state');
const { ACTIVE, readDeckNames, readDeckCard, bottomNav } = require('../lib/deck');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

// The expectation: the v25 roster in order.
const EXPECTED = [
    ['pecs-transverse-shoulder-adduction', 'Chest Flies'],
    ['pecs-transverse-shoulder-adduction-with-elbow-extension', 'Chest Press'],
    ['pecs-shoulder-flexion', 'Low to High Flies'],
    ['biceps-elbow-flexion-with-shoulder-extension', 'Recline Curls'],
    ['biceps-elbow-flexion-with-shoulder-flexion', 'Preacher Curls'],
    ['triceps-elbow-extension-with-shoulder-flexion', 'Overhead Tricep Extensions'],
    ['abs-spinal-flexion', 'Ab Crunches'],
    ['lats-sagittal-shoulder-extension', 'Sagittal Pulldowns'],
    ['delts-shoulder-abduction-stop-at-90-degrees', 'Lateral Raises'],
    ['lats-frontal-shoulder-adduction', 'Frontal Pulldowns'],
    ['triceps-elbow-extension', 'Tricep Extensions'],
    ['traps-scapular-retraction', 'Kelso Shrugs'],
    ['delts-transverse-shoulder-abduction-with-elbow-flexion', 'Transverse Rows'],
    ['delts-shoulder-abduction-above-90-degrees', 'Lu Raises'],
    ['erectors-spinal-extension', 'Back Extensions'],
    ['quads-knee-extension-during-hip-flexion', 'Squats'],
    ['adductors-transverse-hip-adduction', 'Hip Adduction'],
    ['calves-ankle-extension', 'Calf Raises'],
    ['quads-knee-extension', 'Leg Extensions'],
];

// The seed: a v24 device as it was the day before, with the user's real
// customisations on it.
const V24 = (id, name, loadType, extra = {}) =>
    ({ id, name, category: 'Full Body', day: 'full-body', type: 'standard', loadType, ...extra });
const V24_CONFIG = {
    version: 24,
    exercises: [
        V24('chest-flies', 'Chest Flies', 'pin'),
        V24('chest-press', 'Chest Press', 'pin'),
        V24('incline-chest-press', 'Low to High Flies', 'pin'),
        V24('curls-shoulder-extension', 'Recline Curls', 'pin', { increment: 1.25, repMin: 4, repMax: 8 }),
        V24('preacher-curls', 'Shoulder Flexion Curls', 'pin', { increment: 1.25, repMin: 4, repMax: 8 }),
        V24('overhead-tricep-extensions', 'Overhead Tricep Extensions', 'pin'),
        V24('ab-crunch', 'Ab Crunches', 'pin'),
        V24('hammer-row', 'Sagittal Plane Pullovers', 'pin'),
        V24('lateral-raises', 'Lateral Raises', 'pin', { gympin: false, stackMax: 100 }),
        V24('frontal-pulldowns', 'Frontal Plane Pulldowns', 'pin'),
        V24('tricep-pushdown', 'Tricep Extensions', 'pin'),
        V24('kelso-shrugs', 'Kelso Shrugs', 'plate-one-sided'),
        V24('upper-back-row', 'Transverse Plane Rows', 'plate-one-sided'),
        V24('shoulder-press', 'Shoulder Press', 'pin'),
        V24('leg-curls', 'Back Extensions', 'pin'),
        V24('hip-adduction', 'Leg Press', 'plate-two-sided'),
        V24('leg-extensions', 'Hip Adduction', 'pin'),
        V24('calf-raise', 'Calf Raises', 'pin', { increment: 2.5, gympin: false, stackMax: 405, repMin: 4, repMax: 8 }),
        V24('actual-leg-extensions', 'Leg Extensions', 'pin'),
    ].map((e, order) => ({ ...e, order })),
};

// Monday of last week plus `dayOffset` days; see case 100 for why History
// cases anchor to a Monday rather than counting back.
function lastWeek(dayOffset) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day) - 7 + dayOffset);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
}

// The seed's last old-id session.
const OLD_SESSION = workoutEntry({
    date: lastWeek(0), day: 'full-body', plateauBusters: ['shoulder-press', 'kelso-shrugs'],
    exercises: [
        { id: 'shoulder-press', name: 'Shoulder Press', weight: '255', reps: '4' },
        { id: 'hip-adduction', name: 'Leg Press', weight: '260', reps: '5' },
        { id: 'curls-shoulder-extension', name: 'Recline Curls', weight: '30', reps: '6' },
        { id: 'leg-extensions', name: 'Hip Adduction', weight: '230', reps: '5' },
    ],
});
// A later session already on the new ids: Lu Raises at 30, and Hip Adduction
// logged with the weight box still blank, which is what Log saves then.
const NEW_SESSION = workoutEntry({
    date: lastWeek(2), day: 'full-body',
    exercises: [
        { id: 'delts-shoulder-abduction-above-90-degrees', name: 'Lu Raises', weight: '30', reps: '5' },
        { id: 'adductors-transverse-hip-adduction', name: 'Hip Adduction', weight: '', reps: '5' },
    ],
});

// Same shape as case 60's: feed a backup to the real Settings file input.
async function importBackup(page, backup) {
    await page.click('.settings-btn');
    await new Promise(r => setTimeout(r, 250));
    const fed = await page.evaluate((json) => {
        const input = document.querySelector('input.file-input');
        if (!input) return 'no file input';
        const dt = new DataTransfer();
        dt.items.add(new File([json], 'gym-tracker-backup-2026-10-29.json', { type: 'application/json' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return 'ok';
    }, JSON.stringify(backup));
    eq(fed, 'ok', 'fed the backup to the Settings file input');
    await new Promise(r => setTimeout(r, 600));
    await page.evaluate(() => {
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) overlay.click();
    });
    await new Promise(r => setTimeout(r, 250));
}

const readStored = (page) => page.evaluate((ns) => ({
    config: JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig') || 'null'),
    history: JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]'),
}), NS);

// What a session holds apart from `week`, which the app restamps from the date
// on every load and has nothing to do with ids.
const content = (history) => history.map(({ week, ...w }) => w);

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        const seededHistory = [NEW_SESSION, OLD_SESSION];
        await page.evaluate((ns, config, hist) => {
            localStorage.setItem(ns + 'gymExerciseConfig', JSON.stringify(config));
            localStorage.setItem(ns + 'gymWorkoutHistory', JSON.stringify(hist));
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS, V24_CONFIG, seededHistory);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // --- The config: new ids, new names, plain defaults ---
        const { config, history } = await readStored(page);
        eq(config.version, 25, 'the reloaded config is at version 25');
        eq(config.exercises.map(e => [e.id, e.name]), EXPECTED,
            'the config holds exactly the 19 new ids, in order, under the new names');
        const settings = await page.evaluate((exercises) => exercises.map(e => [
            e.id, resolveLoadType(e), resolveIncrement(e), resolveGympin(e).on,
            JSON.stringify(getStandardRepRange(e.id)),
        ]), config.exercises);
        for (const [id, loadType, increment, gympin, range] of settings) {
            eq([loadType, increment, gympin, range], ['pin', 2.5, false, '{"min":3,"max":6}'],
                `${id} is pin-loaded, 2.5 lb steps, Gympin off, reps 4-6`);
        }
        eq(await page.evaluate(() => typeof WEEK_1_DEFAULTS), 'undefined',
            'the starting-weight table is gone');

        // --- History: untouched ---
        eq(content(history), content(seededHistory),
            'stored history is exactly as seeded: old ids, plateau busters and names');

        // --- The deck ---
        eq(await readDeckNames(page), EXPECTED.map(([, name]) => name),
            'the deck shows the 19 cards in order under the new names');

        for (const name of ['Squats', 'Recline Curls']) {
            const card = await readDeckCard(page, name);
            eq([card.last, card.weightValue, card.heroWeight, card.breakdown],
                ['', '', '', []],
                `${name} has no "Last:", a blank weight box, no hero number and no breakdown`);
        }
        eq(await page.evaluate((sel) =>
            Array.from(document.querySelectorAll(sel + ' select[data-field="reps"] option'))
                .map(o => o.value), ACTIVE), ['3', '4', '5', '6'],
            'Recline Curls is back on 4-6; the old 4-8 stayed on the retired id');

        // A blank-weight log renders the next session as blank too, not as a
        // broken card.
        const hip = await readDeckCard(page, 'Hip Adduction');
        eq([hip.weightValue, hip.breakdown], ['', []],
            `Hip Adduction after a blank-weight log: blank box, no breakdown (Last: "${hip.last}")`);

        const lu = await readDeckCard(page, 'Lu Raises');
        ok(/30/.test(lu.last) && !/255/.test(lu.last),
            `Lu Raises reads its new-id session as "Last:" and not Shoulder Press's 255 (got "${lu.last}")`);

        // --- History tab: old sessions under their logged names ---
        await bottomNav(page, 'History');
        await page.evaluate(() => {
            const prev = Array.from(document.querySelectorAll('.week-nav-btn'))
                .find(b => b.textContent.indexOf('Prev') !== -1);
            if (prev && !prev.disabled) prev.click();
        });
        await page.waitForSelector('.history-item', { timeout: 8000 });
        const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.history-exercise'))
            .map(r => r.querySelector('.history-exercise-name').textContent.trim() + ': ' +
                r.querySelector('.history-exercise-data').textContent.trim()));
        ok(rows.includes('Shoulder Press: 255lbs × 4'),
            `History still shows the old Shoulder Press session (rows: ${rows.join(' / ')})`);
        ok(rows.includes('Leg Press: 260lbs × 5'), 'History still shows the old Leg Press session');
        await bottomNav(page, 'Workout');

        // --- An old backup imported after the switch ---
        await importBackup(page, { workoutHistory: seededHistory, exerciseConfig: { exercises: V24_CONFIG.exercises } });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        const after = await readStored(page);
        eq(after.config.exercises.map(e => e.id), EXPECTED.map(([id]) => id),
            'an imported v24 backup comes back on the new ids after one reload');
        eq(content(after.history), content(seededHistory),
            'the imported history is kept as it was');

        eq(errors, [], 'no console errors');
        console.log('PASS: v25 starts every movement fresh on a new id and leaves history alone.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
