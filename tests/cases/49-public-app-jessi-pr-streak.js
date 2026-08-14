// What this test covers
// ----------------------
// The PR streak badge on the public app, built the way Jessi actually builds
// one: typing a weight and picking reps on the card, tapping LOG, submitting
// the day, five sessions running.
//
// The port is not a copy — the public app is a single file where the
// progression helpers are closures over workoutHistory rather than top-level
// functions, and the gate is the per-user `minimalistPrTracking` setting
// instead of a compile-time constant. This pins that the wiring survived.
//
// Round 4 is the point of the test. getMinimalistPR bumps the weight once you
// hit maxReps, and the next session starts back at minReps — on Jessi's 5-8
// dropdown that is 8 reps down to 5. getPRStreak treats any weight increase as
// extending the streak precisely so the app's own reward for progressing does
// not read as backsliding; without that, no streak here could ever exceed 4.
//
// Also pins that the badge stays a sibling of .exercise-name: several public-app
// cases locate cards by matching that node's textContent exactly, and would all
// break if the badge were nested inside it.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPublicApp, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const { PUBLIC_APP_ROOT } = require('../lib/paths');
const NS = 'gym-local:';
const CARD = 'Chest Flies';

// Jessi-shaped: minimalistPrTracking on (which gates the badge) and gympinMode
// on (which gates the Weight Breakdown button the badge sits beside).
function jessiConfig() {
    return {
        version: 2,
        categories: ['Full Body'],
        minimalistPrTracking: true,
        gympinMode: true,
        days: {
            1: [
                { id: 'jchest', name: 'Chest Flies',         category: 'Full Body', order: 0, type: 'standard', sets: 1, minReps: 6, maxReps: 8 },
                { id: 'jincl',  name: 'Incline Chest Press', category: 'Full Body', order: 1, type: 'standard', sets: 1, minReps: 6, maxReps: 8 },
            ],
        },
    };
}

async function enterSet(page, name, weight, reps) {
    await page.evaluate((n, w, r) => {
        const card = Array.from(document.querySelectorAll('.exercise-card'))
            .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === n);

        const input = card.querySelector('input[inputmode="decimal"]');
        const inputSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set;
        inputSetter.call(input, w);
        input.dispatchEvent(new Event('input', { bubbles: true }));

        const select = card.querySelector('select[data-field="reps"]');
        const selectSetter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, 'value').set;
        selectSetter.call(select, r);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }, name, weight, reps);
    await new Promise(r => setTimeout(r, 100));
}

async function logCard(page, name) {
    await page.evaluate((n) => {
        const card = Array.from(document.querySelectorAll('.exercise-card'))
            .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === n);
        const btn = Array.from(card.querySelectorAll('button')).find(b => /^LOG$/i.test(b.textContent.trim()));
        if (btn) btn.click();
    }, name);
    await new Promise(r => setTimeout(r, 200));
}

async function submitDay(page) {
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => /Submit Day/i.test(b.textContent));
        if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 300));
}

// One browser session can only produce one dated entry, so backdate the entry
// we just submitted and reload between rounds. Every reload happens on the same
// real weekday, so the schedule keeps resolving to the same workout day.
async function backdateAndReload(page, daysAgo) {
    await page.evaluate((ns, d) => {
        const key = ns + 'gymWorkoutHistory';
        const hist = JSON.parse(localStorage.getItem(key) || '[]');
        const latest = hist.find(w => w.submitted && !w.backdated);
        latest.date = new Date(Date.now() - d * 86400000).toISOString();
        latest.backdated = true;
        localStorage.setItem(key, JSON.stringify(hist));
    }, NS, daysAgo);
    await page.reload({ waitUntil: 'networkidle0' });
    await waitForApp(page);
}

async function readBadge(page, name) {
    return page.evaluate((n) => {
        const card = Array.from(document.querySelectorAll('.exercise-card'))
            .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === n);
        if (!card) return { missing: true };
        const el = card.querySelector('.streak-badge');
        return { badge: el ? el.textContent.trim() : null };
    }, name);
}

// Jessi's dropdown runs 5-8, and getMinimalistPR bumps once reps hit maxReps (8).
const ROUNDS = [
    { weight: '100', reps: '6', daysAgo: 11, badge: null,   why: 'a streak of 1 is below PR_STREAK_MIN' },
    { weight: '100', reps: '7', daysAgo: 9,  badge: '🔥 2', why: 'reps up at the same weight extends; badge turns on at 2' },
    { weight: '100', reps: '8', daysAgo: 7,  badge: '🔥 3', why: 'hitting the top of the range keeps it climbing' },
    { weight: '105', reps: '5', daysAgo: 5,  badge: '🔥 4', why: 'the weight bump extends the streak despite reps resetting' },
    { weight: '105', reps: '6', daysAgo: 3,  badge: '🔥 5', why: 'climbing resumes after the bump' },
];

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        await seedPublicApp(page, {
            exerciseConfig: jessiConfig(),
            workoutHistory: [],
            schedule: jessiDefaultSchedule(),
        });
        await page.evaluate((ns) => localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        ok(!(await readBadge(page, CARD)).missing, `the ${CARD} card rendered`);

        for (let i = 0; i < ROUNDS.length; i++) {
            const round = ROUNDS[i];
            const label = `round ${i + 1} (${round.weight}x${round.reps})`;

            await enterSet(page, CARD, round.weight, round.reps);
            await logCard(page, CARD);
            await submitDay(page);
            await backdateAndReload(page, round.daysAgo);

            const stored = await page.evaluate((ns, d) => {
                const hist = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]');
                const target = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
                const entry = hist.find(w => w.date.slice(0, 10) === target);
                if (!entry) return null;
                const ex = entry.exercises.find(e => e.id === 'jchest');
                return ex ? { weight: ex.weight, reps: ex.reps } : null;
            }, NS, round.daysAgo);
            ok(stored, `${label}: the session persisted`);
            eq(stored.weight, round.weight, `${label}: stored the typed weight`);
            eq(stored.reps, round.reps, `${label}: stored the picked reps`);

            const { badge } = await readBadge(page, CARD);
            eq(badge, round.badge, `${label}: ${round.why}`);
        }

        // The badge must not have leaked into .exercise-name — several
        // public-app cases find cards by comparing that string exactly.
        const names = await page.evaluate(() =>
            Array.from(document.querySelectorAll('.exercise-card'))
                .map(c => c.querySelector('.exercise-name')?.textContent?.trim()));
        eq(names, ['Chest Flies', 'Incline Chest Press'],
            '.exercise-name still carries the bare names with a badge showing');

        // Never logged, so never a streak — the badge is per-exercise.
        eq((await readBadge(page, 'Incline Chest Press')).badge, null,
            'an exercise with no history carries no badge');

        eq(errors, [], 'no console errors while building the streak');
        console.log("PASS: Jessi's PR streak builds through the real inputs and survives the weight bump on a 5-8 range.");
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
