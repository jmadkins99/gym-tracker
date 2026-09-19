// What this test covers
// ----------------------
// The public twin of case 111: a reload puts the open card back — same day,
// same deck position, still open — and it is still timed from the ORIGINAL
// swipe up. Phones reload a backgrounded tab on their own between sets, and
// before this the page came back on card one of the default day, shut, and
// the swipe needed to reach LOG re-stamped the start.
//
// The same five rules as 111:
//   1. Log card one, then open card three on the NON-default day, reload: the
//      day, the position and the reveal come back, and logging writes the
//      original stamp as startedAt.
//   2. After that log there is no anchor, so a reload opens nothing.
//   3. Walking away from an open card drops its anchor.
//   4. An anchor for a movement already logged today is not resumed.
//   5. Yesterday's anchor is not resumed.
//
// Public-specific: the day is a number picked from the client's weekday
// schedule by an effect that runs after hydration. A restore that only set the
// day would be overwritten by that effect a moment later, which (1) catches.
//
// To verify this test is real: delete the restoreOpenCard(...) call in
// App.jsx's hydration. (1) fails on the day pill.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, waitFor } = require('../lib/browser');
const { seedPublicApp } = require('../lib/state');
const { PUBLIC_APP_ROOT } = require('../lib/paths');
const { goToCardById, revealCard, isRevealed, logCard, logCardById, deckPosition,
        startAnchors, selectDeckDay } = require('../lib/deck');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';
const GAP_MS = 1100;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Day 1 on today's weekday, day 2 on every other, so "the other day" is always 2.
function schedule() {
    const today = DAY_NAMES[new Date().getDay()];
    return {
        version: 2, scheduleIsExplicit: true, totalWorkoutDays: 2,
        workoutDays: DAY_NAMES.map(dayOfWeek => ({ dayOfWeek, workoutDayNumber: dayOfWeek === today ? 1 : 2 })),
    };
}

const ROSTER = {
    1: ['a1', 'a2', 'a3', 'a4', 'a5'],
    2: ['p1', 'p2', 'p3', 'p4', 'p5'],
};

function config() {
    const mk = (day, cat) => ROSTER[day].map((id, order) => ({
        id, name: cat + ' ' + (order + 1), category: cat, order,
        typeId: 'standard', type: 'standard', sets: 1, minReps: 5, maxReps: 8,
    }));
    return {
        version: 2, categories: ['Front', 'Back'], minimalistPrTracking: true,
        repsDropdown: { min: 5, max: 8 },
        days: { 1: mk(1, 'Front'), 2: mk(2, 'Back') },
    };
}

// One earlier session so every card has a weight to log.
function history() {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setHours(9, 0, 0, 0);
    return [1, 2].map(day => ({
        date: new Date(d.getTime() + day * 3600000).toISOString(), day, week: 1, submitted: true, plateauBusters: [],
        exercises: ROSTER[day].map(id => ({ id, name: id, type: 'standard', weight: '100', reps: '6', minReps: 5, maxReps: 8 })),
    }));
}

const activeCardId = (page) => page.evaluate(() => {
    const card = document.querySelector('.deck-slot:not([aria-hidden="true"]) .card[data-exercise-id]');
    return card ? card.getAttribute('data-exercise-id') : null;
});

const activeDay = (page) => page.evaluate(() => {
    const pill = document.querySelector('.day-pill.active');
    return pill ? pill.getAttribute('data-day-type') : null;
});

const todayRecord = (page, day) => page.evaluate((ns, day) => {
    const h = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]');
    const today = new Date().toDateString();
    return h.find(w => new Date(w.date).toDateString() === today && w.day === day) || null;
}, NS, day);

async function reload(page) {
    await page.reload({ waitUntil: 'networkidle0' });
    await waitForApp(page);
    await new Promise(r => setTimeout(r, 300));
}

