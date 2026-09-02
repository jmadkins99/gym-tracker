// What this test covers
// ----------------------
// A card that has been logged but not yet submitted is a review of today's
// saved row. If that saved row is a PR under the same rule as Day Breakdown
// and History, the review shows a gold-outlined "🔥 PR" pill beside the name.
//
// The important distinction is timing:
//   - before LOG: the card may show the numeric submitted-history streak
//   - after LOG, before Submit Day: the logged review shows current-session PR
//     status instead
//
// This case logs through the real UI so it catches the handoff from editable
// inputs to saved workoutHistory rows.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { ACTIVE, deckIndex, goToCardById, revealCard, logCard } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const BADGE_BG = 'rgba(0, 0, 0, 0)';
const BADGE_BORDER = 'rgb(212, 175, 55)';

const dayOffset = (days, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};

const OLDER = workoutEntry({
    date: dayOffset(-4, 9),
    day: 'anterior',
    submitted: true,
    exercises: [
        { id: 'chest-press', name: 'Chest Press', weight: '100', reps: '4' },
        { id: 'incline-chest-press', name: 'Incline Chest Press', weight: '100', reps: '4' },
    ],
});

const PREVIOUS = workoutEntry({
    date: dayOffset(-2, 9),
    day: 'anterior',
    submitted: true,
    exercises: [
        { id: 'chest-press', name: 'Chest Press', weight: '100', reps: '5' },
        { id: 'incline-chest-press', name: 'Incline Chest Press', weight: '100', reps: '5' },
        { id: 'shoulder-press', name: 'Shoulder Press', weight: '120', reps: '5' },
    ],
});

async function enterSet(page, exerciseId, weight, reps) {
    await goToCardById(page, exerciseId);
    await revealCard(page);
    await page.evaluate((sel, w, r) => {
        const card = document.querySelector(sel);

        const input = card.querySelector('input[type="number"][inputmode="decimal"]');
        const inputSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set;
        inputSetter.call(input, w);
        input.dispatchEvent(new Event('input', { bubbles: true }));

        const select = card.querySelector('select[data-field="reps"]');
        const selectSetter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype, 'value').set;
        selectSetter.call(select, r);
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }, ACTIVE, weight, reps);
    await new Promise(r => setTimeout(r, 120));
}

async function readHeader(page, exerciseId) {
    await goToCardById(page, exerciseId);
    await revealCard(page);
    return page.evaluate((sel) => {
        const head = document.querySelector(sel + ' .card-open-head');
        const logged = head?.querySelector('.logged-chip');
        const loggedPR = head?.querySelector('[data-logged-pr-badge]');
        const streak = head?.querySelector('[data-streak]');
        return {
            logged: logged ? logged.textContent.trim() : null,
            loggedPR: loggedPR ? loggedPR.textContent.trim() : null,
            loggedPRClass: loggedPR ? loggedPR.className : null,
            loggedPRBg: loggedPR ? getComputedStyle(loggedPR).backgroundColor : null,
            loggedPRBorder: loggedPR ? getComputedStyle(loggedPR).borderTopColor : null,
            streak: streak ? streak.textContent.trim() : null,
            streakBg: streak ? getComputedStyle(streak).backgroundColor : null,
            streakBorder: streak ? getComputedStyle(streak).borderTopColor : null,
        };
    }, ACTIVE);
}

async function readActiveReview(page) {
    return page.evaluate((sel) => {
        const card = document.querySelector(sel + ' .card[data-exercise-id]');
        const loggedPR = card?.querySelector('[data-logged-pr-badge]');
        return {
            id: card ? card.getAttribute('data-exercise-id') : null,
            className: card ? card.className : null,
            celebrating: !!card?.classList.contains('pr-celebrating'),
            cardAnimation: card ? getComputedStyle(card).animationName : null,
            loggedPR: loggedPR ? loggedPR.textContent.trim() : null,
        };
    }, ACTIVE);
}

