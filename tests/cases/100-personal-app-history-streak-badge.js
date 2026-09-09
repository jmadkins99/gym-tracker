// What this test covers
// ----------------------
// What History's PR badge SAYS once an entry sits on a run. The badge itself is
// case 89's subject — when it appears, and against which baseline. This one is
// only about its text:
//
//   a lone PR                  🔥 PR   (unchanged, and that is the point)
//   the second in a row        🔥 2
//   the third in a row         🔥 3
//
// The number is the same flame pill the Workout card wears, so one streak is
// never described two ways: the newest History row and the card for that lift
// are asserted to read the same string.
//
// Recline Curls run the user's own example — 100, 95, 105, then 110 and 115.
// The 105 broke nothing and started nothing, so its row still reads "PR"; only
// once 110 lands does a count appear.
//
// The wrong answer worth naming is reading every row against TODAY. getPRStreak
// walks back from the present, which is right for a card and wrong for a
// ledger: borrow it here and all three Recline Curls rows read "🔥 3", because
// the run they are all part of is three long as of now. Each row has to be
// counted as of its own day, which is what getPRStreakInWorkout does.
//
// Kelso Shrugs cover the restart: 100, 105, 105, 110, 115. The repeat ends the
// first run, so 110 is a lone PR again ("PR", not "3") and 115 reads 2.
//
// Preacher Curls are the control — five flat sessions, no badge on any row.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { ACTIVE, bottomNav, goToCardById, revealCard } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const BADGE_BORDER = 'rgb(212, 175, 55)';

// Monday of last week, plus `dayOffset` days. Every session is anchored to one
// Monday rather than counted back in "days ago" because the app restamps each
// workout's `week` from its date on load and History shows one week at a time:
// a rolling ten-day window would straddle two week screens on some weekdays and
// not others. Last week rather than this one so all five fit whatever day the
// suite runs on.
function lastWeek(dayOffset) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day) - 7 + dayOffset);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
}

const CURLS = 'Recline Curls';
const SHRUGS = 'Kelso Shrugs';
const PREACHER = 'Preacher Curls';

// One row per session, oldest first. The History screen renders them newest
// first, which is the order EXPECTED below is written in.
const SESSIONS = [
    { curls: '100', shrugs: '100' },
    { curls: '95',  shrugs: '105' },
    { curls: '105', shrugs: '105' },
    { curls: '110', shrugs: '110' },
    { curls: '115', shrugs: '115' },
];

// Newest first, mirroring the History screen.
const EXPECTED = [
    { curls: '🔥 3', shrugs: '🔥 2' },
    { curls: '🔥 2', shrugs: '🔥 PR' },
    { curls: '🔥 PR', shrugs: null },
    { curls: null,   shrugs: '🔥 PR' },
    { curls: null,   shrugs: null },
];

function buildHistory() {
    return SESSIONS.map((s, i) => workoutEntry({
        date: lastWeek(i),
        day: 'posterior',
        submitted: true,
        exercises: [
            { id: 'curls-shoulder-extension', name: CURLS, weight: s.curls, reps: '4' },
            { id: 'kelso-shrugs', name: SHRUGS, weight: s.shrugs, reps: '3' },
            { id: 'preacher-curls', name: PREACHER, weight: '60', reps: '4' },
        ],
    }));
}

// Every History entry on screen, newest first, as { name -> badge }.
async function readHistory(page) {
    return page.evaluate(() => Array.from(document.querySelectorAll('.history-item')).map((item) => {
        const rows = {};
        item.querySelectorAll('.history-exercise').forEach((row) => {
            const name = row.querySelector('.history-exercise-name');
            if (!name) return;
            const badge = row.querySelector('[data-pr-badge]');
            rows[name.textContent.trim()] = {
                text: badge ? badge.textContent.trim() : null,
                streakAttr: badge ? badge.getAttribute('data-streak') : null,
                border: badge ? getComputedStyle(badge).borderTopColor : null,
                className: badge ? badge.className : null,
            };
        });
        return rows;
    }));
}

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
        await seedPersonalApp(page, { workoutHistory: buildHistory() });
        await page.evaluate(() => localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'posterior');

        eq(await readCardBadge(page, 'curls-shoulder-extension'), '🔥 3',
            'the card counts the Recline Curls run at three');
        eq(await readCardBadge(page, 'kelso-shrugs'), '🔥 2',
            'the card counts the Kelso Shrugs run at two, the repeat having ended the first');
        eq(await readCardBadge(page, 'preacher-curls'), null,
            'five flat sessions earn no card badge');

        // The seeded week is last week's, so History opens on the current
        // (empty) week and has to be stepped back one.
        await bottomNav(page, 'History');
        await page.evaluate(() => {
            const prev = Array.from(document.querySelectorAll('.week-nav-btn'))
                .find(b => b.textContent.indexOf('Prev') !== -1);
            if (prev && !prev.disabled) prev.click();
        });
        await page.waitForSelector('.history-item', { timeout: 8000 });

        const items = await readHistory(page);
        eq(items.length, SESSIONS.length, 'History shows all five seeded sessions');

        EXPECTED.forEach((want, i) => {
            const age = i === 0 ? 'newest' : `${i} session(s) back`;
            eq(items[i][CURLS].text, want.curls,
                `Recline Curls, ${age}: badge reads the run as of that session`);
            eq(items[i][SHRUGS].text, want.shrugs,
                `Kelso Shrugs, ${age}: badge reads the run as of that session`);
            eq(items[i][PREACHER].text, null,
                `Preacher Curls, ${age}: a flat session never badges`);
        });

        // The counted badge is the card's pill, not a second thing that happens
        // to say a number: same container class, same gold outline, and the
        // count is on data-streak exactly as the card puts it there.
        const newest = items[0][CURLS];
        ok(newest.className.includes('streak-badge'),
            'the counted History badge reuses the streak-badge container class');
        eq(newest.border, BADGE_BORDER, 'the counted History badge keeps the shared gold border');
        eq(newest.streakAttr, '3', 'the counted History badge carries the count on data-streak');
        eq(items[2][CURLS].streakAttr, null,
            'a lone PR is not a run, so its badge carries no data-streak');

        eq(errors, [], 'no console errors');
        console.log('PASS: History PR badges count the run as of each session.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
