// Helpers to build realistic localStorage state for the app inside
// puppeteer's page context. The app uses a `namespace:key` scheme so we
// always pass the namespace explicitly. (The public app's seeds and Jessi
// configs moved to public-gym-app's tests/ in Oct 2026.)

// Default namespace for the test servers — the app falls through to
// `gym-local:` when served from an unrecognized path.
const DEFAULT_NS = 'gym-local:';

// Seeds the personal app's localStorage with the given workout history and
// clears any saved exerciseConfig, so the load reseeds from defaults.
async function seedPersonalApp(page, { workoutHistory, ns = DEFAULT_NS } = {}) {
    await page.evaluate((ns, hist) => {
        if (hist) localStorage.setItem(ns + 'gymWorkoutHistory', JSON.stringify(hist));
        localStorage.removeItem(ns + 'gymExerciseConfig');
    }, ns, workoutHistory || null);
}

// Seeds a SAVED personal-app exerciseConfig — the state a device that has
// already run the app is in, as opposed to seedPersonalApp's fresh install.
//
// `overrides` maps exercise id -> a partial entry merged over the default, so a
// case can say `{ 'chest-flies': { loadType: 'plate-two-sided' } }` without
// rebuilding all 21. Pass `version: undefined` deliberately to model an
// imported backup, which App.jsx saves with no version at all.
//
// lastBackupReminder keeps the monthly reminder modal from covering the UI.
// (This used to plant a `migratedToFullBody2` sentinel too, to dodge a one-shot
// config wipe in App.jsx. The wipe was removed in v22.)
async function seedExerciseConfig(page, { overrides = {}, version, dropFields = [], ns = DEFAULT_NS } = {}) {
    return page.evaluate((ns, overrides, version, dropFields) => {
        const exercises = DEFAULT_EXERCISES.map(ex => {
            const merged = { ...ex, ...(overrides[ex.id] || {}) };
            for (const f of dropFields) delete merged[f];
            return merged;
        });
        const config = { exercises };
        if (version !== null && version !== undefined) config.version = version;
        localStorage.setItem(ns + 'gymExerciseConfig', JSON.stringify(config));
        localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        return config.exercises.length;
    }, ns, overrides, version === undefined ? null : version, dropFields);
}

// Builds a workout-history entry with sane defaults. Pass `exercises` as
// an array of {id, name, weight, reps, ...optional minReps/maxReps}.
function workoutEntry({ date, day, submitted = true, exercises, plateauBusters = [] }) {
    return {
        date,
        day,
        submitted,
        week: 1,
        plateauBusters,
        exercises: exercises.map(ex => ({
            type: 'standard',
            minReps: 6,
            maxReps: 8,
            ...ex,
        })),
    };
}

module.exports = {
    DEFAULT_NS,
    seedPersonalApp,
    seedExerciseConfig,
    workoutEntry,
};
