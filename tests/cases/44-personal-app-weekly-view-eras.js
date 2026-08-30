// What this test covers
// ----------------------
// The Weekly tab has to render several eras of workout at once after the
// Anterior/Posterior switch, and each one has a different rule. This is the
// guard on ~124 real Full Body workouts, every Aug-2026 Upper/Lower session,
// and every older Cardio session — none of which can be re-logged, so a
// rendering regression here is silent data loss to the eye.
//
//   1. A NEW Anterior/Posterior workout renders against the matching day of
//      the current config — 12 rows for Anterior, not all 21. The naive check
//      ("are all this workout's ids in the current exercise list?") is true
//      for BOTH days now that they share one config, so a day-blind
//      implementation pads every Anterior day with 9 bogus "NA" rows.
//
//   1b. A legacy Aug-2026 UPPER workout takes the other branch. No exercise
//      carries `day: 'upper'` any more, so it renders the 13 rows stored on
//      the workout — what was actually performed — rather than being remapped
//      onto today's Anterior 12. Keeping both a current-era and a legacy
//      workout here is deliberate: relabelling the Upper one would have
//      silently dropped all coverage of the current-config branch.
//
//   1c. An Anterior workout logged BEFORE a movement changed days takes the
//      stored branch too, via the membership half of the gate. See the
//      MIXED_DAY_IDS note below — it is the only shape in this file that
//      exercises that half, and without it a day-blind check goes unnoticed.
//
//   2. A pre-split FULL BODY workout renders the 19 exercises stored on it,
//      in their stored order — no retired row bolted on from the current
//      program — but picks up display names the user has since changed.
//      Renaming is by id, so history must follow the rename.
//
//   3. A legacy CARDIO workout still renders its own four movements, three of
//      which (squats, burpees, assault bike) are retired from the active
//      program entirely and exist nowhere in the current config.
//
// The Edit modal shares the same rule, so it is checked on both an Anterior
// workout (12 fields) and the legacy Upper one (13 fields, not 21).

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

// The Anterior day, in the current DEFAULT_EXERCISES order. A workout stamped
// `day: 'anterior'` renders against the LIVE config, so this list is what the
// current-config branch of getWorkoutExerciseList must produce.
const ANTERIOR_IDS = [
    ['chest-press', 'Chest Press'],
    ['incline-chest-press', 'Incline Chest Press'],
    ['chest-flies', 'Chest Flies'],
    ['shoulder-press', 'Shoulder Press'],
    ['lateral-raises', 'Lateral Raises'],
    ['overhead-tricep-extensions', 'Overhead Tricep Extensions'],
    // Abs and quads moved up ahead of Tricep Extensions and the wrist
    // pair, Aug 2026.
    ['ab-crunch', 'Ab Crunches'],
    ['actual-leg-extensions', 'Leg Extensions'],
    ['tricep-pushdown', 'Tricep Extensions'],
    ['reverse-wrist-curls', 'Reverse Wrist Curls'],
    ['cable-wrist-curls', 'Cable Wrist Curls'],
    ['hip-adduction', 'Leg Press'],
];

// The Aug 2026 Upper day. This is now a LEGACY era: no exercise carries
// `day: 'upper'` any more, so getWorkoutExerciseList falls to its
// stored-exercise branch and must render these 13 rows exactly as performed —
// not today's Anterior 12, and not all 21.
const LEGACY_UPPER_IDS = [
    ['chest-flies', 'Chest Flies'],
    ['incline-chest-press', 'Incline Chest Press'],
    ['curls-shoulder-extension', 'Recline Curls'],
    ['overhead-tricep-extensions', 'Overhead Tricep Extensions'],
    ['chest-press', 'Chest Press'],
    ['lateral-raises', 'Lateral Raises'],
    ['shoulder-press', 'Shoulder Press'],
    ['frontal-pulldowns', 'Frontal Plane Pulldowns'],
    ['upper-back-row', 'Transverse Plane Rows'],
    ['kelso-shrugs', 'Kelso Shrugs'],
    ['hammer-row', 'Sagittal Plane Pulldowns'],
    ['tricep-pushdown', 'Tricep Extensions'],
    ['preacher-curls', 'Preacher Curls'],
];

const EXPECTED_CARDIO_ROWS = [
    'Body Weight Squats', 'Burpee Jump Tucks', 'Stairmaster', 'Assault Bike',
];

// An Anterior workout logged BEFORE one of its movements changed days: 11 of
// today's Anterior ids plus Kelso Shrugs, which is Posterior now. This is what
// the `every(...day === workout.day)` half of the gate in
// getWorkoutExerciseList is for, and the only shape that exercises it.
//
// Both halves of that gate have to be wrong-proofed separately. Drop the
// membership check entirely (`byId.has(e.id)`) and every other workout in this
// file still renders correctly — the ids all happen to sit on their stored day
// — so this row is the one that catches it. Without it a future day
// reassignment silently rewrites the history that straddles it.
const MIXED_DAY_IDS = [
    ['chest-press', 'Chest Press'],
    ['incline-chest-press', 'Incline Chest Press'],
    ['chest-flies', 'Chest Flies'],
    ['shoulder-press', 'Shoulder Press'],
    ['lateral-raises', 'Lateral Raises'],
    ['overhead-tricep-extensions', 'Overhead Tricep Extensions'],
    ['tricep-pushdown', 'Tricep Extensions'],
    ['reverse-wrist-curls', 'Reverse Wrist Curls'],
    ['cable-wrist-curls', 'Cable Wrist Curls'],
    ['ab-crunch', 'Ab Crunches'],
    ['actual-leg-extensions', 'Leg Extensions'],
    // The odd one out — Posterior in the current config.
    ['kelso-shrugs', 'Kelso Shrugs'],
];

