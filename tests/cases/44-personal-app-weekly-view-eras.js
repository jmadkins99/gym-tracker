// What this test covers
// ----------------------
// The Weekly tab has to render three eras of workout at once after the
// Lower/Upper switch, and each one has a different rule. This is the guard on
// ~124 real Full Body workouts and every older Cardio session — none of which
// can be re-logged, so a rendering regression here is silent data loss to the
// eye.
//
//   1. A NEW Lower/Upper workout renders against the matching day of the
//      current config — 12 rows for Upper, not all 20. The naive check
//      ("are all this workout's ids in the current exercise list?") is true
//      for BOTH days now that they share one config, so a day-blind
//      implementation pads every Upper day with 8 bogus "NA" Lower rows.
//
//   2. A pre-split FULL BODY workout renders the 19 exercises stored on it,
//      in their stored order — no Stairmaster row bolted on from the new
//      Lower day — but picks up display names the user has since changed.
//      Renaming is by id, so history must follow the rename.
//
//   3. A legacy CARDIO workout still renders its own four movements, three of
//      which (squats, burpees, assault bike) are retired from the active
//      program entirely and exist nowhere in the current config.
//
// The Edit modal shares the same rule, so it is checked on the Upper workout
// too: opening it must offer 12 fields, not 20.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// Stored on the pre-split workout with the display names it had at the time.
// chest-flies and curls-shoulder-extension carry their OLD names on purpose.
const FULL_BODY_ERA = [
    ['preacher-curls', 'Preacher Curls'],
    ['overhead-tricep-extensions', 'Overhead Tricep Extensions'],
    ['lateral-raises', 'Lateral Raises'],
    ['reverse-wrist-curls', 'Reverse Wrist Curls'],
    ['cable-wrist-curls', 'Cable Wrist Curls'],
    ['chest-flies', 'Chest Flies'],
    ['curls-shoulder-extension', 'Curls with Shoulder Extension'],
    ['frontal-pulldowns', 'Frontal Plane Pulldowns'],
    ['incline-chest-press', 'Incline Chest Press'],
    ['upper-back-row', 'Transverse Plane Rows'],
    ['kelso-shrugs', 'Kelso Shrugs'],
    ['hammer-row', 'Sagittal Plane Pulldowns'],
    ['tricep-pushdown', 'Tricep Extensions'],
    ['ab-crunch', 'Ab Crunches'],
    ['shoulder-press', 'Shoulder Press'],
    ['calf-raise', 'Calf Raises'],
    ['leg-extensions', 'Hip Adduction'],
    ['leg-curls', 'Back Extensions'],
    ['hip-adduction', 'Leg Press'],
];

// Same 19 rows, in the same stored order, but with today's names for the two
// the user has since renamed.
const EXPECTED_FULL_BODY_ROWS = FULL_BODY_ERA.map(([id, name]) => {
    if (id === 'curls-shoulder-extension') return 'Recline Curls';
    return name;
});

// The Upper day, in the current DEFAULT_EXERCISES order.
const UPPER_IDS = [
    ['chest-flies', 'Chest Flies'],
    ['curls-shoulder-extension', 'Recline Curls'],
    ['overhead-tricep-extensions', 'Overhead Tricep Extensions'],
    ['lateral-raises', 'Lateral Raises'],
    ['frontal-pulldowns', 'Frontal Plane Pulldowns'],
    ['incline-chest-press', 'Incline Chest Press'],
    ['shoulder-press', 'Shoulder Press'],
    ['upper-back-row', 'Transverse Plane Rows'],
    ['kelso-shrugs', 'Kelso Shrugs'],
    ['hammer-row', 'Sagittal Plane Pulldowns'],
    ['tricep-pushdown', 'Tricep Extensions'],
    ['preacher-curls', 'Preacher Curls'],
];

const EXPECTED_CARDIO_ROWS = [
    'Body Weight Squats', 'Burpee Jump Tucks', 'Stairmaster', 'Assault Bike',
];

async function clickNav(page, label) {
    await page.evaluate((l) => {
        const btn = Array.from(document.querySelectorAll('.nav-btn')).find(b => b.textContent.trim() === l);
        if (btn) btn.click();
    }, label);
    await new Promise(r => setTimeout(r, 300));
}

