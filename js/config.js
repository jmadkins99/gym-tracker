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

        // Streaks: the positive counterpart to the "Plateau Detected" hint. Counts
        // consecutive improvements — sessions that moved a lift forward, not
        // counting the baseline you improved from — and shows a green flame pill
        // in the exercise header. Independent of the tracking mode above, since
        // it only reads history and suggests nothing.
        const PR_STREAK_TRACKING = true;
        const PR_STREAK_MIN = 1;   // fewest consecutive improvements that earn a badge

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
            // Leg Press: 5 = 2.5/side on a two-side plate machine. It reads as
            // one pin-stack notch too, which is why it needed no change when
            // this was briefly classified as a stack — do not take the shared
            // number as evidence the two classifications are interchangeable.
            'hip-adduction': 5,
            // 5 = exactly one pin-stack step. Was 1.25 — a legal micro-plate,
            // but a finer step than this machine warrants now that it is
            // capped at 405.
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
            // Tests 26 and 28 run their per-side coverage against it.
            'leg-curls': { type: 'two-sided', machineWeight: 0 },
            // Leg Press (the id renders as "Leg Press" — see DEFAULT_EXERCISES)
            // is back to two-side plate-loaded. It was briefly registered as a
            // pin stack in Aug 2026, when the gym looked to have swapped the
            // plate sled for a stack machine; that turned out not to hold, so
            // the classification is reverted here along with the 390 cap that
            // came with it. Its PR increment stays 5 — that is 2.5/side, the
            // smallest real plate, which is why the number survived both moves
            // untouched. Test 46 pins this style; nothing in localStorage
            // changes, so no config-version bump is involved.
            'hip-adduction': { type: 'two-sided', machineWeight: 0 },
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
            // `hip-adduction` (Leg Press) lived here briefly in Aug 2026, capped
            // at 390. It is back on PLATE_LOADED_EXERCISES as two-sided, so it
            // must NOT be listed here as well: WorkoutView branches on
            // `isPinStack` FIRST, so a stale entry here would silently shadow
            // the plate-loaded branch and the machine would keep rendering as a
            // stack. Test 46 asserts its absence for exactly that reason. Calf
            // Raises above keeps its own 405 cap — that was always a different
            // machine, close number notwithstanding.
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
        // it alone.
        //
        // 14 is the Anterior/Posterior switch, and it is the clearest example
        // yet of why this constant exists: the id set is IDENTICAL to 13 — same
        // 21 movements, nothing added or removed — so migrateExerciseConfig's
        // setsEqual check passes and the version is the *entire* delivery
        // mechanism. Without the bump, not one device with a saved config would
        // ever see the reassignment. Test 54 is the pin on exactly that.
        //
        // Version 3 was burned that way; 4 is the Aug 2026 Upper/Lower
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
        // entire delivery mechanism. 12 takes Back Extensions the rest of the
        // way to the front of Lower, ahead of both wrist curls; a third pure
        // reorder, a third bump that is the only way it lands on a device. 13
        // sends Leg Press the other way, from behind Leg Extensions to the very
        // end of Lower — a fourth pure reorder, so once again the bump is the
        // entire delivery mechanism. (The plate-loaded revert that shipped just
        // before it needed no version at all: PLATE_LOADED_EXERCISES is read
        // live on every render and never touches the saved config.)
        const EXERCISE_CONFIG_VERSION = 14;

        // Display names here are the defaults a fresh install sees. They mirror
        // the names in use as of August 2026; ids are frozen because workout
        // history references them.
        //
        // `day` is which half of the Anterior/Posterior split the exercise
        // belongs to (August 2026; replaced the Upper/Lower split, which had
        // itself replaced the Full Body list + separate Cardio day).
        // getCurrentExercises filters on it, so it is what decides which cards a
        // session shows. Keep each day's entries contiguous and `order` a dense
        // 0..N run: moveExercise reindexes off it and the load-time sort is a
        // plain numeric sort over the flat list.
        //
        // The split is anatomical with a push/pull flavour rather than strict
        // anatomy — the arms are grouped by function, so triceps sit on Anterior
        // and biceps on Posterior. Two movements cross what pure anatomy would
        // say, both deliberately: Hip Adduction is on Posterior because adductor
        // magnus is a hip extensor, and Cable Wrist Curls (a flexor, so anterior
        // forearm) stays on Anterior next to the other pressing work while the
        // extensors go the other way. 12 Anterior, 9 Posterior — the push side
        // carries more volume on purpose.
        //
        // Anterior comes first here, matching the day toggle and the Settings
        // list. All three orderings are independent — keep them in step.
        const DEFAULT_EXERCISES = [
            // --- Anterior (Tue / Thu / Sat, and Sun by default) ---
            { id: 'chest-press',         name: 'Chest Press',              category: 'Anterior', day: 'anterior', type: 'standard', order: 0 },
            // Takes the plain `chest-press` id above — no existing id was
            // squatting on it, unlike the leg-extensions case below, so there is
            // no need for an `actual-` prefix there.
            { id: 'incline-chest-press', name: 'Incline Chest Press',      category: 'Anterior', day: 'anterior', type: 'standard', order: 1 },
            { id: 'chest-flies',         name: 'Chest Flies',              category: 'Anterior', day: 'anterior', type: 'standard', order: 2 },
            { id: 'shoulder-press',      name: 'Shoulder Press',           category: 'Anterior', day: 'anterior', type: 'standard', order: 3 },
            { id: 'lateral-raises',      name: 'Lateral Raises',           category: 'Anterior', day: 'anterior', type: 'standard', order: 4 },
            { id: 'overhead-tricep-extensions', name: 'Overhead Tricep Extensions', category: 'Anterior', day: 'anterior', type: 'standard', order: 5 },
            { id: 'tricep-pushdown',     name: 'Tricep Extensions',        category: 'Anterior', day: 'anterior', type: 'standard', order: 6 },
            // The wrist pair splits by anatomy: flexors here, extensors on
            // Posterior. They sat on the same day under Upper/Lower.
            { id: 'reverse-wrist-curls', name: 'Reverse Wrist Curls',      category: 'Anterior', day: 'anterior', type: 'standard', order: 7 },
            { id: 'cable-wrist-curls',   name: 'Cable Wrist Curls',        category: 'Anterior', day: 'anterior', type: 'standard', order: 8 },
            { id: 'ab-crunch',           name: 'Ab Crunches',              category: 'Anterior', day: 'anterior', type: 'standard', order: 9 },
            // NOT the `leg-extensions` id below, which renders as Hip Adduction.
            // There was no history to inherit, so this took a fresh id rather
            // than reclaiming one. `actual-` mirrors Jessi's
            // `actual-preacher-curls`; the two apps deliberately share the idiom.
            { id: 'actual-leg-extensions', name: 'Leg Extensions',         category: 'Anterior', day: 'anterior', type: 'standard', order: 10 },
            // Quad-dominant, so it closes the anterior day. `hip-adduction` is
            // its frozen id; the `leg-extensions` id below is the one that
            // renders as Hip Adduction. Neither name matches its id and neither
            // is safe to rename.
            { id: 'hip-adduction',       name: 'Leg Press',                category: 'Anterior', day: 'anterior', type: 'standard', order: 11 },

            // --- Posterior (Mon / Wed / Fri) ---
            // Recline Curls opens Posterior: biceps are grouped with the pulling
            // work rather than with the other arm movements.
            { id: 'curls-shoulder-extension', name: 'Recline Curls',       category: 'Posterior', day: 'posterior', type: 'standard', order: 12 },
            { id: 'frontal-pulldowns',   name: 'Frontal Plane Pulldowns',  category: 'Posterior', day: 'posterior', type: 'standard', order: 13 },
            { id: 'hammer-row',          name: 'Sagittal Plane Pulldowns', category: 'Posterior', day: 'posterior', type: 'standard', order: 14 },
            { id: 'upper-back-row',      name: 'Transverse Plane Rows',    category: 'Posterior', day: 'posterior', type: 'standard', order: 15 },
            { id: 'kelso-shrugs',        name: 'Kelso Shrugs',             category: 'Posterior', day: 'posterior', type: 'standard', order: 16 },
            { id: 'preacher-curls',      name: 'Preacher Curls',           category: 'Posterior', day: 'posterior', type: 'standard', order: 17 },
            // `leg-curls` is its frozen id — it has not been a leg curl in a
            // long time.
            { id: 'leg-curls',           name: 'Back Extensions',          category: 'Posterior', day: 'posterior', type: 'standard', order: 18 },
            // Adductor magnus is a hip extensor, which is why this sits with the
            // posterior chain. `leg-extensions` is its frozen id — it has not
            // been a leg extension since the Upper/Lower split, and the row on
            // Anterior above is the one that actually renders Leg Extensions.
            { id: 'leg-extensions',      name: 'Hip Adduction',            category: 'Posterior', day: 'posterior', type: 'standard', order: 19 },
            { id: 'calf-raise',          name: 'Calf Raises',              category: 'Posterior', day: 'posterior', type: 'standard', order: 20 }
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

        // Which weekdays default to the Posterior card (Date.getDay(): Sun=0 …
        // Sat=6). Mon/Wed/Fri are Posterior; every other day — Tue/Thu/Sat,
        // plus Sunday — defaults to Anterior, so the larger 12-movement push day
        // comes round four times a week. A manual toggle overrides for the
        // session only. Consumed by getDefaultDayType in utils.js.
        const POSTERIOR_DAYS = [1, 3, 5];

        // Bodyweight rep config, keyed by exercise id. Reps carry over from the
        // last session (no progression); the field is a dropdown over [min, max]
        // stepped by `step`. firstSession (= min) is used when there's no history.
        const BODYWEIGHT_REP_DEFAULTS = {
            'body-weight-squats': { firstSession: 50, min: 50, max: 500, step: 5 },
            'burpee-jump-tucks':  { firstSession: 10, min: 10, max: 50,  step: 1 }
        };
