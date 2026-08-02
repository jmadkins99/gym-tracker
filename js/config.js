        // Week 1 default weights
        const WEEK_1_DEFAULTS = {
            'curls-shoulder-extension': '25',
            'overhead-tricep-extensions': '47.5',
            'lateral-raises': '27.5',
            'reverse-wrist-curls': '30',
            'cable-wrist-curls': '90',
            'preacher-curls': '56.25',
            'tricep-pushdown': '36.25',
            'chest-flies': '165',
            'incline-chest-press': '110',
            'hammer-row': '117.5',
            'frontal-pulldowns': '180',
            'upper-back-row': '190',
            'kelso-shrugs': '190',
            'shoulder-press': '126.25',
            'ab-crunch': '140',
            'calf-raise': '180',
            'leg-extensions': '120',
            'leg-curls': '150',
            'hip-adduction': '240'
        };

        // Tracking mode: only one should be true at a time
        // SIMPLE_PR_TRACKING: if you hit 6 reps last session, bump weight and highlight green. No plateau buster.
        // ADVANCED_PR_TRACKING: full plateau buster + PR auto-regulation system
        const SIMPLE_PR_TRACKING = true;
        const ADVANCED_PR_TRACKING = false;

        // PR Auto-Regulation: Weight increments when you hit 6+ reps (top of 4-6 range)
        // 5 lbs for two-sided plate-loaded (= 2.5/side per move); 2.5 lbs for everything else.
        const PR_WEIGHT_INCREMENTS = {
            'curls-shoulder-extension': 1.25,
            'overhead-tricep-extensions': 1.25,
            'chest-flies': 1.25,
            'incline-chest-press': 2.5,
            'leg-curls': 5,
            'shoulder-press': 2.5,
            'preacher-curls': 1.25,
            'tricep-pushdown': 1.25,
            'lateral-raises': 1.25,
            'frontal-pulldowns': 1.25,
            'upper-back-row': 1.25,
            'kelso-shrugs': 1.25,
            'hammer-row': 1.25,
            'leg-extensions': 1.25,
            'hip-adduction': 5,
            'calf-raise': 1.25,
            'ab-crunch': 1.25,
            'cable-wrist-curls': 1.25,
            'reverse-wrist-curls': 1.25
        };

        // Plate-loaded exercises configuration
        // Defines which exercises show the "Weight Breakdown" button
        // type: 'one-sided' or 'two-sided'
        // machineWeight: starting weight of the machine (usually 0 for plate-loaded)
        const PLATE_LOADED_EXERCISES = {
            'preacher-curls': { type: 'one-sided', machineWeight: 0 },
            'leg-curls': { type: 'one-sided', machineWeight: 0 },
            'hip-adduction': { type: 'two-sided', machineWeight: 0 },
            'incline-chest-press': { type: 'two-sided', machineWeight: 0 },
            'hammer-row': { type: 'one-sided', machineWeight: 0 },
            'upper-back-row': { type: 'one-sided', machineWeight: 0 },
            'kelso-shrugs': { type: 'one-sided', machineWeight: 0 },
            'shoulder-press': { type: 'two-sided', machineWeight: 0 }
        };

        // Pin-stack exercises configuration
        // These machines use weight stacks with 5 lb increments
        // Can add micro-plates (1.25, 2.5, or 3.75) on top of the pin
        // Value `true`     — plain pin stack, no cap
        // Value `{ maxPin, overflowPlateMode }` — pin stack with a hard cap;
        //   weights above `maxPin` show "pin at max + plate breakdown" for the
        //   excess. overflowPlateMode is 'one-sided' or 'two-sided'.
        const PIN_STACK_EXERCISES = {
            'curls-shoulder-extension': true,
            'overhead-tricep-extensions': true,
            'chest-flies': true,
            'tricep-pushdown': true,
            'lateral-raises': true,
            'frontal-pulldowns': true,
            'leg-extensions': true,
            'calf-raise': true,
            'ab-crunch': true,
            'cable-wrist-curls': { maxPin: 97.5, overflowPlateMode: 'one-sided' },
            'reverse-wrist-curls': true
        };

        // Bump to push a code-side reorder (or a newly added/removed exercise)
        // out to devices that already have a saved config. migrateExerciseConfig
        // otherwise short-circuits when the id set is unchanged, so a *pure*
        // reorder would silently never reach anyone. Renames are NOT pushed:
        // the migration always preserves the user's own display names by id.
        // Bump on EVERY code-side reorder, including ones that have not shipped
        // yet. It is tempting to reuse an unreleased number while iterating on
        // an order, but any device that already loaded the intermediate build —
        // a localhost test browser counts — has saved a config stamped with it,
        // and the guard above then reads that stale order as current and leaves
        // it alone. Version 3 was burned that way; 4 is the Aug 2026 Upper/Lower
        // split as actually shipped.
        const EXERCISE_CONFIG_VERSION = 4;

        // Display names here are the defaults a fresh install sees. They mirror
        // the names in use as of August 2026; ids are frozen because workout
        // history references them.
        //
        // `day` is which half of the Upper/Lower split the exercise belongs to
        // (August 2026; replaced the single Full Body list + separate Cardio
        // day). getCurrentExercises filters on it, so it is what decides which
        // cards a session shows. Keep each day's entries contiguous and `order`
        // a dense 0..N run: moveExercise reindexes off it and the load-time
        // sort is a plain numeric sort over the flat list.
        //
        // Upper comes first here, matching the day toggle and the Settings
        // list. All three orderings are independent — keep them in step.
        const DEFAULT_EXERCISES = [
            // --- Upper (Tue / Thu / Sat, and Sun by default) ---
            { id: 'chest-flies',         name: 'Chest Flies',              category: 'Upper', day: 'upper', type: 'standard',    order: 0 },
            { id: 'curls-shoulder-extension', name: 'Recline Curls',       category: 'Upper', day: 'upper', type: 'standard',    order: 1 },
            { id: 'overhead-tricep-extensions', name: 'Overhead Tricep Extensions', category: 'Upper', day: 'upper', type: 'standard', order: 2 },
            { id: 'lateral-raises',      name: 'Lateral Raises',           category: 'Upper', day: 'upper', type: 'standard',    order: 3 },
            { id: 'frontal-pulldowns',   name: 'Frontal Plane Pulldowns',  category: 'Upper', day: 'upper', type: 'standard',    order: 4 },
            { id: 'incline-chest-press', name: 'Incline Chest Press',      category: 'Upper', day: 'upper', type: 'standard',    order: 5 },
            { id: 'shoulder-press',      name: 'Shoulder Press',           category: 'Upper', day: 'upper', type: 'standard',    order: 6 },
            { id: 'upper-back-row',      name: 'Transverse Plane Rows',    category: 'Upper', day: 'upper', type: 'standard',    order: 7 },
            { id: 'kelso-shrugs',        name: 'Kelso Shrugs',             category: 'Upper', day: 'upper', type: 'standard',    order: 8 },
            { id: 'hammer-row',          name: 'Sagittal Plane Pulldowns', category: 'Upper', day: 'upper', type: 'standard',    order: 9 },
            { id: 'tricep-pushdown',     name: 'Tricep Extensions',        category: 'Upper', day: 'upper', type: 'standard',    order: 10 },
            { id: 'preacher-curls',      name: 'Preacher Curls',           category: 'Upper', day: 'upper', type: 'standard',    order: 11 },

            // --- Lower (Mon / Wed / Fri) ---
            { id: 'reverse-wrist-curls', name: 'Reverse Wrist Curls',      category: 'Lower', day: 'lower', type: 'standard',    order: 12 },
            { id: 'cable-wrist-curls',   name: 'Cable Wrist Curls',        category: 'Lower', day: 'lower', type: 'standard',    order: 13 },
            { id: 'ab-crunch',           name: 'Ab Crunches',              category: 'Lower', day: 'lower', type: 'standard',    order: 14 },
            { id: 'calf-raise',          name: 'Calf Raises',              category: 'Lower', day: 'lower', type: 'standard',    order: 15 },
            { id: 'leg-extensions',      name: 'Hip Adduction',            category: 'Lower', day: 'lower', type: 'standard',    order: 16 },
            { id: 'leg-curls',           name: 'Back Extensions',          category: 'Lower', day: 'lower', type: 'standard',    order: 17 },
            { id: 'hip-adduction',       name: 'Leg Press',                category: 'Lower', day: 'lower', type: 'standard',    order: 18 },
            // Category 'Cardio' is what puts this under its own heading at the
            // bottom of the day; it also keeps it out of the PR count.
            { id: 'stairmaster',         name: 'Stairmaster',              category: 'Cardio', day: 'lower', type: 'stairmaster', order: 19 }
        ];

        // Retired with the August 2026 Lower/Upper switch: `body-weight-squats`,
        // `burpee-jump-tucks`, and `assault-bike` are no longer loggable, and
        // Stairmaster moved into DEFAULT_EXERCISES above. Their rendering
        // branches stay in WorkoutView / EditWorkoutModal and their rep configs
        // stay in BODYWEIGHT_REP_DEFAULTS, because workout history still
        // references all four ids and must keep rendering and editing.

        // Which weekdays default to the Lower card (Date.getDay(): Sun=0 … Sat=6).
        // Mon/Wed/Fri are Lower; every other day — Tue/Thu/Sat, plus Sunday —
        // defaults to Upper. A manual toggle overrides for the session only.
        const LOWER_DAYS = [1, 3, 5];

        // Bodyweight rep config, keyed by exercise id. Reps carry over from the
        // last session (no progression); the field is a dropdown over [min, max]
        // stepped by `step`. firstSession (= min) is used when there's no history.
        const BODYWEIGHT_REP_DEFAULTS = {
            'body-weight-squats': { firstSession: 50, min: 50, max: 500, step: 5 },
            'burpee-jump-tucks':  { firstSession: 10, min: 10, max: 50,  step: 1 }
        };
