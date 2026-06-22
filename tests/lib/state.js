// Helpers to build realistic localStorage state for the gym apps inside
// puppeteer's page context. Each app uses a `namespace:key` scheme so we
// always pass the namespace explicitly.

// Default namespace for the test servers — both apps fall through to
// `gym-local:` when served from an unrecognized path.
const DEFAULT_NS = 'gym-local:';

// Seeds the personal app's localStorage with the given workout history
// and ensures the migration flag is unset so defaults reseed cleanly.
async function seedPersonalApp(page, { workoutHistory, ns = DEFAULT_NS } = {}) {
    await page.evaluate((ns, hist) => {
        if (hist) localStorage.setItem(ns + 'gymWorkoutHistory', JSON.stringify(hist));
        localStorage.removeItem(ns + 'gymExerciseConfig');
        localStorage.removeItem(ns + 'migratedToTorsoLimbs2');
        localStorage.removeItem(ns + 'migratedToFullBody');
    }, ns, workoutHistory || null);
}

// Seeds the public app's localStorage with a Jessi-shaped exerciseConfig,
// schedule, workout history, and clears the migration flag so the TL
// migration re-runs on next load.
async function seedPublicApp(page, { exerciseConfig, workoutHistory, schedule, ns = DEFAULT_NS } = {}) {
    await page.evaluate((ns, cfg, hist, sched) => {
        if (cfg)   localStorage.setItem(ns + 'gymExerciseConfig', JSON.stringify(cfg));
        if (hist)  localStorage.setItem(ns + 'gymWorkoutHistory', JSON.stringify(hist));
        if (sched) localStorage.setItem(ns + 'gymScheduleConfig', JSON.stringify(sched));
        // Bypass the new-user wizard.
        localStorage.setItem(ns + 'gymSetupCompleted', JSON.stringify({ version: 1, completed: true }));
        // Force the Jessi Full Body migration to re-run.
        localStorage.removeItem(ns + 'jessiFullBodyMigrationApplied1');
        localStorage.removeItem(ns + 'jessiTLMigrationApplied5');
        localStorage.removeItem(ns + 'jessiTLMigrationApplied4');
        localStorage.removeItem(ns + 'jessiTLMigrationApplied3');
        localStorage.removeItem(ns + 'jessiAPMigrationApplied');
        // Auto-enable of gympinMode for AP/TL/FB configs is its own one-shot.
        localStorage.removeItem(ns + 'jessiGympinEnabled');
    }, ns, exerciseConfig || null, workoutHistory || null, schedule || null);
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

// A standard Jessi-shaped config in the pre-this-revision Torso/Limbs state
// (ab-crunch on Torso, lateral-raises on Limbs). The TL migration should
// reshuffle this into the new layout.
function jessiPreMigrationConfig() {
    return {
        version: 2,
        categories: ['Torso', 'Limbs'],
        minimalistPrTracking: true,
        days: {
            1: [
                { id: 'jchest', name: 'Chest Flies',              category: 'Torso', order: 0, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jincl',  name: 'Incline Chest Press',      category: 'Torso', order: 1, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jsrow',  name: 'Seated Row',               category: 'Torso', order: 2, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jdip',   name: 'Weighted Dips',            category: 'Torso', order: 3, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jfront', name: 'Frontal Plane Pulldowns',  category: 'Torso', order: 4, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jubrow', name: 'Upper Back Row',           category: 'Torso', order: 5, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jkelso', name: 'Kelso Shrugs',             category: 'Torso', order: 6, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jsp',    name: 'Shoulder Press',           category: 'Torso', order: 7, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jab',    name: 'Ab Crunch',                category: 'Torso', order: 8, type: 'standard', minReps: 6, maxReps: 8 },
            ],
            2: [
                { id: 'jprea',  name: 'Preacher Curls',           category: 'Limbs', order: 0, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jtri',   name: 'Tricep Pushdown',          category: 'Limbs', order: 1, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jlat',   name: 'Lateral Raises',           category: 'Limbs', order: 2, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jrwc',   name: 'Reverse Wrist Curls',      category: 'Limbs', order: 3, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jcwc',   name: 'Cable Wrist Curls',        category: 'Limbs', order: 4, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jcalf',  name: 'Seated Calf Raise',        category: 'Limbs', order: 5, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jha',    name: 'Hip Adduction',            category: 'Limbs', order: 6, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jsld',   name: 'Stiff Legged Deadlifts',   category: 'Limbs', order: 7, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jpend',  name: 'Pendulum Squats',          category: 'Limbs', order: 8, type: 'standard', minReps: 6, maxReps: 8 },
            ],
        },
    };
}

// Jessi's actual 2026-06-09 backup shape: stale display names "Dips" and
// "Transverse Plane Rows" that don't match a naive name-based classifier.
// Earlier migration revisions silently dumped both into Limbs; this config
// is the regression fixture for that bug.
function jessiStaleNameConfig() {
    return {
        version: 2,
        categories: ['Torso', 'Limbs'],
        minimalistPrTracking: true,
        days: {
            1: [
                { id: 'jchest', name: 'Chest Flies',              category: 'Torso', order: 0, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jincl',  name: 'Incline Chest Press',      category: 'Torso', order: 1, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jlat',   name: 'Cable Lateral Raises',     category: 'Torso', order: 2, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jsag',   name: 'Sagittal Plane Pulldowns', category: 'Torso', order: 3, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jfront', name: 'Frontal Plane Pulldowns',  category: 'Torso', order: 4, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jkelso', name: 'Kelso Shrugs',             category: 'Torso', order: 5, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jsp',    name: 'Shoulder Press Machine',   category: 'Torso', order: 6, type: 'standard', minReps: 6, maxReps: 8 },
            ],
            2: [
                { id: 'jprea',  name: 'Preacher Curls',           category: 'Limbs', order: 0, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jtri',   name: 'Tricep Pushdown',          category: 'Limbs', order: 1, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jrwc',   name: 'Reverse Wrist Curls',      category: 'Limbs', order: 2, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jcwc',   name: 'Cable Wrist Curls',        category: 'Limbs', order: 3, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jab',    name: 'Ab Crunch Machine',        category: 'Limbs', order: 4, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jcalf',  name: 'Calf Raises',              category: 'Limbs', order: 5, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jleg',   name: 'Leg Extensions',           category: 'Limbs', order: 6, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jsld',   name: 'Stiff Legged Deadlifts',   category: 'Limbs', order: 7, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jpend',  name: 'Pendulum Squats',          category: 'Limbs', order: 8, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jdip',   name: 'Dips',                     category: 'Limbs', order: 9, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'jtrow',  name: 'Transverse Plane Rows',    category: 'Limbs', order: 10, type: 'standard', minReps: 6, maxReps: 8 },
            ],
        },
    };
}

function jessiDefaultSchedule() {
    return {
        version: 2,
        workoutDays: [
            { dayOfWeek: 'Monday',    workoutDayNumber: 1 },
            { dayOfWeek: 'Wednesday', workoutDayNumber: 2 },
            { dayOfWeek: 'Friday',    workoutDayNumber: 1 },
            { dayOfWeek: 'Saturday',  workoutDayNumber: 2 },
        ],
        totalWorkoutDays: 2,
    };
}

module.exports = {
    DEFAULT_NS,
    seedPersonalApp,
    seedPublicApp,
    workoutEntry,
    jessiPreMigrationConfig,
    jessiStaleNameConfig,
    jessiDefaultSchedule,
};
