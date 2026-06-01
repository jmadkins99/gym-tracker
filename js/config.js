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

        // Tracking mode: only one should be true at a time
        // SIMPLE_PR_TRACKING: if you hit 6 reps last session, bump weight and highlight green. No plateau buster.
        // ADVANCED_PR_TRACKING: full plateau buster + PR auto-regulation system
        const SIMPLE_PR_TRACKING = true;
        const ADVANCED_PR_TRACKING = false;

        // PR Auto-Regulation: Weight increments when you hit 6+ reps (top of 4-6 range)
        // 5 lbs for two-sided plate-loaded (= 2.5/side per move); 2.5 lbs for everything else.
        const PR_WEIGHT_INCREMENTS = {
            'chest-flies': 5,
            'incline-chest-press': 5,
            'leg-curls': 5,
            'shoulder-press': 2.5,
            'preacher-curls': 2.5,
            'tricep-pushdown': 2.5,
            'lateral-raises': 2.5,
            'overhead-tricep': 2.5,
            'frontal-pulldowns': 2.5,
            'upper-back-row': 2.5,
            'kelso-shrugs': 2.5,
            'hammer-row': 2.5,
            'leg-extensions': 2.5,
            'hip-adduction': 2.5,
            'calf-raise': 2.5,
            'ab-crunch': 2.5,
            'cable-wrist-curls': 2.5,
            'reverse-wrist-curls': 2.5
        };

        // Plate-loaded exercises configuration
        // Defines which exercises show the "Weight Breakdown" button
        // type: 'one-sided' or 'two-sided'
        // machineWeight: starting weight of the machine (usually 0 for plate-loaded)
        const PLATE_LOADED_EXERCISES = {
            'preacher-curls': { type: 'one-sided', machineWeight: 0 },
            'leg-curls': { type: 'two-sided', machineWeight: 0 },
            'hip-adduction': { type: 'one-sided', machineWeight: 0 },
            'chest-flies': { type: 'two-sided', machineWeight: 0 },
            'incline-chest-press': { type: 'two-sided', machineWeight: 0 },
            'hammer-row': { type: 'one-sided', machineWeight: 0 }
        };

        // Pin-stack exercises configuration
        // These machines use weight stacks with 5 lb increments
        // Can add micro-plates (1.25, 2.5, or 3.75) on top of the pin
        const PIN_STACK_EXERCISES = {
            'shoulder-press': true,
            'tricep-pushdown': true,
            'lateral-raises': true,
            'overhead-tricep': true,
            'frontal-pulldowns': true,
            'upper-back-row': true,
            'kelso-shrugs': true,
            'leg-extensions': true,
            'calf-raise': true,
            'ab-crunch': true,
            'cable-wrist-curls': true,
            'reverse-wrist-curls': true
        };

        const DEFAULT_DAY_1_EXERCISES = [
            // Torso
            { id: 'chest-flies', name: 'Chest Flies', category: 'Torso', type: 'standard', order: 0 },
            { id: 'incline-chest-press', name: 'Incline Chest Flies', category: 'Torso', type: 'standard', order: 1 },
            { id: 'hammer-row', name: 'Seated Row Machine', category: 'Torso', type: 'standard', order: 2 },
            { id: 'overhead-tricep', name: 'Weighted Dips', category: 'Torso', type: 'standard', order: 3 },
            { id: 'frontal-pulldowns', name: 'Frontal Plane Pulldowns', category: 'Torso', type: 'standard', order: 4 },
            { id: 'upper-back-row', name: 'Upper Back Row Machine', category: 'Torso', type: 'standard', order: 5 },
            { id: 'kelso-shrugs', name: 'Kelso Shrugs', category: 'Torso', type: 'standard', order: 6 },
            { id: 'shoulder-press', name: 'Shoulder Press Machine', category: 'Torso', type: 'standard', order: 7 },
            // Cardio
            // { id: 'stairmaster', name: 'Stairmaster', category: 'Cardio', type: 'stairmaster', order: 8 },
        ];

        const DEFAULT_DAY_2_EXERCISES = [
            // Limbs
            { id: 'preacher-curls', name: 'Preacher Curls', category: 'Limbs', type: 'standard', order: 0 },
            { id: 'tricep-pushdown', name: 'Cuffed Tricep Pushdown', category: 'Limbs', type: 'standard', order: 1 },
            { id: 'lateral-raises', name: 'Lateral Raises', category: 'Limbs', type: 'standard', order: 2 },
            { id: 'reverse-wrist-curls', name: 'Reverse Wrist Curls', category: 'Limbs', type: 'standard', order: 3 },
            { id: 'cable-wrist-curls', name: 'Cable Wrist Curls', category: 'Limbs', type: 'standard', order: 4 },
            { id: 'ab-crunch', name: 'Ab Crunch Machine', category: 'Limbs', type: 'standard', order: 5 },
            { id: 'calf-raise', name: 'Seated Calf Raise Machine', category: 'Limbs', type: 'standard', order: 6 },
            { id: 'leg-extensions', name: 'Hip Adduction', category: 'Limbs', type: 'standard', order: 7 },
            { id: 'leg-curls', name: 'Stiff Legged Deadlifts', category: 'Limbs', type: 'standard', order: 8 },
            { id: 'hip-adduction', name: 'Pendulum Squats', category: 'Limbs', type: 'standard', order: 9 },
            // Cardio
            // { id: 'stairmaster', name: 'Stairmaster', category: 'Cardio', type: 'stairmaster', order: 10 },
        ];