// Weekly renders one .history-item per workout, newest first. Returns the
// exercise-name rows of each, keyed by the date text so the assertions read
// against a specific workout rather than a positional index.
async function weeklyItems(page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('.history-item')).map(item => ({
            heading: item.querySelector('.history-date')?.textContent?.trim() || '',
            rows: Array.from(item.querySelectorAll('.history-exercise-name')).map(e => e.textContent.trim()),
        })));
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        const history = await page.evaluate((fbEra, upper, cardioRows) => {
            // Three workouts inside the current week so they all land in the
            // default Weekly view. Times are staggered so the ordering is
            // deterministic (Weekly sorts newest first).
            const monday = new Date();
            monday.setHours(0, 0, 0, 0);
            const dow = monday.getDay();
            monday.setDate(monday.getDate() + (dow === 0 ? -6 : 1 - dow));
            const at = (offsetDays, hour) => {
                const d = new Date(monday);
                d.setDate(d.getDate() + offsetDays);
                d.setHours(hour, 0, 0, 0);
                return d.toISOString();
            };

            const std = (id, name) => ({
                id, name, category: 'Full Body', type: 'standard', weight: '100', reps: '5',
            });

            return [
                {
                    date: at(2, 17), day: 'upper', week: 1, submitted: true, plateauBusters: [],
                    exercises: upper.map(([id, name]) => std(id, name)),
                },
                {
                    date: at(1, 17), day: 'cardio', week: 1, submitted: true, plateauBusters: [],
                    exercises: [
                        { id: 'body-weight-squats', name: cardioRows[0], category: 'Cardio', type: 'bodyweight', weight: 'Body Weight', reps: '60' },
                        { id: 'burpee-jump-tucks', name: cardioRows[1], category: 'Cardio', type: 'bodyweight', weight: 'Body Weight', reps: '12' },
                        { id: 'stairmaster', name: cardioRows[2], category: 'Cardio', type: 'stairmaster', level: 'Level 10', time: '6:30' },
                        { id: 'assault-bike', name: cardioRows[3], category: 'Cardio', type: 'assault-bike', watts: '30', intensity: '25/35' },
                    ],
                },
                {
                    date: at(0, 17), day: 'fullbody', week: 1, submitted: true, plateauBusters: [],
                    exercises: fbEra.map(([id, name]) => std(id, name)),
                },
            ];
        }, FULL_BODY_ERA, UPPER_IDS, EXPECTED_CARDIO_ROWS);

        await seedPersonalApp(page, { workoutHistory: history });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, 'gym-local:');
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await clickNav(page, 'Weekly');

        const items = await weeklyItems(page);
        eq(items.length, 3, 'all three workouts render in the current week');

        // Newest first: upper (Wed), cardio (Tue), fullbody (Mon).
        const [upperItem, cardioItem, fullBodyItem] = items;

        // 1. New-era Upper: exactly its own 12, not the whole 20-exercise config.
        eq(upperItem.rows, UPPER_IDS.map(([, name]) => name),
            'an Upper workout renders exactly the 12 Upper movements');
        ok(!upperItem.rows.includes('Leg Press') && !upperItem.rows.includes('Stairmaster'),
            'no Lower movements padded onto the Upper workout');

        // 3. Legacy Cardio, whose movements no longer exist in the config.
        eq(cardioItem.rows, EXPECTED_CARDIO_ROWS,
            'a legacy Cardio workout still renders its four retired movements');

        // 2. Pre-split Full Body: stored layout, current names.
        eq(fullBodyItem.rows, EXPECTED_FULL_BODY_ROWS,
            'a pre-split Full Body workout keeps its 19 stored rows, with renames applied');
        ok(!fullBodyItem.rows.includes('Stairmaster'),
            'the new Lower-day Stairmaster is not bolted onto historical Full Body days');

        // The Edit modal shares the rule.
        await page.evaluate(() => {
            const item = document.querySelectorAll('.history-item')[0];
            item.querySelector('.history-date button').click();
        });
        await new Promise(r => setTimeout(r, 400));
        const editRows = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.modal > div > div'))
                .map(d => d.firstChild?.textContent?.trim())
                .filter(Boolean));
        eq(editRows, UPPER_IDS.map(([, name]) => name),
            'the Edit modal offers the 12 Upper fields, not all 20');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Weekly and Edit render Upper, legacy Cardio, and pre-split Full Body correctly.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
