// What this test covers
// ----------------------
// A reload puts the open card back: same day, same deck position, still open,
// and still timed from the ORIGINAL swipe up.
//
// Phones reload a backgrounded tab on their own — screen off between sets, bad
// signal on the gym floor. The start anchor already survived that in storage,
// but the open panel, the deck position and the day toggle were plain state, so
// the page came back on card one, shut. Swiping up again to reach LOG re-stamped
// the anchor, and a two-minute set logged as a few seconds. That happened for
// real, which is why this case exists.
//
// The restore is derived from the anchor alone, so the case also pins the rules
// that make the anchor trustworthy as "the card that is open":
//
//   1. Open a card on the NON-default day, not card one, and reload: the day,
//      the position and the reveal all come back, the anchor is untouched, and
//      logging writes the original stamp as startedAt.
//   2. After that log there is no anchor, so a reload opens nothing.
//   3. Leaving an open card drops its anchor (closeWeightBreakdown), so a reload
//      does not drag you back to a card you walked away from.
//   4. An anchor for a movement already logged today (e.g. by another synced
//      device) is not resumed.
//   5. Yesterday's anchor is not resumed.
//
// Choosing the non-default day is what makes (1) non-vacuous for the day
// toggle, and choosing card three is what makes it non-vacuous for position:
// a restore that forgot either would still pass on card one of today's default.
//
// To verify this test is real: delete the restoreOpenCard(...) call in App.jsx's
// hydration. (1) fails on the day pill. Or make closeWeightBreakdown only clear
// expandedWeightBreakdown, as it used to: (3) fails, reopening the card you left.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType, waitFor } = require('../lib/browser');
const { goToCardById, revealCard, isRevealed, logCard, deckPosition, startAnchors, todayWorkout } = require('../lib/deck');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';
const GAP_MS = 1100;

const activeCardId = (page) => page.evaluate(() => {
    const card = document.querySelector('.deck-slot:not([aria-hidden="true"]) .card[data-exercise-id]');
    return card ? card.getAttribute('data-exercise-id') : null;
});

const activeDay = (page) => page.evaluate(() => {
    const pill = document.querySelector('.day-pill.active');
    return pill ? pill.getAttribute('data-day-type') : null;
});

async function reload(page) {
    await page.reload({ waitUntil: 'networkidle0' });
    await waitForApp(page);
    await new Promise(r => setTimeout(r, 200));
}

async function seedAnchor(page, id, dateString) {
    await page.evaluate((ns, id, date) => {
        localStorage.setItem(ns + 'exerciseStartTimes', JSON.stringify({
            date, times: { [id]: new Date().toISOString() },
        }));
    }, NS, id, dateString);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: [] });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), NS);
        await reload(page);

        // The day a fresh load lands on, and the card three into the OTHER day.
        const { defaultDay, otherDay, target, total } = await page.evaluate(() => {
            const defaultDay = getDefaultDayType(new Date());
            const otherDay = defaultDay === 'anterior' ? 'posterior' : 'anterior';
            const roster = DEFAULT_EXERCISES.filter(e => e.day === otherDay)
                .sort((a, b) => a.order - b.order);
            return { defaultDay, otherDay, target: roster[2].id, total: roster.length };
        });
        eq(await activeDay(page), defaultDay, `a fresh load shows today's default day, ${defaultDay}`);

        // === 1. Open card three on the other day, reload ==================
        await selectDayType(page, otherDay);
        await goToCardById(page, target);
        await revealCard(page);
        ok(await isRevealed(page), `opened ${target}`);
        const anchor = (await startAnchors(page, NS))[target];
        ok(anchor, 'the swipe up stamped an anchor');

        await new Promise(r => setTimeout(r, GAP_MS));
        await reload(page);

        eq(await activeDay(page), otherDay, 'after the reload the day toggle is back on the card\'s day');
        eq(await deckPosition(page), `3 of ${total}`, 'the deck is back on card three');
        eq(await activeCardId(page), target, `and that card is ${target}`);
        ok(await isRevealed(page), 'and it is still open — no second swipe needed');
        eq((await startAnchors(page, NS))[target], anchor, 'the anchor is the original stamp');

        // A redundant swipe up on the restored card must not re-stamp either.
        await revealCard(page);
        eq((await startAnchors(page, NS))[target], anchor, 'swiping up on the restored card changes nothing');

        ok(await logCard(page), `logged ${target}`);
        await waitFor(page, `${target} to reach history`, (ns, id) => {
            const h = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory') || '[]');
            return h.some(w => w.exercises.some(e => e.id === id && e.loggedAt));
        }, NS, target);
        const logged = (await todayWorkout(page, NS)).exercises.find(e => e.id === target);
        eq(logged.startedAt, anchor, 'the log is timed from the swipe BEFORE the reload');
        ok(new Date(logged.loggedAt) - new Date(logged.startedAt) >= GAP_MS,
            'so the duration includes the time spanning the reload');

        // === 2. After a log, a reload opens nothing ======================
        eq(Object.keys(await startAnchors(page, NS)), [], 'logging dropped the anchor');
        await reload(page);
        eq(await isRevealed(page), false, 'with no anchor, nothing is reopened');
        eq(await activeDay(page), defaultDay, 'and the day is the ordinary default');

        // === 3. Leaving an open card drops its anchor =====================
        await selectDayType(page, otherDay);
        const roster = await page.evaluate((day) => DEFAULT_EXERCISES
            .filter(e => e.day === day).sort((a, b) => a.order - b.order).map(e => e.id), otherDay);
        await goToCardById(page, roster[0]);
        await revealCard(page);
        ok((await startAnchors(page, NS))[roster[0]], `${roster[0]} is anchored while open`);
        await goToCardById(page, roster[1]);   // walk away without opening the next one
        await waitFor(page, 'the left card\'s anchor to be dropped', (ns, id) => {
            const raw = JSON.parse(localStorage.getItem(ns + 'exerciseStartTimes') || 'null');
            return !raw || !raw.times || !raw.times[id];
        }, NS, roster[0]);
        await reload(page);
        eq(await isRevealed(page), false, 'a card you walked away from is not reopened');
        eq(await activeDay(page), defaultDay, 'and the day is not dragged back to it');

        // === 4. An anchor for a movement already logged today =============
        // `target` was logged in (1); fake a leftover anchor for it.
        await seedAnchor(page, target, await page.evaluate(() => new Date().toDateString()));
        await reload(page);
        eq(await isRevealed(page), false, 'an anchor for an already-logged movement is not resumed');
        eq(await activeDay(page), defaultDay, 'and does not switch the day');

        // === 5. Yesterday's anchor ========================================
        await seedAnchor(page, roster[1], await page.evaluate(() => {
            const d = new Date(); d.setDate(d.getDate() - 1); return d.toDateString();
        }));
        await reload(page);
        eq(await isRevealed(page), false, 'yesterday\'s anchor is not resumed');
        eq(await activeDay(page), defaultDay, 'and does not switch the day');

        eq(errors, [], 'no console errors');
        console.log('PASS: the open card survives a reload with its original start time');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