async function logSet(page, exerciseId, weight, reps, { settle } = {}) {
    await enterSet(page, exerciseId, weight, reps);
    const clicked = await logCard(page, settle === undefined
        ? undefined
        : { settle, waitForAutoAdvance: false });
    ok(clicked, `${exerciseId}: LOG button clicked`);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [PREVIOUS, OLDER] });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior');

        const before = await readHeader(page, 'chest-press');
        eq(before.streak, '🔥 1',
            'before logging, the card shows the numeric submitted-history streak');
        eq(before.streakBg, BADGE_BG,
            'numeric streak badge uses the shared transparent background');
        eq(before.streakBorder, BADGE_BORDER,
            'numeric streak badge uses the shared gold border');
        eq(before.loggedPR, null,
            'before logging, the current-session PR badge is absent');

        await logSet(page, 'chest-press', '100', '6', { settle: 250 });
        const celebrating = await readActiveReview(page);
        eq(celebrating.id, 'chest-press',
            'a PR log stays on the current logged card before advancing');
        eq(celebrating.celebrating, true,
            'a PR log runs the card celebration class');
        ok((celebrating.cardAnimation || '').includes('prLegendaryAura'),
            'the PR logged card uses the gold legendary aura animation');
        eq(celebrating.loggedPR, '🔥 PR',
            'the held logged card shows the PR badge during the celebration');

        await new Promise(r => setTimeout(r, 1300));
        const lingering = await readActiveReview(page);
        eq(lingering.id, 'chest-press',
            'the PR celebration keeps the logged card visible for the two-second aura hold');
        eq(lingering.celebrating, true,
            'the PR aura is still pulsing before the delayed auto-advance');

        await page.waitForFunction((sel, id) => {
            const card = document.querySelector(sel + ' .card[data-exercise-id]');
            return card && card.getAttribute('data-exercise-id') !== id;
        }, { timeout: 4000 }, ACTIVE, 'chest-press');
        eq(await deckIndex(page), 2,
            'after the celebration, the deck advances to the next unlogged card');

        const improved = await readHeader(page, 'chest-press');
        eq(improved.logged, 'logged', 'the PR row is in the logged review state');
        eq(improved.loggedPR, '🔥 PR',
            'a logged same-weight rep improvement shows the current-session PR badge');
        ok(improved.loggedPRClass.includes('streak-badge'),
            'the logged PR badge reuses the flame badge container');
        eq(improved.loggedPRBg, BADGE_BG,
            'the logged PR badge uses the shared transparent background');
        eq(improved.loggedPRBorder, BADGE_BORDER,
            'the logged PR badge uses the shared gold border');
        eq(improved.streak, null,
            'a logged PR review replaces the numeric pre-session streak');

        await logSet(page, 'incline-chest-press', '100', '5');
        eq(await deckIndex(page), 3,
            'a non-PR log still advances without the PR celebration delay');
        const identical = await readHeader(page, 'incline-chest-press');
        eq(identical.logged, 'logged', 'the identical row is also in review state');
        eq(identical.loggedPR, null,
            'an identical logged row does not show the current-session PR badge');
        eq(identical.streak, null,
            'logged non-PR reviews do not keep showing the stale pre-session streak');

        await logSet(page, 'shoulder-press', '115', '6');
        const weightDrop = await readHeader(page, 'shoulder-press');
        eq(weightDrop.loggedPR, null,
            'top reps after a weight drop is not a logged PR');

        await logSet(page, 'lateral-raises', '50', '6');
        const firstSession = await readHeader(page, 'lateral-raises');
        eq(firstSession.loggedPR, null,
            'top reps on a first-ever submitted-baseline-free row is not a logged PR');

        const saved = await page.evaluate((ns) => {
            const history = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return history.find(w => {
                const d = new Date(w.date);
                d.setHours(0, 0, 0, 0);
                return d.getTime() === today.getTime() && !w.submitted;
            }) || null;
        }, NS);
        ok(saved, 'the checked cards are still in the pre-submit workout');
        eq(saved.submitted, false, 'the day has not been submitted yet');

        eq(errors, [], 'no console errors');
        console.log('PASS: logged card reviews show current-session PR badges only for improvements.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
