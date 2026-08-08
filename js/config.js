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
            'chest-press': '200',
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
            'hip-adduction': '240',
            'actual-leg-extensions': '100'
        };

        // Tracking mode: only one should be true at a time
        // SIMPLE_PR_TRACKING: if you hit 6 reps last session, bump weight and highlight green. No plateau buster.
        // ADVANCED_PR_TRACKING: full plateau buster + PR auto-regulation system
        const SIMPLE_PR_TRACKING = true;
        const ADVANCED_PR_TRACKING = false;

        // PR Auto-Regulation: Weight increments when you hit 6+ reps (top of 4-6 range)
        // 5 lbs where a 5 is the natural step — two-sided plate-loaded (= 2.5
        // per side per move) and pin stacks moved a full stack notch at a time.
        // 2.5 or 1.25 elsewhere; both are legal micro-plate steps.
        const PR_WEIGHT_INCREMENTS = {
            'curls-shoulder-extension': 1.25,
            'overhead-tricep-extensions': 1.25,
            'chest-flies': 1.25,
            'chest-press': 1.25,
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
            // 5 = exactly one pin-stack step, matching hip-adduction (Leg
            // Press) above. Was 1.25 — a legal micro-plate, but a finer step
            // than this machine warrants now that it is capped at 405.
            'calf-raise': 5,
            'ab-crunch': 1.25,
            'cable-wrist-curls': 1.25,
            'reverse-wrist-curls': 1.25,
            'actual-leg-extensions': 1.25
        };

        // Plate-loaded exercises configuration
        // Defines which exercises show the "Weight Breakdown" button
        // type: 'one-sided' or 'two-sided'
        // machineWeight: starting weight of the machine (usually 0 for plate-loaded)
        const PLATE_LOADED_EXERCISES = {
            'preacher-curls': { type: 'one-sided', machineWeight: 0 },
            // Back Extensions moved from a single-plate station to a two-side
            // plate-loaded one (Aug 2026), so the logged number is now the
            // total across both arms and the breakdown halves it. Its PR
            // increment was already 5 (= 2.5/side, the smallest real plate),
            // which is the correct two-sided step, so it needs no change.
            // This is the program's only two-sided plate-loaded movement now
            // that Leg Press is a pin stack — tests 26 and 28 both run their
            // per-side coverage against it for that reason.
            'leg-curls': { type: 'two-sided', machineWeight: 0 },
            'hammer-row': { type: 'one-sided', machineWeight: 0 },
            'upper-back-row': { type: 'one-sided', machineWeight: 0 },
            'kelso-shrugs': { type: 'one-sided', machineWeight: 0 }
        };

        // Pin-stack exercises configuration
        // These machines use weight stacks with 5 lb increments
        // Can add micro-plates (1.25, 2.5, or 3.75) on top of the pin
        // Value `true`         — plain pin stack, no cap (or cap not yet known)
        // Value `{ maxPin }`   — pin stack with a hard cap; weights above
        //   `maxPin` show "pin at max + plate breakdown" for the excess.
        //
        // There is no per-side notion here, unlike PLATE_LOADED_EXERCISES: a
        // stack is one stack, and the supplemental plates in overflow mode go
        // in one place on top of it. An `overflowPlateMode` field used to be
        // written alongside `maxPin`, but no code ever read it, so it was
        // dropped (Aug 2026) rather than wired up. If a capped machine ever
        // turns out to have two separate spots to hang overflow plates, that
        // is the point to reintroduce it — and calculatePinStackBreakdown in
        // plateauLogic.js is the only place that would need to change.
        const PIN_STACK_EXERCISES = {
            'curls-shoulder-extension': true,
            'overhead-tricep-extensions': true,
            'chest-flies': true,
            'chest-press': true,
            // Both moved off PLATE_LOADED_EXERCISES (were two-sided) in Aug
            // 2026 — the breakdown display changes, logged weights do not.
            // Their PR increments stay 2.5, a legal micro-plate step.
            'incline-chest-press': true,
            'shoulder-press': true,
            'tricep-pushdown': true,
            'lateral-raises': true,
            'frontal-pulldowns': true,
            'leg-extensions': true,
            'calf-raise': { maxPin: 405 },
            'ab-crunch': true,
            // Was capped at 97.5 until Aug 2026, when the user moved to a
            // different cable machine whose working weights are nowhere near
            // its ceiling. Back to `true`: the new stack's max is unknown and
            // does not matter until it's approached.
            'cable-wrist-curls': true,
            // Leg Press moved off PLATE_LOADED_EXERCISES (was two-sided) in Aug
            // 2026 — the gym's plate-loaded sled was replaced by a pin stack.
            // Its PR increment stays 5, which is exactly one stack step. Capped
            // at 390 (confirmed at the gym), so weights past that render the
            // "pin at max + plates" overflow rows. Calf Raises above is capped
            // too but at 405 — different machines, close numbers, do not
            // assume one from the other.
            'hip-adduction': { maxPin: 390 },
            'reverse-wrist-curls': true,
            'actual-leg-extensions': true
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
        // split as actually shipped, 5 adds Leg Extensions to Lower, and 6
        // drops Stairmaster off Lower. 6 is also what makes that drop reach a
        // saved config at all: the id-set check alone would catch it, but the
        // version is what guarantees it on a device that reloads mid-flight.
        // 7 adds Chest Press to Upper and moves Incline Chest Press up behind
        // Overhead Tricep Extensions — the move is a pure reorder, so 7 is the
        // only thing that carries it to a device that already has a config.
        // 8 moves Shoulder Press up behind Lateral Raises, likewise a pure
        // reorder that only the bump can deliver. 9 swaps Chest Press and
        // Incline Chest Press — same ids, same count, so the bump is the whole
        // delivery mechanism. 10 moves Leg Press up behind Leg Extensions on
        // Lower, another pure reorder that only the bump can deliver. 11 moves
        // Back Extensions up behind Cable Wrist Curls and Hip Adduction ahead
        // of Calf Raises — same ids, same count, so once again the bump is the
        // entire delivery mechanism.
        const EXERCISE_CONFIG_VERSION = 11;

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
            { id: 'incline-chest-press', name: 'Incline Chest Press',      category: 'Upper', day: 'upper', type: 'standard',    order: 1 },
            { id: 'curls-shoulder-extension', name: 'Recline Curls',       category: 'Upper', day: 'upper', type: 'standard',    order: 2 },
            { id: 'overhead-tricep-extensions', name: 'Overhead Tricep Extensions', category: 'Upper', day: 'upper', type: 'standard', order: 3 },
            // Genuinely new (Aug 2026). Takes the plain `chest-press` id — no
            // existing id was squatting on it, unlike the leg-extensions case
            // below, so there is no need for an `actual-` prefix here.
            { id: 'chest-press',         name: 'Chest Press',              category: 'Upper', day: 'upper', type: 'standard',    order: 4 },
            { id: 'lateral-raises',      name: 'Lateral Raises',           category: 'Upper', day: 'upper', type: 'standard',    order: 5 },
            { id: 'shoulder-press',      name: 'Shoulder Press',           category: 'Upper', day: 'upper', type: 'standard',    order: 6 },
            { id: 'frontal-pulldowns',   name: 'Frontal Plane Pulldowns',  category: 'Upper', day: 'upper', type: 'standard',    order: 7 },
            { id: 'upper-back-row',      name: 'Transverse Plane Rows',    category: 'Upper', day: 'upper', type: 'standard',    order: 8 },
            { id: 'kelso-shrugs',        name: 'Kelso Shrugs',             category: 'Upper', day: 'upper', type: 'standard',    order: 9 },
            { id: 'hammer-row',          name: 'Sagittal Plane Pulldowns', category: 'Upper', day: 'upper', type: 'standard',    order: 10 },
            { id: 'tricep-pushdown',     name: 'Tricep Extensions',        category: 'Upper', day: 'upper', type: 'standard',    order: 11 },
            { id: 'preacher-curls',      name: 'Preacher Curls',           category: 'Upper', day: 'upper', type: 'standard',    order: 12 },

            // --- Lower (Mon / Wed / Fri) ---
            { id: 'reverse-wrist-curls', name: 'Reverse Wrist Curls',      category: 'Lower', day: 'lower', type: 'standard',    order: 13 },
            { id: 'cable-wrist-curls',   name: 'Cable Wrist Curls',        category: 'Lower', day: 'lower', type: 'standard',    order: 14 },
            // Back Extensions moved up off the end of Lower to sit right behind
            // Cable Wrist Curls (Aug 2026). `leg-curls` is its frozen id — it
            // has not been a leg curl in a long time.
            { id: 'leg-curls',           name: 'Back Extensions',          category: 'Lower', day: 'lower', type: 'standard',    order: 15 },
            { id: 'ab-crunch',           name: 'Ab Crunches',              category: 'Lower', day: 'lower', type: 'standard',    order: 16 },
            // Genuinely new (Aug 2026) — NOT the `leg-extensions` id below,
            // which the split left rendering as Hip Adduction. There is no
            // history to inherit, so this takes a fresh id rather than
            // reclaiming one. `actual-` mirrors Jessi's `actual-preacher-curls`,
            // and the two apps deliberately share this one literal.
            { id: 'actual-leg-extensions', name: 'Leg Extensions',         category: 'Lower', day: 'lower', type: 'standard',    order: 17 },
            // Leg Press follows Leg Extensions as of Aug 2026 — the two share a
            // corner of the gym now that Leg Press is the pin-stack machine.
            // `hip-adduction` is its frozen id; the `leg-extensions` id below
            // is the one that renders as Hip Adduction. Neither name matches
            // its id and neither is safe to rename.
            { id: 'hip-adduction',       name: 'Leg Press',                category: 'Lower', day: 'lower', type: 'standard',    order: 18 },
            // Hip Adduction moved ahead of Calf Raises (Aug 2026), so Lower now
            // closes on Calf Raises instead of Back Extensions.
            { id: 'leg-extensions',      name: 'Hip Adduction',            category: 'Lower', day: 'lower', type: 'standard',    order: 19 },
            { id: 'calf-raise',          name: 'Calf Raises',              category: 'Lower', day: 'lower', type: 'standard',    order: 20 }
        ];

        // Retired from logging: `body-weight-squats`, `burpee-jump-tucks`, and
        // `assault-bike` (August 2026 Lower/Upper switch), and `stairmaster`
        // (dropped off Lower a few days later — it had been the lone 'Cardio'
        // category entry, so Lower no longer renders a Cardio heading at all).
        // Every rendering branch stays put — the stairmaster arms in
        // WorkoutView / EditWorkoutModal / WeeklyView / DayBreakdownModal,
        // getStairmasterSuggestion in plateauLogic, and the rep configs in
        // BODYWEIGHT_REP_DEFAULTS — because workout history still references
        // all four ids and must keep rendering and editing.

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