async function seedAnchor(page, id, dateString) {
    await page.evaluate((ns, id, date) => {
        localStorage.setItem(ns + 'exerciseStartTimes', JSON.stringify({
            date, times: { [id]: new Date().toISOString() },
        }));
    }, NS, id, dateString);
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPublicApp(page, { exerciseConfig: config(), workoutHistory: history(), schedule: schedule() });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
            localStorage.setItem(ns + 'hasSeenTutorial', 'true');
        }, NS);
        await reload(page);
        eq(await activeDay(page), '1', 'a fresh load shows today\'s scheduled day, 1');

        // === 1. Log card one of day 2, open card three, reload ============
        const target = ROSTER[2][2];
        await selectDeckDay(page, 2);
        ok(await logCardById(page, ROSTER[2][0]), 'logged card one of day 2 first, as mid-session');
        await goToCardById(page, target);
        await revealCard(page);
        ok(await isRevealed(page), `opened ${target}`);
        const anchor = (await startAnchors(page, NS))[target];
        ok(anchor, 'the swipe up stamped an anchor');

        await new Promise(r => setTimeout(r, GAP_MS));
        await reload(page);

        eq(await activeDay(page), '2', 'after the reload the day pill is back on the card\'s day');
        eq(await deckPosition(page), '3 of 5', 'the deck is back on card three');
        eq(await activeCardId(page), target, `and that card is ${target}`);
        ok(await isRevealed(page), 'and it is still open — no second swipe needed');
        eq((await startAnchors(page, NS))[target], anchor, 'the anchor is the original stamp');

        await revealCard(page);
        eq((await startAnchors(page, NS))[target], anchor, 'swiping up on the restored card changes nothing');

        ok(await logCard(page), `logged ${target}`);
        await waitFor(page, `${target} to reach history`, (ns, id) => {
            const h = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]');
            return h.some(w => w.exercises.some(e => e.id === id && e.loggedAt));
        }, NS, target);
        const logged = (await todayRecord(page, 2)).exercises.find(e => e.id === target);
        eq(logged.startedAt, anchor, 'the log is timed from the swipe BEFORE the reload');
        ok(new Date(logged.loggedAt) - new Date(logged.startedAt) >= GAP_MS,
            'so the duration includes the time spanning the reload');

        // === 2. After a log, a reload opens nothing =======================
        eq(Object.keys(await startAnchors(page, NS)), [], 'logging dropped the anchor');
        await reload(page);
        eq(await isRevealed(page), false, 'with no anchor, nothing is reopened');
        eq(await activeDay(page), '1', 'and the day is the ordinary default');

        // === 3. Walking away from an open card drops its anchor ===========
        await selectDeckDay(page, 2);
        await goToCardById(page, ROSTER[2][3]);
        await revealCard(page);
        ok((await startAnchors(page, NS))[ROSTER[2][3]], `${ROSTER[2][3]} is anchored while open`);
        await goToCardById(page, ROSTER[2][4]);
        await waitFor(page, 'the left card\'s anchor to be dropped', (ns, id) => {
            const raw = JSON.parse(localStorage.getItem(ns + 'exerciseStartTimes') || 'null');
            return !raw || !raw.times || !raw.times[id];
        }, NS, ROSTER[2][3]);
        await reload(page);
        eq(await isRevealed(page), false, 'a card you walked away from is not reopened');
        eq(await activeDay(page), '1', 'and the day is not dragged back to it');

        // === 4. An anchor for a movement already logged today =============
        await seedAnchor(page, target, await page.evaluate(() => new Date().toDateString()));
        await reload(page);
        eq(await isRevealed(page), false, 'an anchor for an already-logged movement is not resumed');
        eq(await activeDay(page), '1', 'and does not switch the day');

        // === 5. Yesterday's anchor ========================================
        await seedAnchor(page, ROSTER[2][1], await page.evaluate(() => {
            const d = new Date(); d.setDate(d.getDate() - 1); return d.toDateString();
        }));
        await reload(page);
        eq(await isRevealed(page), false, 'yesterday\'s anchor is not resumed');
        eq(await activeDay(page), '1', 'and does not switch the day');

        eq(errors, [], 'no console errors');
        console.log('PASS: the public open card survives a reload with its original start time.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
