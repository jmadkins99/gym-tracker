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

        // Get today's date string for localStorage key
        function getTodayDateString() {
            const today = new Date();
            return today.toISOString().split('T')[0]; // YYYY-MM-DD format
        }

        // Get the active day for today from localStorage, or default to Push (1)
        function getTodayDay() {
            const todayKey = 'activeDay_' + getTodayDateString();
            const savedDay = storage.getItem(todayKey);
            if (savedDay) {
                return parseInt(savedDay);
            }
            return 1; // Default to Push
        }

        // Save the active day for today to localStorage
        function saveActiveDay(day) {
            const todayKey = 'activeDay_' + getTodayDateString();
            storage.setItem(todayKey, day.toString());
        }

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

        // Get week number for a specific date
        function getWeekNumber(date, workoutHistory) {
            return getConsecutiveWeek(date, workoutHistory);
        }

        // Parse MM:SS to total seconds
        function parseTimeToSeconds(timeStr) {
            if (!timeStr) return 0;
            const parts = timeStr.split(':');
            if (parts.length !== 2) return 0;
            const minutes = parseInt(parts[0]) || 0;
            const seconds = parseInt(parts[1]) || 0;
            return minutes * 60 + seconds;
        }

        // Format seconds to MM:SS
        function formatSecondsToTime(totalSeconds) {
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
