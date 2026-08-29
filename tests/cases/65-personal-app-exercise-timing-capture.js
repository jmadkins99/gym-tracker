// What this test covers
// ----------------------
// The gesture pair that times a workout without asking the user to time
// anything: opening a card's Weight Breakdown starts that exercise's clock,
// tapping LOG on the same card stops it. This case drives both through the real
// UI and pins what ends up in storage.
//
// Four things have to hold together, and each fails silently on its own:
//
//   1. The panel button is ONE-WAY. It used to toggle and read "Hide" while
//      open, and a toggle can be pressed twice, which made "which tap started
//      the clock?" ambiguous on a single card. Removing the Hide arm settles
//      that much and no more: opening ANOTHER card still closes this one, so a
//      movement can legitimately be opened twice, and which of those wins is
//      case 68's subject, not this one's. Do not read this case as covering it
//      — it passed throughout the window in which that was wrong.
//
//   2. logExercise has to COPY the stamps onto the saved exercise. It has
//      computed a `timestamp` local since long before this feature and assigned
//      it to `finalData`, where nothing ever read it — exerciseToSave simply did
//      not carry it across. A regression that drops `...stamps` from the object
//      literal leaves the app working perfectly and the breakdown blank.
//
//   3. A movement logged WITHOUT its panel ever being opened must carry
//      `loggedAt` and NO `startedAt`, so getSessionTiming knows to fall back
//      instead of reading a bogus zero-length exercise. Asserting the absence is
//      the whole point: `startedAt: undefined` and "startedAt equal to loggedAt"
//      are very different numbers downstream.
//
//   4. A start time has to survive a mid-session RELOAD. The map of open-panel
//      timestamps is React state, so it dies on reload, and a phone reloads
//      mid-session often enough that case 37 exists to cover it. It is mirrored
//      to a device-local storage key for exactly that reason. Lose the mirror
//      and nothing breaks visibly — the movement just quietly downgrades from a
//      measurement to an estimate.
//
// Case 66 owns the arithmetic. This one owns the capture, and deliberately
// asserts elapsed time only as "at least the delay we actually waited" — the
// exact figure is a wall clock and does not belong in an assertion.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType, waitFor } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

// Long enough that the elapsed-time assertion below is meaningful, short
// enough not to slow the suite. This is not a bet on machine speed: it is the
// quantity under test, and the assertion is a floor, not an equality.
const HOLD_MS = 1200;

async function clickCardButton(page, id, label) {
    const clicked = await page.evaluate((id, label) => {
        const card = document.querySelector(`[data-exercise-id="${id}"]`);
        if (!card) return false;
        const btn = Array.from(card.querySelectorAll('button'))
            .find(b => new RegExp(label, 'i').test(b.textContent));
        if (!btn) return false;
        btn.click();
        return true;
    }, id, label);
    ok(clicked, `clicked "${label}" on ${id}`);
    await new Promise(r => setTimeout(r, 150));
}

async function cardText(page, id) {
    return page.evaluate((id) => {
        const card = document.querySelector(`[data-exercise-id="${id}"]`);
        return card ? card.textContent : '';
    }, id);
}

