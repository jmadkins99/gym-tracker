        // Week 1 default weights
        const WEEK_1_DEFAULTS = {
            'chest-flies': '165',
            'incline-chest-press': '110',
            'shoulder-press': '126.25',
            'preacher-curls': '56.25',
            'tricep-pushdown': '36.25',
            'lateral-raises': '27.5',
            'overhead-tricep': '27.5',
            'upper-back-row': '190',
            'kelso-shrugs': '190',
            'frontal-pulldowns': '180',
            'hammer-row': '117.5',
            'leg-extensions': '240',
            'leg-curls': '150',
            'hip-adduction': '120',
            'calf-raise': '180',
            'ab-crunch': '140'
        };

        // PR Auto-Regulation: Weight increments when you hit 8+ reps
        // Edit these values to customize weight progression for each exercise
        const PR_WEIGHT_INCREMENTS = {
            'chest-flies': 1.25,
            'incline-chest-press': 1.25,
            'shoulder-press': 1.25,
            'preacher-curls': 1.25,
            'tricep-pushdown': 1.25,
            'lateral-raises': 1.25,
            'overhead-tricep': 1.25,
            'frontal-pulldowns': 1.25,
            'upper-back-row': 1.25,
            'kelso-shrugs': 1.25,
            'hammer-row': 1.25,
            'leg-extensions': 1.25,
            'leg-curls': 5,
            'hip-adduction': 1.25,
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
            'leg-curls': { type: 'two-sided', machineWeight: 0 },
            'hip-adduction': { type: 'one-sided', machineWeight: 0 }
        };

        // Pin-stack exercises configuration
        // These machines use weight stacks with 5 lb increments
        // Can add micro-plates (1.25, 2.5, or 3.75) on top of the pin
        const PIN_STACK_EXERCISES = {
            'chest-flies': true,
            'incline-chest-press': true,
            'shoulder-press': true,
            'tricep-pushdown': true,
            'lateral-raises': true,
            'overhead-tricep': true,
            'frontal-pulldowns': true,
            'upper-back-row': true,
            'kelso-shrugs': true,
            'hammer-row': true,
            'leg-extensions': true,
            'calf-raise': true,
            'ab-crunch': true,
            'cable-wrist-curls': true,
            'reverse-wrist-curls': true
        };

        const DEFAULT_DAY_1_EXERCISES = [
            // Push
            { id: 'tricep-pushdown', name: 'Cuffed Tricep Pushdown', category: 'Push', type: 'standard', order: 0 },
            { id: 'overhead-tricep', name: 'Cuffed Overhead Tricep Extension', category: 'Push', type: 'standard', order: 1 },
            { id: 'chest-flies', name: 'Chest Flies', category: 'Push', type: 'standard', order: 2 },
            { id: 'incline-chest-press', name: 'Incline Chest Flies', category: 'Push', type: 'standard', order: 3 },
            { id: 'lateral-raises', name: 'Lateral Raises', category: 'Push', type: 'standard', order: 4 },
            { id: 'shoulder-press', name: 'Shoulder Press Machine', category: 'Push', type: 'standard', order: 5 },
            // Cardio
            { id: 'stairmaster', name: 'Stairmaster', category: 'Cardio', type: 'stairmaster', order: 6 },
        ];

        const DEFAULT_DAY_2_EXERCISES = [
            // Pull
            { id: 'preacher-curls', name: 'Preacher Curls', category: 'Pull', type: 'standard', order: 0 },
            { id: 'frontal-pulldowns', name: 'Frontal Plane Pulldowns', category: 'Pull', type: 'standard', order: 1 },
            { id: 'upper-back-row', name: 'Upper Back Row Machine', category: 'Pull', type: 'standard', order: 2 },
            { id: 'kelso-shrugs', name: 'Kelso Shrugs', category: 'Pull', type: 'standard', order: 3 },
            { id: 'hammer-row', name: 'Seated Row Machine', category: 'Pull', type: 'standard', order: 4 },
            { id: 'cable-wrist-curls', name: 'Cable Wrist Curls', category: 'Pull', type: 'standard', order: 5 },
            { id: 'reverse-wrist-curls', name: 'Reverse Wrist Curls', category: 'Pull', type: 'standard', order: 6 },
            // Cardio
            { id: 'stairmaster', name: 'Stairmaster', category: 'Cardio', type: 'stairmaster', order: 7 },
        ];

        const DEFAULT_DAY_3_EXERCISES = [
            // Legs
            { id: 'hip-adduction', name: 'Pendulum Squats', category: 'Legs', type: 'standard', order: 0 },
            { id: 'leg-curls', name: 'Stiff Legged Deadlifts', category: 'Legs', type: 'standard', order: 1 },
            { id: 'leg-extensions', name: 'Leg Extensions', category: 'Legs', type: 'standard', order: 2 },
            { id: 'calf-raise', name: 'Seated Calf Raise Machine', category: 'Legs', type: 'standard', order: 3 },
            { id: 'ab-crunch', name: 'Ab Crunch Machine', category: 'Legs', type: 'standard', order: 4 },
            // Cardio
            { id: 'stairmaster', name: 'Stairmaster', category: 'Cardio', type: 'stairmaster', order: 5 },
        ];
