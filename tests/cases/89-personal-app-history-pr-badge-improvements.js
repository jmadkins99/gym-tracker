// What this test covers
// ----------------------
// History's "🔥 PR" badge mirrors the "PRs Smashed" count from Day Breakdown.
// It is not a range-top marker: it appears when a submitted standard row
// improves on that exercise's previous submitted valid row.
//
// Reverse/Cable Wrist Curls are the regression surface because their standard
// rep range is 5-8 while nearly every other weighted exercise is 3-6. A 6-rep
// wrist-curl improvement should badge here, because "PR" means improvement,
// not "hit the top of the dropdown":
//
//   Reverse Wrist Curls  30x5 -> 30x6  card streak yes, History PR yes
//   Cable Wrist Curls    90x7 -> 90x8  card streak yes, History PR yes
//   Kelso Shrugs        190x5 -> 190x6 card streak yes, History PR yes
//   Preacher Curls       55x4 -> 55x5  card streak yes, History PR yes
//
// The controls catch the old range-top interpretation:
//
//   Transverse Plane Rows 100x6 -> 95x6  top reps, but a weight drop: no PR
//   Frontal Pulldowns             110x6  top reps, but no prior row: no PR

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { ACTIVE, bottomNav, goToCardById, revealCard } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const BADGE_BG = 'rgba(0, 0, 0, 0)';
const BADGE_BORDER = 'rgb(212, 175, 55)';

const dayOffset = (days, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};

const EXERCISES = [
    ['frontal-pulldowns', 'Frontal Plane Pulldowns'],
    ['upper-back-row', 'Transverse Plane Rows'],
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
        { id: 'upper-back-row', name: 'Transverse Plane Rows', weight: '100', reps: '6' },
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
        { id: 'frontal-pulldowns', name: 'Frontal Plane Pulldowns', weight: '110', reps: '6' },
        { id: 'upper-back-row', name: 'Transverse Plane Rows', weight: '95', reps: '6' },
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
        eq(await readCardBadge(page, 'preacher-curls'), '🔥 1',
            'card streak counts normal rep progress below 6 as an improvement');
        eq(await readCardBadge(page, 'cable-wrist-curls'), '🔥 1',
            'card streak also counts the wrist-curl top-range session as an improvement');
        eq(await readCardBadge(page, 'kelso-shrugs'), '🔥 1',
            'normal 3-6 exercise still gets the same card streak behavior');
        eq(await readCardBadge(page, 'upper-back-row'), null,
            'card streak does not count a weight drop, even at top reps');

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
                    badgeBg: badge ? getComputedStyle(badge).backgroundColor : null,
                    badgeBorder: badge ? getComputedStyle(badge).borderTopColor : null,
                    badgeRightOfName: badge ? name.nextElementSibling === badge : false,
                };
            });

            return rows;
        }, EXERCISES.map(([, name]) => name));

        for (const [, name] of EXERCISES) {
            ok(historyRows[name], `History includes ${name}`);
        }

        eq(historyRows['Reverse Wrist Curls'].badgeText, '🔥 PR',
            'History shows PR at 6 reps when an 8-rep-range wrist curl improved');
        eq(historyRows['Cable Wrist Curls'].badgeText, '🔥 PR',
            'History shows PR at 8 reps when an 8-rep-range wrist curl improved');
        eq(historyRows['Kelso Shrugs'].badgeText, '🔥 PR',
            'History shows PR at 6 reps when a normal 3-6 exercise improved');
        eq(historyRows['Preacher Curls'].badgeText, '🔥 PR',
            'History shows PR at 5 reps when a normal 3-6 exercise improved');
        eq(historyRows['Transverse Plane Rows'].badgeText, null,
            'History does not show PR for top reps after a weight drop');
        eq(historyRows['Frontal Plane Pulldowns'].badgeText, null,
            'History does not show PR for top reps without a previous submitted row');
        ok(historyRows['Cable Wrist Curls'].badgeClass.includes('streak-badge'),
            'History PR badge reuses the streak-badge container class');
        eq(historyRows['Cable Wrist Curls'].badgeBg, BADGE_BG,
            'History PR badge uses the shared transparent background');
        eq(historyRows['Cable Wrist Curls'].badgeBorder, BADGE_BORDER,
            'History PR badge uses the shared gold border');
        ok(historyRows['Cable Wrist Curls'].badgeRightOfName,
            'History PR badge sits immediately to the right of the exercise name');

        eq(errors, [], 'no console errors');
        console.log('PASS: History PR badges mirror the Day Breakdown PR definition.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
