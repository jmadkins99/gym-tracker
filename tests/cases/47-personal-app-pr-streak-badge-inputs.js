// What this test covers
// ----------------------
// The PR streak badge, built the way a user actually builds one: by typing a
// weight and picking reps on the card and tapping LOG, seven sessions running.
// Nothing here is seeded into history — if the weight field stops committing,
// or the reps select stops firing onChange, or the badge gets wired to the
// wrong value, this fails.
//
// The row that matters is round 4. Hitting 6 reps makes getSimplePR bump the
// weight and repsDefault reset the dropdown to 4, so the app's own progression
// always looks like a rep regression on the session right after a bump.
// getPRStreak treats any weight increase as extending the streak precisely so
// that bump keeps the run alive; read literally ("reps down breaks it") the
// badge could never climb past 2 and would mean nothing. Flip the `weight up`
// branch of extendsStreak to false and round 4 is what catches it.
//
// The numbers are improvements, not sessions: round 1 establishes the baseline
// and carries no badge, and round 2 — the first session that beats it — reads 1.
//
// Also pins that the badge never lands inside .exercise-name — roughly twenty
// other cases compare that node's textContent to the bare exercise name.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const EXERCISE = 'chest-press';

// React installs its own value setter on the input/select prototypes, so a
// plain `el.value = x` is invisible to it. Same native-setter dance as case 23.
async function enterSet(page, exerciseId, weight, reps) {
    await page.evaluate((id, w, r) => {
        const card = document.querySelector(`[data-exercise-id="${id}"]`);

        const input = card.querySelector('input[type="number"]');
        const inputSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set;
        inputSetter.call(input, w);
        input.dispatchEvent(new Event('input', { bubbles: true }));

        const select = card.querySelector('select[data-field="reps"]');
        const selectSetter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, 'value').set;
        selectSetter.call(select, r);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }, exerciseId, weight, reps);
    await new Promise(r => setTimeout(r, 100));
}

async function logCard(page, exerciseId) {
    await page.evaluate((id) => {
        const card = document.querySelector(`[data-exercise-id="${id}"]`);
        const btn = Array.from(card.querySelectorAll('button')).find(b => /LOG/i.test(b.textContent));
        if (btn) btn.click();
    }, exerciseId);
    await new Promise(r => setTimeout(r, 150));
}

async function submitDay(page) {
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => /Submit Day/i.test(b.textContent));
        if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 250));
}

// completeDay only ever submits *today's* workout, and logExercise rewrites
// `date` to now on every tap, so one browser session can only ever produce one
// dated entry. Backdating the entry we just submitted and reloading is what
// lets a seven-session streak be built through the real UI.
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
    await selectDayType(page, 'anterior');
}

async function readBadge(page, exerciseId) {
    return page.evaluate((id) => {
        const el = document.querySelector(`[data-exercise-id="${id}"] .streak-badge`);
        return el ? el.textContent.trim() : null;
    }, exerciseId);
}

// The most recently backdated entry's values for our exercise, read straight
// out of storage: a badge computed from values the user never entered would
// otherwise look like a pass.
async function readStored(page, exerciseId, daysAgo) {
    return page.evaluate((ns, id, d) => {
        const hist = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]');
        const target = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
        const entry = hist.find(w => w.date.slice(0, 10) === target);
        if (!entry) return null;
        const ex = entry.exercises.find(e => e.id === id);
        return ex ? { weight: ex.weight, reps: ex.reps } : null;
    }, NS, exerciseId, daysAgo);
}

// weight, reps, days-ago to backdate to, expected badge after the reload.
const ROUNDS = [
    { weight: '140', reps: '4', daysAgo: 13, badge: null,   why: 'the first session is a baseline, not an improvement' },
    { weight: '140', reps: '5', daysAgo: 11, badge: '🔥 1', why: 'reps up at the same weight is the first improvement; the badge turns on at 1' },
    { weight: '140', reps: '6', daysAgo: 9,  badge: '🔥 2', why: 'reps up again keeps it climbing' },
    { weight: '145', reps: '4', daysAgo: 7,  badge: '🔥 3', why: 'weight up with reps down STILL extends (the whole rule)' },
    { weight: '145', reps: '5', daysAgo: 5,  badge: '🔥 4', why: 'climbing resumes after the bump' },
    { weight: '145', reps: '5', daysAgo: 3,  badge: null,   why: 'an identical session breaks the streak' },
    { weight: '135', reps: '6', daysAgo: 1,  badge: null,   why: 'a weight drop breaks it even though reps rose' },
];

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate((ns) => localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior');

        for (let i = 0; i < ROUNDS.length; i++) {
            const round = ROUNDS[i];
            const label = `round ${i + 1} (${round.weight}x${round.reps})`;

            await enterSet(page, EXERCISE, round.weight, round.reps);
            await logCard(page, EXERCISE);
            await submitDay(page);
            await backdateAndReload(page, round.daysAgo);

            const stored = await readStored(page, EXERCISE, round.daysAgo);
            ok(stored, `${label}: the session persisted`);
            eq(stored.weight, round.weight, `${label}: stored the typed weight`);
            eq(stored.reps, round.reps, `${label}: stored the picked reps`);

            const badge = await readBadge(page, EXERCISE);
            eq(badge, round.badge, `${label}: ${round.why}`);

            // The badge must be a sibling of .exercise-name, never a child.
            if (round.badge) {
                const name = await page.evaluate((id) => {
                    const el = document.querySelector(`[data-exercise-id="${id}"] .exercise-name`);
                    return el ? el.textContent.trim() : null;
                }, EXERCISE);
                eq(name, 'Chest Press',
                    `${label}: .exercise-name is still the bare name with a badge showing`);
            }
        }

        eq(errors, [], 'no console errors while building the streak');
        console.log('PASS: a PR streak builds through the real weight/reps inputs, survives a weight bump, and breaks on a repeat or a drop.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
