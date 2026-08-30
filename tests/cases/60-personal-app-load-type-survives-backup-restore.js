// What this test covers
// ----------------------
// Restoring a backup, driven through the real file input in Settings, and what
// happens to loadType on the way through.
//
// Import is a sharper path than it looks. App.jsx's importData saves the
// restored config with NO version key:
//
//     window.repo.saveExerciseConfig({ exercises: sorted });
//
// so every import is a guaranteed trip through migrateExerciseConfig on the
// next load — the exact rebuild that case 59 covers, reached without anyone
// bumping anything. No other case drives this input at all.
//
// It also opens a window that only exists here: between the import landing and
// the next reload, `exercises` in React state is whatever was in the file. A
// backup written before v15 has no loadType on any entry, so for that session
// every exercise's setting is undefined. resolveLoadType in config.js is what
// covers it, falling back to the code seed by id; without it the breakdown
// renders empty for the rest of the session. The pre-reload assertions below
// are the pin on that, and they are the reason this case reads the breakdown
// before reloading rather than after.
//
// Backup shape mirrors App.jsx's exportData:
//   { workoutHistory, exerciseConfig: { exercises }, exportDate }
//
// To verify this test is real: revert the migrations.js preservation line and
// the second half fails; make WorkoutView read exercise.loadType directly
// instead of resolveLoadType(exercise) and the pre-reload half fails.

const path = require('path');
const fs = require('fs');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { setWeightAndOpen } = require('../lib/deck');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

function extractLiteral(source, name, open, close) {
    const start = source.indexOf(`const ${name} =`);
    if (start === -1) throw new Error(`could not find ${name} in config.js`);
    const openIdx = source.indexOf(open, start);
    const closeIdx = source.indexOf(close + ';', openIdx);
    return new Function(`return ${source.slice(openIdx, closeIdx + 1)}`)();
}

function currentConfigVersion(src) {
    const m = src.match(/const EXERCISE_CONFIG_VERSION\s*=\s*(\d+)/);
    if (!m) throw new Error('could not find EXERCISE_CONFIG_VERSION in config.js');
    return Number(m[1]);
}

// Feeds a JSON string to the real <input class="file-input"> that
// SettingsModal renders, the way a user picking a file would. Built in-page
// with DataTransfer so the backup lives next to the assertions that read it
// rather than in a committed fixture.
async function importBackup(page, backup) {
    await page.click('.settings-btn');
    await new Promise(r => setTimeout(r, 250));
    const fed = await page.evaluate((json) => {
        const input = document.querySelector('input.file-input');
        if (!input) return 'no file input';
        const dt = new DataTransfer();
        dt.items.add(new File([json], 'gym-tracker-backup-2026-08-27.json',
            { type: 'application/json' }));
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return 'ok';
    }, JSON.stringify(backup));
    eq(fed, 'ok', 'fed the backup to the Settings file input');
    // importData reads the file through FileReader.onload, so the state update
    // lands a tick or two after the event.
    await new Promise(r => setTimeout(r, 600));
    // Dismiss the modal if it is still up.
    await page.evaluate(() => {
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) overlay.click();
    });
    await new Promise(r => setTimeout(r, 250));
}

// Navigate to a card, open it, set the weight, and return its warmup rows.
// The breakdown moved onto the card's revealed face, so there is no button.
async function readBreakdownText(page, name, weight) {
    return setWeightAndOpen(page, name, weight);
}

async function readSavedLoadTypes(page) {
    return page.evaluate((ns) => {
        const raw = localStorage.getItem(ns + 'gymExerciseConfig');
        if (!raw) return null;
        const cfg = JSON.parse(raw);
        return {
            version: cfg.version,
            loadTypeById: Object.fromEntries(
                (cfg.exercises || []).map(e => [e.id, e.loadType])),
        };
    }, NS);
}

(async () => {
    const configSrc = fs.readFileSync(
        path.join(PERSONAL_APP_ROOT, 'js', 'config.js'), 'utf8');
    const DEFAULT_EXERCISES = extractLiteral(configSrc, 'DEFAULT_EXERCISES', '[', ']');
    const VERSION = currentConfigVersion(configSrc);
    const seededById = Object.fromEntries(DEFAULT_EXERCISES.map(e => [e.id, e.loadType]));

    // A current-shape backup carrying an override.
    const withOverride = {
        workoutHistory: [],
        exerciseConfig: {
            exercises: DEFAULT_EXERCISES.map(ex => (
                ex.id === 'chest-flies' ? { ...ex, loadType: 'plate-two-sided' } : { ...ex }
            )),
        },
        exportDate: new Date().toISOString(),
    };

    // A pre-v15 backup: no loadType on any entry, exactly what exportData
    // produced before this feature shipped.
    const preV15 = {
        workoutHistory: [],
        exerciseConfig: {
            exercises: DEFAULT_EXERCISES.map(({ loadType, ...rest }) => rest),
        },
        exportDate: '2026-06-30T00:00:00.000Z',
    };
    ok(preV15.exerciseConfig.exercises.every(e => e.loadType === undefined),
        'the old-shape backup genuinely carries no loadType');

    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // === Half 1: a backup carrying an override =========================
        await importBackup(page, withOverride);
        await selectDayType(page, 'anterior');

        // Before any reload: the imported override is live immediately.
        let text = await readBreakdownText(page, 'Chest Flies', '200');
        contains(text, '70/side',
            'the imported override renders immediately, before any reload');

        // Import writes without a version, so the next load rebuilds. The
        // override has to come through that rebuild.
        const afterImport = await readSavedLoadTypes(page);
        eq(afterImport.version, undefined,
            'importData saves the config with no version — this is what forces the rebuild');

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        const afterReload = await readSavedLoadTypes(page);
        eq(afterReload.version, VERSION,
            'the reload ran the migration and stamped the current version');
        eq(afterReload.loadTypeById['chest-flies'], 'plate-two-sided',
            'the restored override survived the post-import rebuild');

        // === Half 2: a backup from before the field existed ================
        await importBackup(page, preV15);
        await selectDayType(page, 'anterior');

        // This is the resolveLoadType window: state holds entries with no
        // loadType at all, and the breakdown must still render its seeded shape
        // rather than a blank panel.
        text = await readBreakdownText(page, 'Chest Flies', '200');
        contains(text, '140 lbs',
            'a pre-v15 import falls back to the seeded pin shape, not an empty panel');
        ok(text.indexOf('/side') === -1,
            'and it is genuinely the pin branch, not a stale two-sided render');

        text = await readBreakdownText(page, 'Leg Press', '240');
        contains(text, '/side',
            'a seeded two-sided machine still renders two-sided after a pre-v15 import');

        // Calf Raises keeps its cap through all of this — caps are code-side.
        await selectDayType(page, 'posterior');
        text = await readBreakdownText(page, 'Calf Raises', '500');
        contains(text, 'pin 405',
            'the 405 cap still applies after a pre-v15 restore');

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        const restored = await readSavedLoadTypes(page);
        const missing = Object.entries(restored.loadTypeById)
            .filter(([id, lt]) => lt !== seededById[id])
            .map(([id, lt]) => `${id}: ${lt} (expected seed ${seededById[id]})`);
        eq(missing, [],
            'after the reload every exercise carries its seeded load type again');

        eq(errors, [], 'no console errors');
        console.log('PASS: load type survives a backup restore, old backups included');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
