// What this test covers
// ----------------------
// The public twin of case 107 (b972f85): a set at the bottom of the reps
// dropdown is where the set died, not a rep count anyone trains for, so it is
// never a PR — however much more weight was on the machine.
//
// The floor is the client's own dropdown minimum (repsDropdown.min), which is
// 5 for Jessi, rather than the personal app's 3. A client with no dropdown
// types reps freely and has no floor, so nothing changes for them.
//
// Checked through isImprovement, the one arbiter behind the flame pill,
// History's badge, the logged-card badge and Submit Day's count, and then on
// screen: logging 105 x 5 after 100 x 6 gives no badge and no celebration.
//
// Only the NEW session is judged. A failed set still stands as the baseline
// for the next one, so 105 x 6 after 105 x 5 is a real improvement.
//
// To verify this test is real: drop the isFailedSet check from isImprovement.
// The dropdown client's 105 x 5 becomes a PR.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPublicApp } = require('../lib/state');
const { PUBLIC_APP_ROOT } = require('../lib/paths');
const { ACTIVE, bottomNav, goToCardById, logCard, revealCard } = require('../lib/deck');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';

const dayOffset = (days, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};

function config(withDropdown) {
    return {
        version: 2,
        categories: ['Push'],
        minimalistPrTracking: true,
        ...(withDropdown ? { repsDropdown: { min: 5, max: 8 } } : {}),
        days: { 1: [{ id: 'chest', name: 'Chest Press', category: 'Push', order: 0, type: 'standard', minReps: 6, maxReps: 8 }] },
    };
}

const SCHEDULE = {
    version: 2, scheduleIsExplicit: true, totalWorkoutDays: 1,
    workoutDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        .map(dayOfWeek => ({ dayOfWeek, workoutDayNumber: 1 })),
};

const PREVIOUS = {
    date: dayOffset(-3, 9), day: 1, week: 1, submitted: true, plateauBusters: [],
    exercises: [{ id: 'chest', name: 'Chest Press', category: 'Push', type: 'standard', weight: '100', reps: '6', minReps: 6, maxReps: 8 }],
};

// isImprovement's verdicts for the client currently loaded.
const verdicts = (page) => page.evaluate(() => {
    const s = (weight, reps) => ({ id: 'chest', type: 'standard', weight, reps });
    return {
        heavierAtFloor: isImprovement(s('105', '5'), s('100', '6')),
        heavierAboveFloor: isImprovement(s('105', '6'), s('100', '6')),
        recoverFromFailed: isImprovement(s('105', '6'), s('105', '5')),
        bodyweightAtFive: isImprovement({ id: 'bw', type: 'bodyweight', reps: '5' }, { id: 'bw', type: 'bodyweight', reps: '4' }),
    };
});

async function load(page, withDropdown) {
    await seedPublicApp(page, { exerciseConfig: config(withDropdown), workoutHistory: [PREVIOUS], schedule: SCHEDULE });
    await page.evaluate((ns) => {
        localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        localStorage.setItem(ns + 'hasSeenTutorial', 'true');
    }, NS);
    await page.reload({ waitUntil: 'networkidle0' });
    await waitForApp(page);
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // --- A client with a 5-8 dropdown ----------------------------------
        await load(page, true);
        eq(await verdicts(page), {
            heavierAtFloor: false,
            heavierAboveFloor: true,
            recoverFromFailed: true,
            bodyweightAtFive: true,
        }, 'with a 5-8 dropdown, 5 reps is a failed set; the next session may still beat it; bodyweight is untouched');

        await goToCardById(page, 'chest');
        await revealCard(page);
        await page.evaluate((sel) => {
            const card = document.querySelector(sel);
            const w = card.querySelector('input[type="number"][inputmode="decimal"]');
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(w, '105');
            w.dispatchEvent(new Event('input', { bubbles: true }));
            const r = card.querySelector('select[data-field="reps"]');
            Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(r, '5');
            r.dispatchEvent(new Event('change', { bubbles: true }));
        }, ACTIVE);
        await new Promise(r => setTimeout(r, 120));
        ok(await logCard(page, { settle: 250, waitForAutoAdvance: false }), 'logged 105 x 5');
        // A PR holds the card for its celebration; anything else advances at
        // once, here to the finish card since this is the only exercise.
        const heldForCelebration = await page.evaluate((sel) =>
            !!document.querySelector(sel + ' .card.pr-celebrating'), ACTIVE);
        eq(heldForCelebration, false, 'the log does not hold the card for a celebration');
        await goToCardById(page, 'chest');
        const badgeOnCard = await page.evaluate((sel) =>
            !!document.querySelector(sel + ' [data-logged-pr-badge]'), ACTIVE);
        eq(badgeOnCard, false, 'and the logged card carries no PR badge');

        await bottomNav(page, 'History');
        await page.waitForSelector('.history-item', { timeout: 8000 });
        const badge = await page.evaluate(() =>
            !!document.querySelector('.history-item [data-pr-badge]'));
        eq(badge, false, 'and no PR badge in History');

        // --- A client who types reps freely -------------------------------
        await load(page, false);
        eq((await verdicts(page)).heavierAtFloor, true,
            'without a dropdown there is no floor, so 105 x 5 after 100 x 6 is a PR as before');

        eq(errors, [], 'no console errors');
        console.log('PASS: a set at the bottom of the reps dropdown is never a PR.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
