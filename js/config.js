        // Tracking mode: only one should be true at a time
        // SIMPLE_PR_TRACKING: if you hit the top of the rep range last session,
        // bump weight and highlight green. No plateau buster.
        // ADVANCED_PR_TRACKING: full plateau buster + PR auto-regulation system
        const SIMPLE_PR_TRACKING = true;
        const ADVANCED_PR_TRACKING = false;

        // Streaks: the positive counterpart to the "Plateau Detected" hint. Counts
        // consecutive improvements — sessions that moved a lift forward, not
        // counting the baseline you improved from — and shows a gold-outline flame pill
        // in the exercise header. Independent of the tracking mode above, since
        // it only reads history and suggests nothing.
        const PR_STREAK_TRACKING = true;
        const PR_STREAK_MIN = 1;   // fewest consecutive improvements that earn a badge

        // PR Auto-Regulation: Weight increments when you hit the top of the
        // exercise's standard rep range.
        // 5 lbs where a 5 is the natural step — two-sided plate-loaded (= 2.5
        // per side per move) and pin stacks moved a full stack notch at a time.
        // 2.5 or 1.25 elsewhere; both are legal micro-plate steps.
        //
        // The default for every exercise as of Oct 2026 (v25). The increment is
        // a user setting, editable from the pencil in Settings > Manage
        // Exercises and saved as `increment` on the exercise; this is only read
        // for an exercise that has no saved value (see resolveIncrement below).
        // It replaced a per-id seed table when every movement took a new id.
        const DEFAULT_PR_INCREMENT = 2.5;

        // The only increments the Settings dropdown offers: 0 plus the real
        // plate steps. resolveIncrement also rejects a saved value outside this
        // list, so a hand-edited backup cannot smuggle in a 3 no gym can load.
        //
        // 0 means "never bump this one". Hitting the top of the rep range still
        // counts as a PR everywhere PRs are read from history — the badge, the
        // flame streak, the Submit Day and History toasts — but
        // getWeightIncrement hands back a falsy 0, so getSimplePR bails out and
        // the card carries last session's weight AND reps forward instead of
        // suggesting a heavier weight at the bottom of the range. That is the
        // whole mechanism: every caller of getWeightIncrement already guards on
        // truthiness (it was the shape for "this exercise has no step"), so 0
        // needed no new branch in the suggestion logic. Case 139 pins it.
        const PR_INCREMENT_OPTIONS = [0, 1.25, 2.5, 5, 10];

        // Standard weighted rep dropdowns. Internally a range is the dropdown's
        // ends: `min` is the bottom value, the one you log when the set failed,
        // and `max` is the top that earns a weight bump. The user thinks in the
        // rep range itself, one above that bottom, so "4-6" is { min: 3, max: 6 }.
        //
        // The rep range is a USER setting since Oct 2026: Settings > Manage
        // Exercises saves `repMin`/`repMax` on the exercise. An exercise with no
        // saved pair uses the default. Every caller goes through
        // getStandardRepRange, so the dropdown, the default reps and every PR
        // verdict follow the setting with no other plumbing.
        //
        // Lookup is by id, not by exercise object, because the history callers
        // (isFailedSet, streaks, the PR toast) only hold a logged entry. App
        // keeps the list current with setActiveExercises on every render.
        const DEFAULT_STANDARD_REP_RANGE = { min: 3, max: 6 };

        // The only "min reps" and "max reps" the Settings dropdowns offer. A floor
        // of 4 keeps the failed-set bottom at 3 or above.
        const REP_RANGE_FLOOR = 4;
        const REP_RANGE_CEILING = 12;

        // Rejects anything Settings could not have saved, so a hand-edited
        // backup falls back to the default rather than breaking the dropdown.
        function isValidRepRange(repMin, repMax) {
            return Number.isInteger(repMin) && Number.isInteger(repMax) &&
                REP_RANGE_FLOOR <= repMin && repMin <= repMax && repMax <= REP_RANGE_CEILING;
        }

        let activeExercises = [];
        function setActiveExercises(exercises) {
            activeExercises = exercises || [];
        }

        function getStandardRepRange(exerciseId) {
            const exercise = activeExercises.find(e => e.id === exerciseId);
            if (exercise && isValidRepRange(exercise.repMin, exercise.repMax)) {
                return { min: exercise.repMin - 1, max: exercise.repMax };
            }
            return DEFAULT_STANDARD_REP_RANGE;
        }

        function getStandardRepOptions(exerciseId) {
            const range = getStandardRepRange(exerciseId);
            const options = [];
            for (let reps = range.min; reps <= range.max; reps++) options.push(String(reps));
            return options;
        }

        function getStandardRepStart(exerciseId) {
            const range = getStandardRepRange(exerciseId);
            return String(Math.min(range.max, range.min + 1));
        }

        function clampStandardReps(exerciseId, reps) {
            const n = parseInt(reps, 10);
            if (isNaN(n)) return null;
            const range = getStandardRepRange(exerciseId);
            return String(Math.min(range.max, Math.max(range.min, n)));
        }

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

        // Where a pin stack runs out, and whether a Gympin takes over from
        // there. Both are USER settings as of Sep 2026: every pin-loaded
        // exercise carries `gympin` (on/off) and `stackMax` (the stack's top
        // weight in lb) in the saved config, set from the pencil form in
        // Settings > Manage Exercises. Above stackMax the breakdown renders
        // "pin at max + loose plates" for the excess — the *overflow* shape,
        // which is the plate list to hang on the Gympin. With the Gympin off
        // the stack simply has no ceiling as far as the breakdown is
        // concerned, which is what every uncapped machine has always rendered.
        //
        // The controls only appear for an exercise whose load type is
        // Pin-loaded, and resolveGympin below returns off for anything else,
        // so a Gympin left behind on a reclassified exercise is inert rather
        // than wrong. The two fields survive the switch, so flipping a machine
        // back to Pin-loaded restores them.
        //
        // PIN_STACK_CAPS is the SEED for those fields, by id: an exercise
        // that carries neither field reads its ceiling from here and is on if
        // it has an entry. It is empty since v25 (Oct 2026): every movement
        // took a new id and starts with the Gympin off, set from Settings at
        // the machine. The machine-by-machine history of the old entries
        // (Lateral Raises, Shoulder Press, Back Extensions, Calf Raises) is in
        // git, and test 16 still fails on a seed naming a non-pin id.
        const PIN_STACK_CAPS = {};

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

        // The effective Gympin setting for an exercise: { on, max }, where
        // `max` is the stack's top weight in lb, or null. Off unless the
        // exercise is Pin-loaded — the overflow shape is a pin pegged at its
        // ceiling with plates hung past it, which means nothing on a plate
        // machine — and off when on but with no usable ceiling, so the
        // breakdown never has to think about a half-filled form.
        //
        // Same shape as resolveIncrement below: the saved field wins when it
        // is present, else the code seed in PIN_STACK_CAPS. A saved `false`
        // is a real answer and beats the seed, which is how a seeded machine
        // is switched off from Settings. No fallback is written into the
        // config, so a seed change still reaches an install that never
        // touched the form.
        function resolveGympin(exercise) {
            const off = { on: false, max: null };
            if (!exercise || resolveLoadType(exercise) !== 'pin') return off;
            const seedMax = PIN_STACK_CAPS[exercise.id];
            const on = typeof exercise.gympin === 'boolean' ? exercise.gympin : seedMax !== undefined;
            const saved = Number(exercise.stackMax);
            const max = Number.isFinite(saved) && saved > 0 ? saved : (seedMax ?? null);
            return on && max !== null ? { on: true, max } : off;
        }

        // The raw PR step for an exercise: the user's saved `increment` if it is
        // a legal step, else DEFAULT_PR_INCREMENT. Same shape as
        // resolveLoadType, and the fallback is load-bearing for the same reason —
        // an exercise nobody has edited carries no `increment` at all.
        //
        // A saved 0 is a legal step ("never bump", see PR_INCREMENT_OPTIONS),
        // so the test here is `includes`, never truthiness: a `saved || DEFAULT`
        // would read 0 as "nothing saved" and quietly hand back 2.5.
        function resolveIncrement(exercise) {
            const saved = exercise && exercise.increment;
            if (PR_INCREMENT_OPTIONS.includes(saved)) return saved;
            return DEFAULT_PR_INCREMENT;
        }

        // A two-sided machine splits the increment across both sides, so the
        // total has to land on a real plate: 1.25 would be 0.625/side, which
        // does not exist. 2.5 and 5 already halve legally (1.25 and 2.5/side)
        // and are passed through untouched — the bump is minimal, not a floor.
        //
        // The adjustment is derived on read, never stored. The saved increment
        // is the raw step the user typed, so switching an exercise back to a
        // stack restores the fine step instead of leaving a coarsened one
        // behind. That is also why Settings shows the raw number.
        //
        // The default is 2.5, so against untouched config this branch never
        // fires. Since the increment became editable (Sep 2026) it does
        // the moment someone types 1.25 on a two-sided machine. Case 61 pins it.
        //
        // A 0 falls through it untouched — (0 / 2) % 1.25 is 0 — so "never
        // bump" stays 0 on a two-sided machine rather than being doubled into
        // a step. Returning 0 here is what switches the bump off downstream.
        function getWeightIncrement(exercise, loadType) {
            const base = resolveIncrement(exercise);
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
        //
        // 19 drops the wrist pair (Sep 2026). Unlike every bump from 7 on, the
        // id set genuinely changes here, so migrateExerciseConfig's setsEqual
        // check would catch it on its own — the bump is belt and braces, and it
        // is what guarantees the reorder *behind* the removal (Back Extensions,
        // Hip Adduction and Calf Raises each shift up two places) lands on a
        // device that reloads mid-flight. The same bump carries Back Extensions'
        // seed change to 'pin', but only to installs that never touched the
        // dropdown: loadType is user-owned and preserved by name, so a device
        // that chose two-sided keeps it and must change it in Settings.
        // 20 is the Sep 2026 reorder of both days, and it is the bump doing the
        // whole job again: the id set is identical to 19, so setsEqual passes
        // and nothing but this constant carries the new order. Tricep Extensions
        // goes to the front of Anterior and Leg Press / Leg Extensions swap at
        // the back; on Posterior, Shoulder Flexion Curls and Sagittal Plane
        // Pullovers come up to second and third and Frontal Plane Pulldowns
        // drops to sixth.
        //
        // The renames and load-type changes riding along with it are a
        // different matter, and the asymmetry is worth stating plainly: `name`
        // and `loadType` are USER-owned, so migrateExerciseConfig keeps whatever
        // the device already has. Preacher Curls -> Shoulder Flexion Curls,
        // Sagittal Plane Pulldowns -> Sagittal Plane Pullovers, both of those to
        // 'pin', and Frontal Plane Pulldowns to 'plate-one-sided' therefore
        // reach a FRESH INSTALL ONLY. An existing device takes the reorder from
        // this bump and keeps its own names and dropdown answers; changing those
        // there is a Settings job, not a deploy. That is the design (v15's note
        // below says why) and not a gap to close here.
        //
        // 21 is the second Sep 2026 reorder, and this one is nothing but a
        // reorder — no renames, no load-type changes, no id-set change riding
        // along, so unlike 20 there is no fresh-install-only asterisk to put on
        // any of it. Every device that reloads takes the whole change. On
        // Anterior, Overhead Tricep Extensions and Ab Crunches come up two
        // places each and the shoulder pair goes behind them, reversed, so
        // Lateral Raises now leads Shoulder Press. On Posterior, Kelso Shrugs
        // and Transverse Plane Rows trade places and nothing else moves.
        //
        // 22 is the Sep 2026 switch from Anterior/Posterior to one Full Body
        // day, and like 14 it is a whole split change delivered by nothing but
        // this bump: the id set is identical to 21, every entry's `day` and
        // `category` change, and the order is new. There is no migration code
        // for it and none is needed — history is keyed by exercise id, so every
        // "Last:" and PR streak carries over, and past sessions keep their
        // 'anterior'/'posterior' stamp and render as performed. It also retired
        // the last one-shot config wipe (the `migratedToFullBody2` sentinel in
        // App.jsx), which would have deleted a saved config on any device
        // without the flag. Tests 123 and 124 are the pins.
        //
        // 23 is the Oct 2026 reorder of the Full Body day: the press pair opens
        // it, Lateral Raises, Frontal Plane Pulldowns and Tricep Extensions
        // follow, then Chest Flies and the curls. Same 19 ids, so the bump is the
        // entire delivery mechanism again. The user had already made this
        // order by hand in Settings; this puts it in code so the next bump
        // does not quietly put the old one back.
        //
        // Three seed changes ride along with the same asterisk as 20: Chest
        // Press and Incline Chest Press to 'plate-two-sided', and Frontal Plane
        // Pulldowns to 'pin', reach a FRESH INSTALL ONLY. An existing device
        // keeps its own dropdown answer and changes it in Settings, which is
        // deliberately the whole plan rather than a one-time rewrite.
        //
        // 24 is the second Oct 2026 reorder, and nothing but a reorder: same
        // 19 ids, no seed changes riding along. Chest Flies now opens the day
        // ahead of the press pair, the curls, Overhead Tricep Extensions, Ab
        // Crunches and Sagittal Plane Pullovers follow, and Lateral Raises,
        // Frontal Plane Pulldowns and Tricep Extensions drop in behind them,
        // just ahead of Kelso Shrugs. Back Extensions onward does not move.
        //
        // 25 is the Oct 2026 switch to new ids, and the first bump whose whole
        // point is the id set. Every movement took an id naming the muscle and
        // joint action (`chest-flies` -> `pecs-transverse-shoulder-adduction`)
        // that no earlier program used, the names were updated with them, and
        // NOTHING was migrated: the 19 old ids retired with their history, so
        // History still shows those sessions as logged and every card starts
        // with no "Last:". migrateExerciseConfig delivers it unaided — the old
        // entries are not in DEFAULT_EXERCISES, so they drop, and the new ones
        // come in on their seeds. That also resets every per-exercise setting
        // to pin-loaded, 2.5, Gympin off and 4-6 reps, which was asked for.
        // The names here now differ from Jessi's program, which keeps its own.
        // Test 135 is the pin.
        //
        // 26 adds four movements on ids no program used before (Supinations,
        // JM Press, Reverse Wrist Curls, Wrist Curls) and reorders the day to
        // open with the curls. The id set changes, so setsEqual would catch it
        // alone; the bump is what carries the new order with it. The new four
        // start like every other movement since v25: pin-loaded, 2.5, Gympin
        // off, 4-6 reps. Reverse Wrist Curls shares a name with the retired
        // `reverse-wrist-curls` and nothing else: its history does not carry.
        //
        // ----------------------------------------------------------------
        // LANDING A REORDER
        // ----------------------------------------------------------------
        // The paragraphs above are the history. This is the procedure, kept
        // here because this constant is what someone changing the roster opens
        // first, and the surprises are not in this file.
        //
        // A reorder lands in TWO places:
        //   1. DEFAULT_EXERCISES below, plus a bump of this constant.
        //   2. public-gym-app/js/migrations.jessi.js — JESSI_PROGRAM, plus a
        //      bump of JESSI_SPLIT_REVISION. That delivers it to Jessi's
        //      existing devices, and his coach preset is built from the same
        //      table, so fresh installs follow automatically (since revision
        //      16; before that the preset in clients.js was a third, separately
        //      maintained copy, and the one that got missed).
        // The two programs have been identical name for name since the Aug 2026
        // split. Ask before letting them diverge, and say so in both commits.
        //
        // `order` is a dense 0..N run across the WHOLE flat list, not per day.
        // moveExercise reindexes off it and load time is a plain numeric sort,
        // so when PROGRAM_DAYS has more than one day keep each day contiguous.
        //
        // What a bump does and does not carry: `order`, `day` and `category`
        // are code-owned and ride in on it. `name`, `loadType`, `increment`,
        // `gympin` and `stackMax` are USER-owned and preserved by
        // migrateExerciseConfig, so a change to those in the seed data reaches
        // a fresh install only. Getting a rename
        // onto an existing device is a Settings job here; on Jessi's side it
        // needs a one-time JESSI_REV<N>_* pass. A pure reorder needs neither.
        const EXERCISE_CONFIG_VERSION = 26;

        // The days of the current program, in toggle order. Everything that
        // used to hard-code the split reads this instead: the deck's day toggle
        // (rendered only when there is more than one day to choose between),
        // the Settings grouping, and getDefaultDayType. Every id here must be a
        // `day` some DEFAULT_EXERCISES entry carries, and each needs a line in
        // getWorkoutDayLabel so its workouts are labelled in History.
        //
        // Changing split is: edit this list and the `day` / `category` / `order`
        // of DEFAULT_EXERCISES, bump EXERCISE_CONFIG_VERSION, add the label.
        // No migration — history is keyed by exercise id, and past workouts
        // keep the `day` they were stored with. Give a new program a day id no
        // earlier era used (hence 'full-body', not the Jun–Aug 2026 'fullbody'),
        // so History never mistakes an old session for a current one.
        const PROGRAM_DAYS = [
            { id: 'full-body', label: 'Full Body' },
        ];

        // Display names here are the defaults a fresh install sees. An id names
        // the muscle and the joint action, never a machine or a display name,
        // because those drift and history is keyed by id: once a session is
        // logged under an id, it means that movement for good. A different
        // movement takes a new id, never an old one — not even a retired one,
        // which old backups and History still use.
        //
        // `day` is which PROGRAM_DAYS entry the exercise belongs to.
        // getCurrentExercises filters on it, so it is what decides which cards a
        // session shows. Keep each day's entries contiguous and `order` a dense
        // 0..N run: moveExercise reindexes off it and the load-time sort is a
        // plain numeric sort over the flat list.
        //
        // Sep 2026: one Full Body day, six sessions a week, replacing the
        // Anterior/Posterior split (Aug 2026), which had replaced Upper/Lower.
        // Oct 2026 (v25): every movement on a new id, see the note above
        // EXERCISE_CONFIG_VERSION.
        // v26 added Supinations, JM Press, Reverse Wrist Curls and Wrist
        // Curls and reordered the day.
        const DEFAULT_EXERCISES = [
            { id: 'biceps-elbow-flexion-with-shoulder-extension', name: 'Recline Curls', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 0 },
            { id: 'biceps-elbow-flexion-with-shoulder-flexion', name: 'Preacher Curls', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 1 },
            { id: 'pecs-transverse-shoulder-adduction', name: 'Chest Flies', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 2 },
            { id: 'pecs-shoulder-flexion', name: 'Low to High Flies', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 3 },
            { id: 'pecs-transverse-shoulder-adduction-with-elbow-extension', name: 'Chest Press', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 4 },
            { id: 'biceps-wrist-supination', name: 'Supinations', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 5 },
            { id: 'triceps-elbow-extension', name: 'Tricep Extensions', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 6 },
            { id: 'delts-shoulder-abduction-stop-at-90-degrees', name: 'Lateral Raises', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 7 },
            { id: 'triceps-elbow-extension-with-shoulder-flexion', name: 'Overhead Tricep Extensions', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 8 },
            { id: 'delts-shoulder-abduction-above-90-degrees', name: 'Lu Raises', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 9 },
            { id: 'triceps-elbow-extension-during-shoulder-flexion', name: 'JM Press', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 10 },
            { id: 'lats-sagittal-shoulder-extension', name: 'Sagittal Pulldowns', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 11 },
            { id: 'lats-frontal-shoulder-adduction', name: 'Frontal Pulldowns', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 12 },
            { id: 'traps-scapular-retraction', name: 'Kelso Shrugs', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 13 },
            { id: 'brachioradialis-elbow-flexion', name: 'Reverse Wrist Curls', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 14 },
            { id: 'forearm-wrist-flexion', name: 'Wrist Curls', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 15 },
            { id: 'abs-spinal-flexion', name: 'Ab Crunches', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 16 },
            { id: 'erectors-spinal-extension', name: 'Back Extensions', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 17 },
            { id: 'quads-knee-extension', name: 'Leg Extensions', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 18 },
            { id: 'calves-ankle-extension', name: 'Calf Raises', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 19 },
            { id: 'quads-knee-extension-during-hip-flexion', name: 'Squats', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 20 },
            { id: 'delts-transverse-shoulder-abduction-with-elbow-flexion', name: 'Transverse Rows', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 21 },
            { id: 'adductors-transverse-hip-adduction', name: 'Hip Adduction', category: 'Full Body', day: 'full-body', type: 'standard', loadType: 'pin', order: 22 }
        ];

        // Retired from logging: `body-weight-squats`, `burpee-jump-tucks`, and
        // `assault-bike` (August 2026 Lower/Upper switch), `stairmaster`
        // (dropped off Lower a few days later — it had been the lone 'Cardio'
        // category entry, so Lower no longer renders a Cardio heading at all),
        // and `reverse-wrist-curls` + `cable-wrist-curls` (Sep 2026). Oct 2026
        // (v25) retired the rest of the old ids at once, every movement moving
        // to a new one: `chest-flies`, `chest-press`, `incline-chest-press`,
        // `curls-shoulder-extension`, `preacher-curls`,
        // `overhead-tricep-extensions`, `ab-crunch`, `hammer-row`,
        // `lateral-raises`, `frontal-pulldowns`, `tricep-pushdown`,
        // `kelso-shrugs`, `upper-back-row`, `shoulder-press`, `leg-curls`,
        // `hip-adduction`, `leg-extensions`, `calf-raise` and
        // `actual-leg-extensions`. None may be reused.
        // Every rendering branch stays put — the stairmaster arms in
        // WorkoutView / EditWorkoutModal / WeeklyView / DayBreakdownModal,
        // getStairmasterSuggestion in plateauLogic, and the rep configs in
        // BODYWEIGHT_REP_DEFAULTS — because workout history still references
        // those ids and must keep rendering and editing.
        //
        // The wrist pair is the one retirement that left nothing behind in
        // config: they were plain `standard` movements, so they need no
        // rendering arm of their own, and their increment and rep-range
        // entries were read per *rostered* exercise. Past sessions
        // render from the stored entry either way. Everything about them is
        // recoverable from git — that is the reason this was a deletion rather
        // than a commented-out block.

        // Bodyweight rep config, keyed by exercise id. Reps carry over from the
        // last session (no progression); the field is a dropdown over [min, max]
        // stepped by `step`. firstSession (= min) is used when there's no history.
        const BODYWEIGHT_REP_DEFAULTS = {
            'body-weight-squats': { firstSession: 50, min: 50, max: 500, step: 5 },
            'burpee-jump-tucks':  { firstSession: 10, min: 10, max: 50,  step: 1 }
        };
