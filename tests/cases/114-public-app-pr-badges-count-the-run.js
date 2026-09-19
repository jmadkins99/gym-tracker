// What this test covers
// ----------------------
// The public twin of the personal app's run counts (0bed15e, 5b3e63c). A PR
// badge says "🔥 PR" for a lone improvement and "🔥 N" once the run is two or
// more, on all three surfaces that badge a logged set:
//
//   1. History rows — counted as of THAT entry, not today, so an older row in
//      a run keeps the number it earned on the day and the newest row agrees
//      with the card.
//   2. The logged card, counting the set just logged.
//   3. Submit Day's timing rows.
//
// getPRStreakInWorkout is checked directly first, on the example from the
// personal app's commit: 100, 95, 105 reads a lone PR on the 105 and nothing
// on the 95; a following 110 reads 2; a repeat breaks the run, so a later
// improvement starts again at 1.
//
// To verify this test is real: make the badge text always '🔥 PR'. Every "🔥 2"
// assertion fails; the lone-PR assertions still pass, so the run and the lone
// case are told apart.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPublicApp } = require('../lib/state');
const { PUBLIC_APP_ROOT } = require('../lib/paths');
const { ACTIVE, bottomNav, goToCardById, logCard, revealCard, submitDay } = require('../lib/deck');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';

const dayOffset = (days, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};

function config() {
    return {
        version: 2,
        categories: ['Push'],
        minimalistPrTracking: true,
        days: {
            1: [
                { id: 'chest', name: 'Chest Press', category: 'Push', order: 0, type: 'standard', minReps: 5, maxReps: 8 },
                { id: 'incline', name: 'Incline Press', category: 'Push', order: 1, type: 'standard', minReps: 5, maxReps: 8 },
            ],
        },
    };
}

const SCHEDULE = {
    version: 2,
    scheduleIsExplicit: true,
    totalWorkoutDays: 1,
    workoutDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        .map(dayOfWeek => ({ dayOfWeek, workoutDayNumber: 1 })),
};

const session = (daysAgo, chest, incline) => ({
    date: dayOffset(-daysAgo, 9), day: 1, week: 1, submitted: true, plateauBusters: [],
    exercises: [
        { id: 'chest', name: 'Chest Press', category: 'Push', type: 'standard', weight: '100', reps: chest, minReps: 5, maxReps: 8 },
        { id: 'incline', name: 'Incline Press', category: 'Push', type: 'standard', weight: '100', reps: incline, minReps: 5, maxReps: 8 },
    ],
});

// Chest Press: 5 -> 6 is a lone PR three days ago, so today's 7 makes it 2.
// Incline Press: flat at 5, so today's 6 is a lone PR.
const HISTORY = [session(3, '6', '5'), session(6, '5', '5')];