async function clickNav(page, label) {
    await page.evaluate((l) => {
        // The nav moved to a bottom bar, and each button now carries an icon
        // glyph beside its label, so this matches on containment rather than
        // an exact trim.
        const btn = Array.from(document.querySelectorAll('.bottom-nav-btn'))
            .find(b => b.textContent.indexOf(l) !== -1);
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

        const history = await page.evaluate((fbEra, anterior, legacyUpper, mixed, cardioRows) => {
            // Four workouts inside the current week so they all land in the
            // default Weekly view. Times are staggered so the ordering is
            // deterministic (Weekly sorts newest first). The two Wednesday
            // entries differ by hour rather than by day: pushing one to
            // Thursday would be a future date whenever the suite runs early in
            // the week.
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
                    date: at(2, 21), day: 'anterior', week: 1, submitted: true, plateauBusters: [],
                    exercises: mixed.map(([id, name]) => std(id, name)),
                },
                {
                    date: at(2, 19), day: 'anterior', week: 1, submitted: true, plateauBusters: [],
                    exercises: anterior.map(([id, name]) => std(id, name)),
                },
                {
                    date: at(2, 17), day: 'upper', week: 1, submitted: true, plateauBusters: [],
                    exercises: legacyUpper.map(([id, name]) => std(id, name)),
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
        }, FULL_BODY_ERA, ANTERIOR_IDS, LEGACY_UPPER_IDS, MIXED_DAY_IDS, EXPECTED_CARDIO_ROWS);

        await seedPersonalApp(page, { workoutHistory: history });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, 'gym-local:');
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await clickNav(page, 'History');

        const items = await weeklyItems(page);
        eq(items.length, 5, 'all five workouts render in the current week');

        // Newest first: mixed-day anterior (Wed 21:00), anterior (Wed 19:00),
        // legacy upper (Wed 17:00), cardio (Tue), fullbody (Mon).
        const [mixedItem, anteriorItem, legacyUpperItem, cardioItem, fullBodyItem] = items;

        // 1. Current-era Anterior renders against the LIVE config: exactly its
        // own 12, not the whole 21-exercise program. This is the branch a
        // day-blind implementation breaks, padding the day with 9 bogus NA rows.
        eq(anteriorItem.rows, ANTERIOR_IDS.map(([, name]) => name),
            'an Anterior workout renders exactly the 12 Anterior movements');
        ok(!anteriorItem.rows.includes('Kelso Shrugs') && !anteriorItem.rows.includes('Calf Raises'),
            'no Posterior movements padded onto the Anterior workout');

        // 1a. An Anterior workout whose stored roster no longer matches the
        // current Anterior day must render what was performed, Kelso Shrugs and
        // all — the membership half of the gate refuses the live-config branch
        // for it. A day-blind check would drop Kelso Shrugs and substitute
        // today's Leg Press, silently rewriting a logged session.
        eq(mixedItem.rows, MIXED_DAY_IDS.map(([, name]) => name),
            'an Anterior workout predating a day reassignment keeps its own stored rows');
        ok(mixedItem.rows.includes('Kelso Shrugs'),
            'the movement that has since moved days is still shown on the workout it was performed in');
        ok(!mixedItem.rows.includes('Leg Press'),
            'and the current-day movement it never contained is not substituted in');

        // 1b. Legacy Upper takes the OTHER branch — no exercise has
        // `day: 'upper'` any more, so it falls back to the 13 rows stored on
        // the workout. It must show what was actually performed, not today's
        // Anterior 12.
        eq(legacyUpperItem.rows, LEGACY_UPPER_IDS.map(([, name]) => name),
            'a legacy Upper workout still renders the 13 movements it was performed with');
        eq(legacyUpperItem.rows.length, 13,
            'the legacy Upper day is 13 rows, not remapped to the current 12');
        ok(!legacyUpperItem.rows.includes('Leg Press') && !legacyUpperItem.rows.includes('Stairmaster'),
            'no movements padded onto the legacy Upper workout');

        // 3. Legacy Cardio, whose movements no longer exist in the config.
        eq(cardioItem.rows, EXPECTED_CARDIO_ROWS,
            'a legacy Cardio workout still renders its four retired movements');

        // 2. Pre-split Full Body: stored layout, current names.
        eq(fullBodyItem.rows, EXPECTED_FULL_BODY_ROWS,
            'a pre-split Full Body workout keeps its 19 stored rows, with renames applied');
        ok(!fullBodyItem.rows.includes('Stairmaster'),
            'the retired Stairmaster is not bolted onto historical Full Body days');

        // The Edit modal shares the rule, on both branches.
        const openEditRows = async (index) => {
            await page.evaluate((i) => {
                const item = document.querySelectorAll('.history-item')[i];
                item.querySelector('.history-date button').click();
            }, index);
            await new Promise(r => setTimeout(r, 400));
            const rows = await page.evaluate(() =>
                Array.from(document.querySelectorAll('.modal > div > div'))
                    .map(d => d.firstChild?.textContent?.trim())
                    .filter(Boolean));
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('.modal button'))
                    .find(b => /Cancel|Close|×/i.test(b.textContent));
                if (btn) btn.click();
            });
            await new Promise(r => setTimeout(r, 300));
            return rows;
        };

        eq(await openEditRows(1), ANTERIOR_IDS.map(([, name]) => name),
            'the Edit modal offers the 12 Anterior fields, not all 21');
        eq(await openEditRows(2), LEGACY_UPPER_IDS.map(([, name]) => name),
            'the Edit modal offers a legacy Upper workout its own 13 fields');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Weekly and Edit render Anterior, legacy Upper, legacy Cardio, and pre-split Full Body correctly.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
