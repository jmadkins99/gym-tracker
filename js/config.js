        // Week 1 default weights
        const WEEK_1_DEFAULTS = {
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
            'chest-flies': 1.25,
            'incline-chest-press': 5,
            'leg-curls': 5,
            'shoulder-press': 2.5,
            'preacher-curls': 2.5,
            'tricep-pushdown': 2.5,
            'lateral-raises': 2.5,
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
            'incline-chest-press': { type: 'two-sided', machineWeight: 0 },
            'hammer-row': { type: 'one-sided', machineWeight: 0 }
        };

        // Pin-stack exercises configuration
        // These machines use weight stacks with 5 lb increments
        // Can add micro-plates (1.25, 2.5, or 3.75) on top of the pin
        // Value `true`     — plain pin stack, no cap
        // Value `{ maxPin, overflowPlateMode }` — pin stack with a hard cap;
        //   weights above `maxPin` show "pin at max + plate breakdown" for the
        //   excess. overflowPlateMode is 'one-sided' or 'two-sided'.
        const PIN_STACK_EXERCISES = {
            'chest-flies': true,
            'shoulder-press': true,
            'tricep-pushdown': true,
            'lateral-raises': true,
            'frontal-pulldowns': true,
            'upper-back-row': true,
            'kelso-shrugs': { maxPin: 200, overflowPlateMode: 'one-sided' },
            'leg-extensions': true,
            'calf-raise': true,
            'ab-crunch': true,
            'cable-wrist-curls': { maxPin: 97.5, overflowPlateMode: 'one-sided' },
            'reverse-wrist-curls': true
        };

        const DEFAULT_EXERCISES = [
            { id: 'lateral-raises',      name: 'Lateral Raises',           category: 'Full Body', type: 'standard', order: 0 },
            { id: 'reverse-wrist-curls', name: 'Reverse Wrist Curls',      category: 'Full Body', type: 'standard', order: 1 },
            { id: 'cable-wrist-curls',   name: 'Cable Wrist Curls',        category: 'Full Body', type: 'standard', order: 2 },
            { id: 'preacher-curls',      name: 'Preacher Curls',           category: 'Full Body', type: 'standard', order: 3 },
            { id: 'tricep-pushdown',     name: 'Tricep Extensions',        category: 'Full Body', type: 'standard', order: 4 },
            { id: 'chest-flies',         name: 'Chest Flies',              category: 'Full Body', type: 'standard', order: 5 },
            { id: 'incline-chest-press', name: 'Incline Chest Press',      category: 'Full Body', type: 'standard', order: 6 },
            { id: 'hammer-row',          name: 'Sagittal Plane Pulldowns', category: 'Full Body', type: 'standard', order: 7 },
            { id: 'frontal-pulldowns',   name: 'Frontal Plane Pulldowns',  category: 'Full Body', type: 'standard', order: 8 },
            { id: 'upper-back-row',      name: 'Transverse Plane Rows',    category: 'Full Body', type: 'standard', order: 9 },
            { id: 'kelso-shrugs',        name: 'Kelso Shrugs',             category: 'Full Body', type: 'standard', order: 10 },
            { id: 'shoulder-press',      name: 'Shoulder Press',           category: 'Full Body', type: 'standard', order: 11 },
            { id: 'ab-crunch',           name: 'Ab Crunches',              category: 'Full Body', type: 'standard', order: 12 },
            { id: 'calf-raise',          name: 'Calf Raises',              category: 'Full Body', type: 'standard', order: 13 },
            { id: 'leg-extensions',      name: 'Hip Adduction',            category: 'Full Body', type: 'standard', order: 14 },
            { id: 'leg-curls',           name: 'Stiff Legged Deadlifts',   category: 'Full Body', type: 'standard', order: 15 },
            { id: 'hip-adduction',       name: 'Pendulum Squats',          category: 'Full Body', type: 'standard', order: 16 }
        ];