async function enterSet(page, id, weight, reps) {
    await goToCardById(page, id);
    await revealCard(page);
    await page.evaluate((sel, w, r) => {
        const card = document.querySelector(sel);
        const input = card.querySelector('input[type="number"][inputmode="decimal"]');
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, w);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const reps = card.querySelector('select[data-field="reps"]') ||
            card.querySelector('input[type="number"][inputmode="numeric"]');
        const proto = reps.tagName === 'SELECT' ? window.HTMLSelectElement : window.HTMLInputElement;
        Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(reps, r);
        reps.dispatchEvent(new Event(reps.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    }, ACTIVE, weight, reps);
    await new Promise(r => setTimeout(r, 120));
}

// Every History entry, newest first, as [name, badge text, data-streak].
// History pages by week and the seeded sessions straddle a week boundary on
// some weekdays, so this walks back with Prev until it runs out, then returns
// to the current week.
async function readHistory(page) {
    const readWeek = () => page.evaluate(() =>
        Array.from(document.querySelectorAll('.history-item')).map(item =>
            Array.from(item.querySelectorAll('.history-exercise')).map(row => {
                const b = row.querySelector('[data-pr-badge]');
                return [row.querySelector('.history-exercise-name').textContent.trim(),
                    b ? b.textContent.trim() : null,
                    b ? b.getAttribute('data-streak') : null];
            })));
    const clickNav = (label) => page.evaluate((label) => {
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.includes(label));
        if (!btn || btn.disabled) return false;
        btn.click();
        return true;
    }, label);
    const all = [...await readWeek()];
    let back = 0;
    while (back < 4 && await clickNav('Prev')) {
        back++;
        await new Promise(r => setTimeout(r, 150));
        all.push(...await readWeek());
    }
    for (let i = 0; i < back; i++) {
        await clickNav('Next');
        await new Promise(r => setTimeout(r, 150));
    }
    return all;
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // --- The helper itself --------------------------------------------
        await page.waitForFunction(() => typeof getPRStreakInWorkout === 'function', { timeout: 8000 });
        const counts = await page.evaluate(() => {
            const w = (d, weight, reps) => ({
                date: '2026-08-0' + d + 'T09:00:00.000Z', submitted: true,
                exercises: [{ id: 'x', type: 'standard', weight, reps }],
            });
            // Oldest first: 100, 95, 105, 110, 110 (repeat), 115.
            const h = [w(1, '100', '5'), w(2, '95', '5'), w(3, '105', '5'),
                       w(4, '110', '5'), w(5, '110', '5'), w(6, '115', '5')];
            return h.map(s => getPRStreakInWorkout(s.exercises[0], s, h));
        });
        eq(counts, [0, 0, 1, 2, 0, 1],
            'counted as of each session: a drop is 0, 105 is a lone PR, 110 makes 2, ' +
            'a repeat breaks it, and 115 starts again at 1');

        await seedPublicApp(page, { exerciseConfig: config(), workoutHistory: HISTORY, schedule: SCHEDULE });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
            localStorage.setItem(ns + 'hasSeenTutorial', 'true');
        }, NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // --- The logged card -----------------------------------------------
        await enterSet(page, 'chest', '100', '7');
        ok(await logCard(page, { settle: 250, waitForAutoAdvance: false }), 'logged Chest Press');
        const chestCard = await page.evaluate((sel) => {
            const b = document.querySelector(sel + ' [data-logged-pr-badge]');
            return b ? [b.textContent.trim(), b.getAttribute('data-streak')] : null;
        }, ACTIVE);
        eq(chestCard, ['🔥 2', '2'], 'the logged card counts the run the set just extended');
        await page.waitForFunction((sel) => {
            const c = document.querySelector(sel + ' .card[data-exercise-id]');
            return c && c.getAttribute('data-exercise-id') !== 'chest';
        }, { timeout: 5000 }, ACTIVE);

        await enterSet(page, 'incline', '100', '6');
        ok(await logCard(page, { settle: 250, waitForAutoAdvance: false }), 'logged Incline Press');
        const inclineCard = await page.evaluate((sel) => {
            const b = document.querySelector(sel + ' [data-logged-pr-badge]');
            return b ? [b.textContent.trim(), b.getAttribute('data-streak')] : null;
        }, ACTIVE);
        eq(inclineCard, ['🔥 PR', null], 'a lone PR still reads PR, with no count');
        await new Promise(r => setTimeout(r, 2500));

        // --- History, before Submit Day ------------------------------------
        await bottomNav(page, 'History');
        await page.waitForSelector('.history-item', { timeout: 8000 });
        const before = await readHistory(page);
        eq(before, [
            [['Chest Press', '🔥 2', '2'], ['Incline Press', '🔥 PR', null]],
            [['Chest Press', '🔥 PR', null], ['Incline Press', null, null]],
            [['Chest Press', null, null], ['Incline Press', null, null]],
        ], 'History counts each row as of its own entry: today reads 2, three days ago keeps its lone PR');

        // --- Submit Day ------------------------------------------------------
        await bottomNav(page, 'Workout');
        ok(await submitDay(page), 'Submit Day clicked');
        await page.waitForSelector('[data-timing-row]', { timeout: 8000 });
        const rows = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-timing-row]')).map(row => {
                const b = row.querySelector('[data-day-breakdown-pr-badge]');
                return [row.getAttribute('data-timing-row'),
                    b ? b.textContent.trim() : null, b ? b.getAttribute('data-streak') : null];
            }));
        eq(rows, [['chest', '🔥 2', '2'], ['incline', '🔥 PR', null]],
            'Submit Day counts the same run History does');

        await page.evaluate(() => {
            const close = Array.from(document.querySelectorAll('button'))
                .find(b => /^Close$/i.test(b.textContent.trim()));
            if (close) close.click();
        });
        await new Promise(r => setTimeout(r, 250));
        await bottomNav(page, 'History');
        eq(await readHistory(page), before, 'submitting the day changes no badge in History');

        eq(errors, [], 'no console errors');
        console.log('PASS: public PR badges count the run on History, the logged card and Submit Day.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