async function breakdownButtonLabels(page) {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll('.exercise-card'))
            .map(c => {
                const btn = Array.from(c.querySelectorAll('button'))
                    .find(b => /Weight Breakdown|^Hide$/i.test(b.textContent.trim()));
                return btn ? btn.textContent.trim() : null;
            })
            .filter(Boolean));
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate(() =>
            localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior');

        // === 1. The button is one-way ==================================
        let labels = await breakdownButtonLabels(page);
        eq(labels.length, 12, 'every Anterior card offers a Weight Breakdown button');
        eq([...new Set(labels)], ['Weight Breakdown'],
            'every breakdown button reads "Weight Breakdown" before anything is opened');

        await clickCardButton(page, 'chest-press', 'Weight Breakdown');

        const openText = await cardText(page, 'chest-press');
        ok(/Warmup Set/.test(openText),
            'the Chest Press panel is open (it renders its warmup sets)');

        labels = await breakdownButtonLabels(page);
        eq([...new Set(labels)], ['Weight Breakdown'],
            'the open card STILL reads "Weight Breakdown" — the Hide arm is gone');

        // A second tap on the open card must change nothing. Under the old
        // toggle this closed the panel and, worse, would have been a second
        // candidate start time.
        await clickCardButton(page, 'chest-press', 'Weight Breakdown');
        ok(/Warmup Set/.test(await cardText(page, 'chest-press')),
            're-tapping the open card is a no-op — the panel stays up');

        // Opening another card's panel is one of the two ways to close this
        // one, and the only way that does not involve logging.
        await clickCardButton(page, 'chest-flies', 'Weight Breakdown');
        ok(!/Warmup Set/.test(await cardText(page, 'chest-press')),
            'opening another card closes the first — only one panel is ever up');
        await clickCardButton(page, 'chest-press', 'Weight Breakdown');

        // === 2. Anchored log: both stamps ==============================
        await new Promise(r => setTimeout(r, HOLD_MS));
        await clickCardButton(page, 'chest-press', 'LOG');

        ok(!/Warmup Set/.test(await cardText(page, 'chest-press')),
            'logging the open card closes its panel — the other way it closes');

        // === 3. Un-anchored log: loggedAt only =========================
        // Incline Chest Press is logged with no interaction whatsoever, which
        // is also the one-tap path case 23 covers for weight/reps.
        await clickCardButton(page, 'incline-chest-press', 'LOG');

        await waitFor(page, 'both exercises to be written to history',
            (ns) => {
                const h = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]');
                if (!h.length) return false;
                const ex = h[0].exercises.filter(e => e.loggedAt);
                return ex.length === 2;
            }, NS);

        const saved = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]'), NS);
        eq(saved.length, 1, 'one workout was created');

        const chestPress = saved[0].exercises.find(e => e.id === 'chest-press');
        const incline = saved[0].exercises.find(e => e.id === 'incline-chest-press');

        ok(chestPress.loggedAt, 'Chest Press carries loggedAt');
        ok(chestPress.startedAt, 'Chest Press carries startedAt from its Weight Breakdown tap');
        const elapsed = new Date(chestPress.loggedAt) - new Date(chestPress.startedAt);
        ok(elapsed >= HOLD_MS,
            `Chest Press spans at least the ${HOLD_MS}ms held between the taps (got ${elapsed}ms)`);

        ok(incline.loggedAt, 'Incline Chest Press carries loggedAt');
        eq(incline.startedAt, undefined,
            'Incline Chest Press carries NO startedAt — its panel was never opened');

        // The un-logged rows are materialised with neither stamp, so
        // getSessionTiming drops them rather than timing a movement that did
        // not happen.
        const untouched = saved[0].exercises.filter(
            e => e.id !== 'chest-press' && e.id !== 'incline-chest-press');
        eq(untouched.length, 10, 'the other ten Anterior rows exist');
        // (chest-flies is logged later, in section 3b.)
        ok(untouched.every(e => e.loggedAt === undefined && e.startedAt === undefined),
            'no un-logged row carries either stamp');

        // === 3b. A start survives a mid-session reload =================
        await clickCardButton(page, 'chest-flies', 'Weight Breakdown');

        const mirrored = await page.evaluate((ns) => {
            const raw = JSON.parse(localStorage.getItem(ns + 'exerciseStartTimes') || 'null');
            return raw && raw.times ? raw.times['chest-flies'] : null;
        }, NS);
        ok(mirrored, 'the open-panel timestamp is mirrored to device-local storage');

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior');
        await clickCardButton(page, 'chest-flies', 'LOG');

        await waitFor(page, 'chest flies to be written to history',
            (ns) => {
                const h = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]');
                return h.length > 0 && h[0].exercises.some(e => e.id === 'chest-flies' && e.loggedAt);
            }, NS);

        const afterReload = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]')[0]
                .exercises.find(e => e.id === 'chest-flies'), NS);
        eq(afterReload.startedAt, mirrored,
            'the panel tap from BEFORE the reload is still what starts the clock');

        // === 4. The breakdown renders it ===============================
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
                .find(b => /Submit Day/i.test(b.textContent));
            if (btn) btn.click();
        });
        await page.waitForSelector('[data-timing-total]', { timeout: 8000 });

        const total = await page.evaluate(() =>
            document.querySelector('[data-timing-total]').textContent.trim());
        ok(/^\d+h \d+m$|^\d+m$/.test(total),
            `"Time at the Gym" renders a duration (got "${total}")`);

        // The details are behind the button, not shown by default.
        eq(await page.$('[data-timing-details]'), null,
            'the per-exercise rows are hidden until "View More Details" is pressed');

        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
                .find(b => /View More Details/i.test(b.textContent));
            if (btn) btn.click();
        });
        await page.waitForSelector('[data-timing-details]', { timeout: 8000 });

        const rows = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[data-timing-row]')).map(r => ({
                id: r.getAttribute('data-timing-row'),
                text: r.textContent.trim(),
            })));

        eq(rows.map(r => r.id), ['chest-press', 'incline-chest-press', 'chest-flies'],
            'only the three logged movements get a row, in the order they were logged');
        ok(!/\*/.test(rows[0].text),
            'the anchored movement is not marked as an estimate');
        ok(/\*/.test(rows[1].text),
            'the un-anchored movement IS marked as an estimate');
        ok(!/\*/.test(rows[2].text),
            'the movement anchored before the reload counts as measured, not estimated');

        eq(errors, [], 'no console errors during the session');
        console.log('PASS: Weight Breakdown starts the clock, LOG stops it, and both ends persist.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
