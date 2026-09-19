// What this test covers
// ----------------------
// The public app's stagnation hint matching the personal app's (b5bda0c,
// ce73fb3): it takes SIX identical sessions in a row, not three, and the tag
// reads "Plateau detected" rather than "2 sets recommended".
//
// Three exercises, each at the same 100 x 6 (inside the 5-8 range, so no
// weight bump competes for the tag):
//   - 3 identical sessions: the old trigger. Must show nothing now.
//   - 5 identical sessions: one short. Nothing.
//   - 6 identical sessions: "Plateau detected".
//
// To verify this test is real: put the window back to 3. The first two
// exercises grow a tag.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPublicApp } = require('../lib/state');
const { PUBLIC_APP_ROOT } = require('../lib/paths');
const { ACTIVE, goToCardById, revealCard, selectDeckDay } = require('../lib/deck');
const { eq } = require('../lib/assert');

const NS = 'gym-local:';
const IDS = { three: 'ex-three', five: 'ex-five', six: 'ex-six' };
const RUN = { three: 3, five: 5, six: 6 };

const dayOffset = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
};

function config() {
    const mk = (id, name, order) => ({ id, name, category: 'Push', order, type: 'standard', minReps: 5, maxReps: 8 });
    return {
        version: 2,
        categories: ['Push'],
        minimalistPrTracking: true,
        repsDropdown: { min: 5, max: 8 },
        days: { 1: [mk(IDS.three, 'Three Flat', 0), mk(IDS.five, 'Five Flat', 1), mk(IDS.six, 'Six Flat', 2)] },
    };
}

// Six sessions; an exercise appears in the newest RUN[key] of them only, so
// its run of identical sets is exactly that long.
function history() {
    const out = [];
    for (let i = 1; i <= 6; i++) {
        out.push({
            date: dayOffset(-2 * i), day: 1, week: 1, submitted: true, plateauBusters: [],
            exercises: Object.keys(IDS).filter(k => i <= RUN[k]).map(k => ({
                id: IDS[k], name: k, category: 'Push', type: 'standard',
                weight: '100', reps: '6', minReps: 5, maxReps: 8,
            })),
        });
    }
    return out;
}

const SCHEDULE = {
    version: 2, scheduleIsExplicit: true, totalWorkoutDays: 1,
    workoutDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        .map(dayOfWeek => ({ dayOfWeek, workoutDayNumber: 1 })),
};

async function heroTag(page, id) {
    await goToCardById(page, id);
    await revealCard(page);
    return page.evaluate((sel) => {
        const t = document.querySelector(sel + ' .hero-tag');
        return t ? t.textContent.trim() : null;
    }, ACTIVE);
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPublicApp(page, { exerciseConfig: config(), workoutHistory: history(), schedule: SCHEDULE });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
            localStorage.setItem(ns + 'hasSeenTutorial', 'true');
        }, NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDeckDay(page, 1);

        eq(await heroTag(page, IDS.three), null, 'three identical sessions no longer flag anything');
        eq(await heroTag(page, IDS.five), null, 'five identical sessions are one short');
        eq(await heroTag(page, IDS.six), 'Plateau detected', 'six identical sessions read "Plateau detected"');

        eq(errors, [], 'no console errors');
        console.log('PASS: the public plateau hint needs six identical sessions and says so.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
