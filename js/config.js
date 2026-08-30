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

        // How a machine is loaded, and therefore which shape the Weight
        // Breakdown renders. This is a USER setting: every exercise carries a
        // `loadType` in the saved config (see DEFAULT_EXERCISES below for the
        // seed values, and the dropdown in Settings > Manage Exercises), because
        // whether a machine has a pin stack is a fact about Josh's gym, not
        // about the program.
        //
        // It replaced two id-keyed maps, PLATE_LOADED_EXERCISES and
        // PIN_STACK_EXERCISES (Aug 2026). Those could disagree — WorkoutView
        // branched on the pin map FIRST, so an id in both silently rendered as a
        // stack — which is why the old maps needed cross-checking tests. One
        // enum cannot contradict itself, so those checks are gone rather than
        // translated. `machineWeight: 0` went with them: it sat on every
        // plate-loaded entry and no code ever read it, the same way
        // `overflowPlateMode` was dropped from the pin map.
        const LOAD_TYPES = ['pin', 'plate-one-sided', 'plate-two-sided'];

        // Hard ceilings on pin stacks, keyed by id. Above the cap the breakdown
        // renders "pin at max + loose plates" for the excess. Deliberately NOT
        // part of loadType and NOT user-editable: a cap is a property of one
        // specific machine, not a way of loading one, and only one machine in
        // the program has a known ceiling. Applies only when loadType is 'pin';
        // ignored otherwise, so a cap left behind on a reclassified exercise is
        // inert rather than wrong. Test 16 fails on a cap naming a non-pin id.
        //
        // Cable Wrist Curls was capped at 97.5 until Aug 2026, when the user
        // moved to a different cable machine whose working weights are nowhere
        // near its ceiling — uncapped since, and its max does not matter until
        // it is approached. Leg Press was briefly capped at 390 in the same
        // period, when the gym looked to have swapped its plate sled for a
        // stack; that turned out not to hold. Calf Raises has always been a
        // different machine, close number notwithstanding.
        const PIN_STACK_CAPS = {
            'calf-raise': 405
        };

        // The effective loading type for an exercise. Falls back to the code
        // seed by id, then to 'pin'. The fallback is load-bearing on the import
        // path: App.jsx sets `exercises` straight from a backup file, so a
        // backup written before v15 carries no `loadType` at all until the next
        // reload runs migrateExerciseConfig. Reading `exercise.loadType`
        // directly would render an empty breakdown for that whole session.
        function resolveLoadType(exercise) {
            if (exercise && LOAD_TYPES.includes(exercise.loadType)) return exercise.loadType;
            const seed = DEFAULT_EXERCISES.find(e => e.id === (exercise && exercise.id));
            return (seed && seed.loadType) || 'pin';
        }

        // A two-sided machine splits the increment across both sides, so the
        // total has to land on a real plate: 1.25 would be 0.625/side, which
        // does not exist. 2.5 and 5 already halve legally (1.25 and 2.5/side)
        // and are passed through untouched — the bump is minimal, not a floor.
        //
        // Derived rather than stored on purpose. Persisting a second, adjusted
        // increment would mean a second user-owned field for migrateExerciseConfig
        // to preserve, and switching an exercise back to a stack would leave the
        // coarsened step behind. Computing it per read means the raw number in
        // PR_WEIGHT_INCREMENTS stays the single source of truth.
        function getWeightIncrement(exerciseId, loadType) {
            const base = PR_WEIGHT_INCREMENTS[exerciseId];
            if (base === undefined) return undefined;
            if (loadType === 'plate-two-sided' && (base / 2) % 1.25 !== 0) return base * 2;
            return base;
        }

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
        // before it needed no version at all: PLATE_LOADED_EXERCISES was read
        // live on every render and never touched the saved config.)
        //
        // 15 adds `loadType` to every exercise, and it is the bump that reverses
        // the parenthesis above. Classification used to cost nothing to change
        // because it lived in code the render read directly; it is saved state
        // now, so from here on a reclassification is a migration problem and
        // reaching an existing device needs this constant. The id set is again
        // identical, so the version is the entire delivery mechanism — but note
        // the asymmetry with every bump before it: `loadType` is USER-owned like
        // `name`, so migrateExerciseConfig preserves the saved value instead of
        // overwriting it from defaults. Seeding it from the old maps is what
        // makes the upgrade invisible; case 59 is the pin on it surviving.
        //
        // 16 moves Ab Crunches and Leg Extensions up the Anterior day, ahead of
        // Tricep Extensions and the wrist pair, so the day runs press work,
        // shoulders, one tricep movement, then abs and quads, then the small
        // arm and forearm work, then Leg Press. Same 12 ids, same count, so the
        // bump is once again the entire delivery mechanism — a fifth pure
        // reorder, and the first since `loadType` became saved state, which
        // makes the preserve list in migrateExerciseConfig load-bearing here in
        // a way it was not for reorders 7 through 13: a device that has set a
        // load type must come through this bump still holding it. Case 59 is
        // what stops that regressing.
        const EXERCISE_CONFIG_VERSION = 17;

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
            { id: 'chest-press',         name: 'Chest Press',              category: 'Anterior', day: 'anterior', type: 'standard', loadType: 'pin', order: 0 },
            // Takes the plain `chest-press` id above — no existing id was
            // squatting on it, unlike the leg-extensions case below, so there is
            // no need for an `actual-` prefix there.
            { id: 'incline-chest-press', name: 'Incline Chest Press',      category: 'Anterior', day: 'anterior', type: 'standard', loadType: 'pin', order: 1 },
            { id: 'chest-flies',         name: 'Chest Flies',              category: 'Anterior', day: 'anterior', type: 'standard', loadType: 'pin', order: 2 },
            { id: 'shoulder-press',      name: 'Shoulder Press',           category: 'Anterior', day: 'anterior', type: 'standard', loadType: 'pin', order: 3 },
            { id: 'lateral-raises',      name: 'Lateral Raises',           category: 'Anterior', day: 'anterior', type: 'standard', loadType: 'pin', order: 4 },
            { id: 'overhead-tricep-extensions', name: 'Overhead Tricep Extensions', category: 'Anterior', day: 'anterior', type: 'standard', loadType: 'pin', order: 5 },
            // Abs and quads moved up ahead of Tricep Extensions and the wrist
            // pair (Aug 2026), so the big movements are done before the small
            // isolation work rather than after it. Mirrored in Jessi's program.
            { id: 'ab-crunch',           name: 'Ab Crunches',              category: 'Anterior', day: 'anterior', type: 'standard', loadType: 'pin', order: 6 },
            // NOT the `leg-extensions` id below, which renders as Hip Adduction.
            // There was no history to inherit, so this took a fresh id rather
            // than reclaiming one. `actual-` mirrors Jessi's
            // `actual-preacher-curls`; the two apps deliberately share the idiom.
            { id: 'actual-leg-extensions', name: 'Leg Extensions',         category: 'Anterior', day: 'anterior', type: 'standard', loadType: 'pin', order: 7 },
            { id: 'tricep-pushdown',     name: 'Tricep Extensions',        category: 'Anterior', day: 'anterior', type: 'standard', loadType: 'pin', order: 8 },
            // Quad-dominant, and still the last thing on the day even with Leg
            // Extensions moved up ahead of the arm work. `hip-adduction` is its
            // frozen id; the `leg-extensions` id below is the one that renders
            // as Hip Adduction. Neither name matches its id and neither is safe
            // to rename.
            { id: 'hip-adduction',       name: 'Leg Press',                category: 'Anterior', day: 'anterior', type: 'standard', loadType: 'plate-two-sided', order: 9 },

            // --- Posterior (Mon / Wed / Fri) ---
            // Recline Curls opens Posterior: biceps are grouped with the pulling
            // work rather than with the other arm movements.
            { id: 'curls-shoulder-extension', name: 'Recline Curls',       category: 'Posterior', day: 'posterior', type: 'standard', loadType: 'pin', order: 10 },
            { id: 'frontal-pulldowns',   name: 'Frontal Plane Pulldowns',  category: 'Posterior', day: 'posterior', type: 'standard', loadType: 'pin', order: 11 },
            { id: 'hammer-row',          name: 'Sagittal Plane Pulldowns', category: 'Posterior', day: 'posterior', type: 'standard', loadType: 'plate-one-sided', order: 12 },
            { id: 'upper-back-row',      name: 'Transverse Plane Rows',    category: 'Posterior', day: 'posterior', type: 'standard', loadType: 'plate-one-sided', order: 13 },
            { id: 'kelso-shrugs',        name: 'Kelso Shrugs',             category: 'Posterior', day: 'posterior', type: 'standard', loadType: 'plate-one-sided', order: 14 },
            { id: 'preacher-curls',      name: 'Preacher Curls',           category: 'Posterior', day: 'posterior', type: 'standard', loadType: 'plate-one-sided', order: 15 },
            // The wrist pair moved here from Anterior (Aug 2026). They are
            // forearm work and belong with the pulling day's other arm
            // movements, immediately after the curls rather than tacked onto
            // the end of a pressing day. Splitting them by flexor/extensor
            // across the two days was the older idea and it never earned its
            // keep — they are done back to back at the same cable.
            { id: 'reverse-wrist-curls', name: 'Reverse Wrist Curls',      category: 'Posterior', day: 'posterior', type: 'standard', loadType: 'pin', order: 16 },
            { id: 'cable-wrist-curls',   name: 'Cable Wrist Curls',        category: 'Posterior', day: 'posterior', type: 'standard', loadType: 'pin', order: 17 },
            // `leg-curls` is its frozen id — it has not been a leg curl in a
            // long time.
            { id: 'leg-curls',           name: 'Back Extensions',          category: 'Posterior', day: 'posterior', type: 'standard', loadType: 'plate-two-sided', order: 18 },
            // Adductor magnus is a hip extensor, which is why this sits with the
            // posterior chain. `leg-extensions` is its frozen id — it has not
            // been a leg extension since the Upper/Lower split, and the row on
            // Anterior above is the one that actually renders Leg Extensions.
            { id: 'leg-extensions',      name: 'Hip Adduction',            category: 'Posterior', day: 'posterior', type: 'standard', loadType: 'pin', order: 19 },
            { id: 'calf-raise',          name: 'Calf Raises',              category: 'Posterior', day: 'posterior', type: 'standard', loadType: 'pin', order: 20 }
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
