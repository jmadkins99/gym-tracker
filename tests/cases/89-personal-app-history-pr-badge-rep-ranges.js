// What this test covers
// ----------------------
// History's "🔥 PR" badge is a range-top marker, not the same thing as the
// workout-card streak number. The card streak intentionally counts any
// improvement; History only labels submitted standard rows that hit the top of
// that exercise's rep range.
//
// Reverse/Cable Wrist Curls are the regression surface because their standard
// rep range is 5-8 while nearly every other weighted exercise is 3-6:
//
//   Reverse Wrist Curls  30x5 -> 30x6  card streak yes, History PR no
//   Cable Wrist Curls    90x7 -> 90x8  card streak yes, History PR yes
//   Kelso Shrugs        190x5 -> 190x6 card streak yes, History PR yes
//   Preacher Curls       55x4 -> 55x5  History PR no under the normal 3-6 range

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { ACTIVE, bottomNav, goToCardById, revealCard } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const dayOffset = (days, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};

const EXERCISES = [
    ['kelso-shrugs', 'Kelso Shrugs'],
    ['preacher-curls', 'Preacher Curls'],
    ['reverse-wrist-curls', 'Reverse Wrist Curls'],
    ['cable-wrist-curls', 'Cable Wrist Curls'],
];

const BASELINE = workoutEntry({
    date: dayOffset(-4, 9),
    day: 'posterior',
    submitted: true,
    exercises: [
        { id: 'kelso-shrugs', name: 'Kelso Shrugs', weight: '190', reps: '5' },
        { id: 'preacher-curls', name: 'Preacher Curls', weight: '55', reps: '4' },
        { id: 'reverse-wrist-curls', name: 'Reverse Wrist Curls', weight: '30', reps: '5' },
        { id: 'cable-wrist-curls', name: 'Cable Wrist Curls', weight: '90', reps: '7' },
    ],
});

const LATEST = workoutEntry({
    date: dayOffset(-2, 9),
    day: 'posterior',
    submitted: true,
    exercises: [
        { id: 'kelso-shrugs', name: 'Kelso Shrugs', weight: '190', reps: '6' },
        { id: 'preacher-curls', name: 'Preacher Curls', weight: '55', reps: '5' },
        { id: 'reverse-wrist-curls', name: 'Reverse Wrist Curls', weight: '30', reps: '6' },
        { id: 'cable-wrist-curls', name: 'Cable Wrist Curls', weight: '90', reps: '8' },
    ],
});

async function readCardBadge(page, exerciseId) {
    await goToCardById(page, exerciseId);
    await revealCard(page);
    return page.evaluate((sel) => {
        const badge = document.querySelector(sel + ' .streak-badge');
        return badge ? badge.textContent.trim() : null;
    }, ACTIVE);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [LATEST, BASELINE] });
        await page.evaluate(() => localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'posterior');

        eq(await readCardBadge(page, 'reverse-wrist-curls'), '🔥 1',
            'card streak still counts wrist-curl rep progress below 8 as an improvement');
        eq(await readCardBadge(page, 'cable-wrist-curls'), '🔥 1',
            'card streak also counts the wrist-curl top-range session as an improvement');
        eq(await readCardBadge(page, 'kelso-shrugs'), '🔥 1',
            'normal 3-6 exercise still gets the same card streak behavior');

        await bottomNav(page, 'History');
        await page.waitForSelector('.history-item', { timeout: 8000 });

        const historyRows = await page.evaluate((names) => {
            const rows = {};
            const latest = document.querySelector('.history-item');
            if (!latest) return rows;

            latest.querySelectorAll('.history-exercise').forEach((row) => {
                const name = row.querySelector('.history-exercise-name');
                if (!name || !names.includes(name.textContent.trim())) return;

                const badge = row.querySelector('[data-pr-badge]');
                rows[name.textContent.trim()] = {
                    badgeText: badge ? badge.textContent.trim() : null,
                    badgeClass: badge ? badge.className : null,
                    badgeRightOfName: badge ? name.nextElementSibling === badge : false,
                };
            });

            return rows;
        }, EXERCISES.map(([, name]) => name));

        for (const [, name] of EXERCISES) {
            ok(historyRows[name], `History includes ${name}`);
        }

        eq(historyRows['Reverse Wrist Curls'].badgeText, null,
            'History does not show PR at 6 reps for an 8-rep wrist-curl range');
        eq(historyRows['Cable Wrist Curls'].badgeText, '🔥 PR',
            'History shows PR at 8 reps for an 8-rep wrist-curl range');
        eq(historyRows['Kelso Shrugs'].badgeText, '🔥 PR',
            'History still shows PR at 6 reps for the normal 3-6 range');
        eq(historyRows['Preacher Curls'].badgeText, null,
            'History does not show PR at 5 reps for the normal 3-6 range');
        ok(historyRows['Cable Wrist Curls'].badgeClass.includes('streak-badge'),
            'History PR badge reuses the streak-badge container class');
        ok(historyRows['Cable Wrist Curls'].badgeRightOfName,
            'History PR badge sits immediately to the right of the exercise name');

        eq(errors, [], 'no console errors');
        console.log('PASS: History PR badges use exercise-specific top reps while card streaks still count any improvement.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
