        // Namespace localStorage based on app path to prevent conflicts between gym-tracker and public-gym-app
        const APP_NAMESPACE = (() => {
            const path = window.location.pathname;
            if (path.includes('/gym-tracker/')) return 'gym-tracker:';
            if (path.includes('/public-gym-app/')) return 'public-gym-app:';
            // Fallback for local development or other paths
            return 'gym-local:';
        })();

        // Helper functions for namespaced localStorage
        const storage = {
            getItem: (key) => localStorage.getItem(APP_NAMESPACE + key),
            setItem: (key, value) => localStorage.setItem(APP_NAMESPACE + key, value),
            removeItem: (key) => localStorage.removeItem(APP_NAMESPACE + key),
        };

        // Get the Monday of the week containing a given date
        function getMondayOfWeek(date) {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            const day = d.getDay();
            const diff = day === 0 ? -6 : 1 - day; // If Sunday (0), go back 6 days; otherwise go to Monday
            d.setDate(d.getDate() + diff);
            return d;
        }

        // Get the Monday of the first workout (Week 1 start date)
        // This is cached in localStorage to avoid recalculating
        function getFirstWorkoutMonday(workoutHistory) {
            // Try to get cached value first
            const cached = storage.getItem('firstWorkoutMonday');
            if (cached) {
                return new Date(cached);
            }

            // If no cache and no workout history, use today as default
            if (!workoutHistory || workoutHistory.length === 0) {
                const today = getMondayOfWeek(new Date());
                storage.setItem('firstWorkoutMonday', today.toISOString());
                return today;
            }

            // Find the earliest workout date
            const earliestWorkout = workoutHistory.reduce((earliest, workout) => {
                const workoutDate = new Date(workout.date);
                return !earliest || workoutDate < earliest ? workoutDate : earliest;
            }, null);

            // Get the Monday of that week
            const firstMonday = getMondayOfWeek(earliestWorkout);

            // Cache it for future use
            storage.setItem('firstWorkoutMonday', firstMonday.toISOString());

            return firstMonday;
        }

        // Calculate consecutive week number starting from first workout
        // Week 1 = the week of the first workout, incrementing indefinitely
        function getConsecutiveWeek(date, workoutHistory) {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);

            const firstMonday = getFirstWorkoutMonday(workoutHistory);
            const currentMonday = getMondayOfWeek(d);

            // Calculate weeks difference
            const diffTime = currentMonday - firstMonday;
            const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));

            return diffWeeks + 1; // Week 1 is the first week
        }

        // Calculate current week number (consecutive weeks starting from first workout)
        function getCurrentWeek(workoutHistory) {
            return getConsecutiveWeek(new Date(), workoutHistory);
        }

        // Which day type the app should default to for a given date:
        // 'posterior' on the configured POSTERIOR_DAYS (Mon/Wed/Fri), otherwise
        // 'anterior'.
        function getDefaultDayType(date = new Date()) {
            return POSTERIOR_DAYS.includes(date.getDay()) ? 'posterior' : 'anterior';
        }

        // Human label for a stored workout's `day`, across every split this app
        // has shipped. Pre-Feb-2026 workouts used numeric day indexes whose
        // meaning depended on the split in force at the time, so those need the
        // date; everything since Jun 2026 stores a self-describing string.
        // Note the two words "Anterior" and "Posterior" now reach this function
        // by three different routes: the current string literals below, and the
        // numeric Feb-2026 and Apr-2026 rotations further down. That is correct
        // at the display layer — the user did call all three by those names —
        // but it does mean the label alone no longer identifies which program a
        // session came from. The code paths stay distinct; do not "simplify"
        // them together.
        function getWorkoutDayLabel(workout) {
            if (workout.day === 'anterior') return 'Anterior';
            if (workout.day === 'posterior') return 'Posterior';
            // Aug 2026 Upper/Lower. Stored history is never migrated, so these
            // two lines are load-bearing forever even though no exercise
            // carries an 'upper'/'lower' day any more. Delete them and every
            // workout from that era silently starts rendering as "Full Body",
            // by falling through the `typeof !== 'number'` check below.
            if (workout.day === 'lower') return 'Lower';
            if (workout.day === 'upper') return 'Upper';
            if (workout.day === 'cardio') return 'Cardio';
            if (typeof workout.day !== 'number') return 'Full Body';

            const d = new Date(workout.date);
            d.setHours(0, 0, 0, 0);
            const on = (y, m, day) => { const x = new Date(y, m, day); x.setHours(0, 0, 0, 0); return x; };
            if (d < on(2026, 1, 2))  return workout.day === 1 ? 'Upper' : 'Lower';
            if (d < on(2026, 2, 14)) return workout.day === 1 ? 'Anterior' : 'Posterior';
            if (d < on(2026, 3, 16)) return workout.day === 1 ? 'Push' : workout.day === 2 ? 'Pull' : 'Legs';
            if (d < on(2026, 5, 1))  return workout.day === 1 ? 'Anterior' : 'Posterior';
            if (d < on(2026, 5, 21)) return workout.day === 1 ? 'Torso' : 'Limbs';
            return 'Full Body';
        }

        // Which exercise definitions a stored workout should render against, in
        // the Weekly tab and the Edit modal.
        //
        // An Anterior/Posterior workout renders against its own day in the
        // current config, so renames and reorders show through. Note the day
        // filter is load-bearing: both days now live in one config, so "are all
        // this workout's ids in `exercises`?" is true for either day and a
        // day-blind check pads an Anterior session with the whole Posterior day
        // as empty rows.
        //
        // Anything older — the Aug 2026 Upper/Lower split, pre-split Full Body,
        // the retired Cardio day, the numeric-day splits before that — renders
        // the exercises stored on the workout itself, which preserves its
        // historical layout. That is why 'upper'/'lower' are deliberately absent
        // from the gate below: those workouts hold a roster that no longer
        // matches either current day, and must keep showing the 13 or 8 rows
        // they were actually performed with. Display names still resolve
        // through the current config by id, so a rename the user makes today
        // reaches every past workout that movement appears in.
        function getWorkoutExerciseList(workout, exercises) {
            const byId = new Map(exercises.map(e => [e.id, e]));

            if (workout.day === 'anterior' || workout.day === 'posterior') {
                if (workout.exercises.every(e => byId.get(e.id)?.day === workout.day)) {
                    return exercises.filter(e => e.day === workout.day);
                }
            }

            return workout.exercises.map(e =>
                byId.has(e.id) ? { ...e, name: byId.get(e.id).name } : e);
        }

        // Get week number for a specific date
        function getWeekNumber(date, workoutHistory) {
            return getConsecutiveWeek(date, workoutHistory);
        }

        // Parse MM:SS into total seconds. Returns 0 for anything unparseable.
        function parseTimeToSeconds(time) {
            if (!time) return 0;
            const [minutes, seconds] = String(time).split(':');
            const m = parseInt(minutes);
            const s = parseInt(seconds);
            if (isNaN(m)) return 0;
            return m * 60 + (isNaN(s) ? 0 : s);
        }

        // Format seconds to MM:SS
        function formatSecondsToTime(totalSeconds) {
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
