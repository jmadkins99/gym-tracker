// What this test covers
// ----------------------
// The public app uses one PR definition for four visible surfaces:
//
//   1. logged-card "🔥 PR" badges
//   2. the two-second gold celebration before the deck advances
//   3. Submit Day's PR count and row badges
//   4. History's PR badges, which do not wait for Submit Day — today's
//      in-progress entry is already in that list, so the badge lands at LOG
//      time and must still read the same once the day is submitted
//
// Public has more exercise shapes than the personal app. The direct helper
// assertions pin those semantics for standard, bodyweight, cardio, stairmaster
// and assault-bike rows; the UI path then proves the deck, Submit Day and
// History are all wired to that shared helper.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPublicApp } = require('../lib/state');
const { PUBLIC_APP_ROOT } = require('../lib/paths');
const { ACTIVE, bottomNav, deckIndex, goToCardById, logCard, revealCard, submitDay } = require('../lib/deck');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';
const BADGE_BG = 'rgba(0, 0, 0, 0)';
const BADGE_BORDER = 'rgb(212, 175, 55)';

const dayOffset = (days, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};

function publicConfig() {
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

function everyDaySchedule() {
    return {
        version: 2,
        scheduleIsExplicit: true,
        totalWorkoutDays: 1,
        workoutDays: [
            'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
        ].map(dayOfWeek => ({ dayOfWeek, workoutDayNumber: 1 })),
    };
}

const PREVIOUS = {
    date: dayOffset(-2, 9),
    day: 1,
    week: 1,
    submitted: true,
    plateauBusters: [],
    exercises: [
        { id: 'chest', name: 'Chest Press', category: 'Push', type: 'standard', weight: '100', reps: '5', minReps: 5, maxReps: 8 },
        { id: 'incline', name: 'Incline Press', category: 'Push', type: 'standard', weight: '100', reps: '5', minReps: 5, maxReps: 8 },
    ],
};

async function enterStandardSet(page, exerciseId, weight, reps) {
    await goToCardById(page, exerciseId);
    await revealCard(page);
    await page.evaluate((sel, w, r) => {
        const card = document.querySelector(sel);

        const weightInput = card.querySelector('input[type="number"][inputmode="decimal"]');
        const inputSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set;
        inputSetter.call(weightInput, w);
        weightInput.dispatchEvent(new Event('input', { bubbles: true }));

        const repsField = card.querySelector('select[data-field="reps"]') ||
            card.querySelector('input[type="number"][inputmode="numeric"]');
        if (repsField.tagName === 'SELECT') {
            const selectSetter = Object.getOwnPropertyDescriptor(
                window.HTMLSelectElement.prototype, 'value').set;
            selectSetter.call(repsField, r);
            repsField.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            inputSetter.call(repsField, r);
            repsField.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, ACTIVE, weight, reps);
    await new Promise(r => setTimeout(r, 120));
}

// The newest History entry's rows, in render order.
async function readHistoryRows(page) {
    return page.evaluate(() => {
        const firstWorkout = document.querySelector('.history-item');
        if (!firstWorkout) return [];
        return Array.from(firstWorkout.querySelectorAll('.history-exercise'))
            .map(row => {
                const badge = row.querySelector('[data-pr-badge]');
                return {
                    name: row.querySelector('.history-exercise-name')?.textContent.trim() || null,
                    badge: badge ? badge.textContent.trim() : null,
                    badgeBg: badge ? getComputedStyle(badge).backgroundColor : null,
                    badgeBorder: badge ? getComputedStyle(badge).borderTopColor : null,
                };
            });
    });
}

async function readActiveReview(page) {
    return page.evaluate((sel) => {
        const card = document.querySelector(sel + ' .card[data-exercise-id]');
        const loggedPR = card?.querySelector('[data-logged-pr-badge]');
        return {
            id: card ? card.getAttribute('data-exercise-id') : null,
            celebrating: !!card?.classList.contains('pr-celebrating'),
            cardAnimation: card ? getComputedStyle(card).animationName : null,
            loggedPR: loggedPR ? loggedPR.textContent.trim() : null,
            loggedPRBg: loggedPR ? getComputedStyle(loggedPR).backgroundColor : null,
            loggedPRBorder: loggedPR ? getComputedStyle(loggedPR).borderTopColor : null,
        };
    }, ACTIVE);
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        await page.waitForFunction(
            () => typeof isExercisePRInWorkout === 'function', { timeout: 8000 });
        const helper = await page.evaluate(() => {
            const previous = {
                date: '2026-08-01T09:00:00.000Z',
                submitted: true,
                exercises: [
                    { id: 'std-rep', type: 'standard', weight: '100', reps: '5' },
                    { id: 'std-weight-drop', type: 'standard', weight: '100', reps: '5' },
                    { id: 'bw', type: 'bodyweight', weight: 'Body Weight', reps: '10' },
                    { id: 'cardio', type: 'cardio', isCardio: true, intensity: '7', minutes: 10, seconds: 0 },
                    { id: 'stairs', type: 'stairmaster', level: 'Level 7', time: '10:00' },
                    { id: 'bike', type: 'assault-bike', intensity: '30/30', rounds: '5' },
                    { id: 'first', type: 'standard', weight: '80', reps: '5' },
                ],
            };
            const current = {
                date: '2026-08-08T09:00:00.000Z',
                submitted: true,
                exercises: [
                    { id: 'std-rep', type: 'standard', weight: '100', reps: '6' },
                    { id: 'std-weight-drop', type: 'standard', weight: '95', reps: '8' },
                    { id: 'bw', type: 'bodyweight', weight: 'Body Weight', reps: '11' },
                    { id: 'cardio', type: 'cardio', isCardio: true, intensity: '7', minutes: 10, seconds: 15 },
                    { id: 'stairs', type: 'stairmaster', level: 'Level 7', time: '10:15' },
                    { id: 'bike', type: 'assault-bike', intensity: '30/30', rounds: '6' },
                    { id: 'first', type: 'standard', weight: '80', reps: '5' },
                ],
            };
            const history = [current, previous];
            const pr = (id) => isExercisePRInWorkout(
                current.exercises.find(e => e.id === id), current, history);
            return {
                standardRep: pr('std-rep'),
                standardWeightDrop: pr('std-weight-drop'),
                bodyweight: pr('bw'),
                cardio: pr('cardio'),
                stairmaster: pr('stairs'),
                assaultBike: pr('bike'),
                firstEver: isExercisePRInWorkout(
                    current.exercises.find(e => e.id === 'first'), current, [current]),
            };
        });
        eq(helper, {
            standardRep: true,
            standardWeightDrop: false,
            bodyweight: true,
            cardio: true,
            stairmaster: true,
            assaultBike: true,
            firstEver: false,
        }, 'public PR helper handles each exercise type and rejects weight drops/first sessions');

        await seedPublicApp(page, {
            exerciseConfig: publicConfig(),
            workoutHistory: [PREVIOUS],
            schedule: everyDaySchedule(),
        });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        await enterStandardSet(page, 'chest', '100', '6');
        ok(await logCard(page, { settle: 250, waitForAutoAdvance: false }),
            'PR row logged through the public deck');
        const celebrating = await readActiveReview(page);
        eq(celebrating.id, 'chest',
            'public PR log stays on the current logged card before advancing');
        eq(celebrating.celebrating, true,
            'public PR log runs the card celebration class');
        ok((celebrating.cardAnimation || '').includes('prLegendaryAura'),
            'public PR logged card uses the gold legendary aura animation');
        eq(celebrating.loggedPR, '🔥 PR',
            'public held logged card shows the PR badge during the celebration');
        eq(celebrating.loggedPRBg, BADGE_BG,
            'public logged PR badge uses the shared transparent background');
        eq(celebrating.loggedPRBorder, BADGE_BORDER,
            'public logged PR badge uses the shared gold border');

        await new Promise(r => setTimeout(r, 1300));
        const lingering = await readActiveReview(page);
        eq(lingering.id, 'chest',
            'public PR celebration keeps the logged card visible for the two-second aura hold');
        eq(lingering.celebrating, true,
            'public PR aura is still pulsing before the delayed auto-advance');

        await page.waitForFunction((sel, id) => {
            const card = document.querySelector(sel + ' .card[data-exercise-id]');
            return card && card.getAttribute('data-exercise-id') !== id;
        }, { timeout: 5000 }, ACTIVE, 'chest');
        eq(await deckIndex(page), 2,
            'after the public PR celebration, the deck advances to the next unlogged card');

        await enterStandardSet(page, 'incline', '100', '5');
        ok(await logCard(page), 'non-PR row logged through the public deck');
        eq(await deckIndex(page), null,
            'non-PR public log advances normally to the finish card');

        // Both sets are logged and the day is NOT submitted yet. Today's entry
        // is already the newest .history-item, so the badges must be there.
        await bottomNav(page, 'History');
        await page.waitForSelector('.history-item', { timeout: 8000 });
        const stillOpen = await page.evaluate((ns) => {
            const hist = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]');
            return hist.map(w => !!w.submitted);
        }, NS);
        eq(stillOpen[0], false, 'the newest public history entry is still unsubmitted');

        const preSubmitRows = await readHistoryRows(page);
        eq(preSubmitRows.find(r => r.name === 'Chest Press')?.badge, '🔥 PR',
            'public History badges an improvement at LOG time, before Submit Day');
        eq(preSubmitRows.find(r => r.name === 'Incline Press')?.badge, null,
            'public History gives a non-improvement no pre-submit badge');

        await bottomNav(page, 'Workout');
        ok(await submitDay(page), 'public Submit Day clicked');
        await page.waitForSelector('[data-pr-count]', { timeout: 8000 });
        const submitDayState = await page.evaluate(() => {
            const rowInfo = Array.from(document.querySelectorAll('[data-timing-row]'))
                .map(row => ({
                    id: row.getAttribute('data-timing-row'),
                    badge: row.querySelector('[data-day-breakdown-pr-badge]')?.textContent.trim() || null,
                }));
            return {
                prCount: document.querySelector('[data-pr-count]')?.textContent.trim() || null,
                detailsVisible: !!document.querySelector('[data-timing-details]'),
                hasDetailsToggle: Array.from(document.querySelectorAll('button'))
                    .some(b => /View More Details|Hide Details/i.test(b.textContent)),
                rowInfo,
            };
        });
        eq(submitDayState.prCount, '1',
            'public Submit Day PR count uses the shared improvement helper');
        eq(submitDayState.detailsVisible, true,
            'public Submit Day always shows timing details when timing exists');
        eq(submitDayState.hasDetailsToggle, false,
            'public Submit Day no longer renders the optional details toggle');
        eq(submitDayState.rowInfo.find(r => r.id === 'chest')?.badge, '🔥 PR',
            'public Submit Day marks the row that counted as a PR');
        eq(submitDayState.rowInfo.find(r => r.id === 'incline')?.badge, null,
            'public Submit Day does not mark a non-PR row');

        await page.evaluate(() => {
            const close = Array.from(document.querySelectorAll('button'))
                .find(b => /^Close$/i.test(b.textContent.trim()));
            if (close) close.click();
        });
        await new Promise(r => setTimeout(r, 250));
        await bottomNav(page, 'History');

        const historyRows = await readHistoryRows(page);
        const chestHistory = historyRows.find(r => r.name === 'Chest Press');
        const inclineHistory = historyRows.find(r => r.name === 'Incline Press');
        eq(chestHistory.badge, '🔥 PR',
            'public History shows the PR badge beside the improved exercise');
        eq(chestHistory.badgeBg, BADGE_BG,
            'public History PR badge uses the shared transparent background');
        eq(chestHistory.badgeBorder, BADGE_BORDER,
            'public History PR badge uses the shared gold border');
        eq(inclineHistory.badge, null,
            'public History does not show a PR badge beside the non-improved exercise');
        eq(historyRows.map(r => [r.name, r.badge]),
            preSubmitRows.map(r => [r.name, r.badge]),
            'submitting the day does not change a single public History badge');

        eq(errors, [], 'no console errors during public PR badge flow');
        console.log('PASS: public app shows PR badges and the log celebration from the shared PR helper.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
