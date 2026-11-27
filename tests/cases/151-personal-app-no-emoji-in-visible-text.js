// What this test covers
// ----------------------
// UI improvements (text labels instead of emojis): no screen or modal of
// either app shows an emoji. Every button that used to be an icon or carried
// a leading icon says its words instead, and keeps doing its old job (the
// per-button checks live in the cases that click them: 22, 71, 89, 90, 100,
// 128 and the rest).
//
// This case only walks the screens and reads what is visible. After each stop
// it looks at the page's rendered text (innerText, so hidden panels do not
// count) plus the attributes a person can see or hear (placeholder, title,
// aria-label, button values) for Unicode Extended_Pictographic characters,
// variation selectors, and the typographic symbols that used to stand in for
// words: check mark, cross, pencil, gear.
//
// Stops, workout app: the deck (front of a card, open card with its streak
// pill, logged state, finish card), Day Breakdown, History (rows with Time and
// Edit, PR badges, an empty week), the timing modal, the edit-workout modal,
// Settings, Manage Exercises with an edit form open, and the sign-in banner
// with both Settings sign-in states. Weight app: the empty check-in and empty
// History, a seeded check-in with a plan, History with a week opened and a
// reading being edited, and Settings in its signed-out, signed-in and plan
// forms.
//
// Mutation check: put any emoji back in a label and the stop that shows it is
// named in the failure.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, waitFor, selectDayType } = require('../lib/browser');
const { setWeightAndOpen, logCard, submitDay, bottomNav, readDeckCard } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';
const FLIES = 'pecs-transverse-shoulder-adduction';
const LOW_HIGH = 'pecs-shoulder-flexion';

const daysAgo = (n) => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.toISOString();
};

// Three earlier sessions, each heavier than the last, so Chest Flies carries a
// PR streak into today and logging it heavier again lands "PR x3".
const HISTORY = [
    [21, '170', '100'], [14, '180', '105'], [7, '190', '110'],
].map(([ago, flies, lowHigh]) => workoutEntry({
    date: daysAgo(ago),
    day: 'anterior-2',
    exercises: [
        { id: FLIES, name: 'Chest Flies', weight: flies, reps: '8' },
        { id: LOW_HIGH, name: 'Low to High Flies', weight: lowHigh, reps: '8' },
    ],
}));

// Evaluated in the page. Returns every offending character with a little
// context so the failure says where it is.
function scanPage() {
    const bad = /\p{Extended_Pictographic}|️|‍|[✓✔✕✖✎✏⚙⭐]/u;
    const found = [];
    const note = (where, text) => {
        const m = bad.exec(text);
        if (m) found.push(where + ': "' + text.slice(Math.max(0, m.index - 12), m.index + 12).trim() + '"');
    };
    note('text', document.body.innerText);
    for (const el of document.querySelectorAll('[placeholder],[title],[aria-label],input[type=button],input[type=submit]')) {
        for (const a of ['placeholder', 'title', 'aria-label', 'value']) {
            const v = el.getAttribute(a);
            if (v) note(a, v);
        }
    }
    return found;
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    const problems = [];
    const stops = [];
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);

        const look = async (name) => {
            const found = await page.evaluate(scanPage);
            stops.push(name);
            for (const f of found) problems.push(name + ' -> ' + f);
        };
        const click = (sel, text) => page.evaluate((s, t) => {
            const b = Array.from(document.querySelectorAll(s))
                .find((x) => x.textContent.trim() === t);
            if (!b) throw new Error('no ' + s + ' reading "' + t + '"');
            b.click();
        }, sel, text);
        const pause = (ms) => new Promise((r) => setTimeout(r, ms));
        const closeModal = async () => {
            await page.evaluate(() => {
                const b = Array.from(document.querySelectorAll('.modal button'))
                    .find((x) => /^(Close|Cancel|Done|Got it)$/i.test(x.textContent.trim()));
                if (b) b.click();
            });
            await pause(300);
        };

        // === Workout app ================================================
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: HISTORY });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior-2');
        await pause(300);

        await look('workout deck, card front');
        await readDeckCard(page, 'Chest Flies');
        await look('workout deck, open card with PR streak pill');

        await setWeightAndOpen(page, 'Chest Flies', 200);
        ok(await logCard(page, { settle: 300 }), 'logged Chest Flies');
        await look('workout deck, logged card with PR pill');
        await pause(2500);
        await look('workout deck, after the auto-advance');

        ok(await submitDay(page), 'pressed Submit Day');
        await page.waitForSelector('[data-pr-count]', { timeout: 8000 });
        await look('Day Breakdown modal');
        await closeModal();
        await look('workout deck, finish card');

        await bottomNav(page, 'History');
        await page.waitForSelector('.history-item', { timeout: 8000 });
        await look('History, rows with Time and Edit');

        await click('.history-date button', 'Time');
        await waitFor(page, 'timing modal', () => !!document.querySelector('.modal'));
        await look('timing details modal');
        await closeModal();

        await click('.history-date button', 'Edit');
        await waitFor(page, 'edit workout modal', () => !!document.querySelector('.modal'));
        await look('edit workout modal');
        await closeModal();

        await bottomNav(page, 'Workout');
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await page.evaluate(() => document.querySelector('.settings-btn').click());
        await waitFor(page, 'Settings', () => !!document.querySelector('.modal .modal-title'));
        await look('Settings');
        await click('.modal-btn', 'Manage Exercises');
        await waitFor(page, 'exercise rows', () => document.querySelectorAll('.exercise-row').length > 0);
        await look('Manage Exercises');
        await page.evaluate(() => {
            const row = document.querySelector('.exercise-row');
            Array.from(row.querySelectorAll('button'))
                .find((b) => b.textContent.trim() === 'Edit').click();
        });
        await waitFor(page, 'edit form', () => !!document.querySelector('.exercise-row select[data-field="increment"]'));
        await look('Manage Exercises, edit form');

        // A device with no history shows History's empty state.
        const emptyPage = await browser.newPage();
        await emptyPage.setViewport({ width: 390, height: 844 });
        await emptyPage.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        // Pages in one browser share localStorage, so drop what the first one seeded.
        await emptyPage.evaluate((ns) => {
            localStorage.removeItem(ns + 'gymWorkoutHistory');
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS);
        await emptyPage.reload({ waitUntil: 'networkidle0' });
        await waitForApp(emptyPage);
        await bottomNav(emptyPage, 'History');
        await emptyPage.waitForSelector('.empty-state', { timeout: 8000 });
        const emptyFound = await emptyPage.evaluate(scanPage);
        stops.push('History, empty');
        for (const f of emptyFound) problems.push('History, empty -> ' + f);
        await emptyPage.close();

        // === Sign-in banner and Settings sign-in states =================
        const bannerPage = await browser.newPage();
        await bannerPage.setViewport({ width: 390, height: 844 });
        await bannerPage.evaluateOnNewDocument(() => {
            Object.defineProperty(window, 'FIREBASE_READY', { get: () => true, set: () => {} });
        });
        await bannerPage.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await bannerPage.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
            localStorage.removeItem(ns + 'syncPromptDismissed');
        }, NS);
        await bannerPage.reload({ waitUntil: 'networkidle0' });
        await waitForApp(bannerPage);
        await waitFor(bannerPage, 'sign-in banner',
            () => /Sign in to sync/.test(document.body.innerText));
        const look2 = async (name) => {
            const found = await bannerPage.evaluate(scanPage);
            stops.push(name);
            for (const f of found) problems.push(name + ' -> ' + f);
        };
        await look2('sign-in banner');
        await bannerPage.evaluate(() => document.querySelector('.settings-btn').click());
        await waitFor(bannerPage, 'Settings', () => !!document.querySelector('.modal .modal-title'));
        await look2('Settings, signed out');
        await bannerPage.evaluate(() => {
            window.repo.mode = 'firestore';
            window.repo.status = () => ({ email: 'josh@example.com', pendingWrites: 2 });
        });
        await bannerPage.evaluate(() => {
            Array.from(document.querySelectorAll('.modal .modal-btn'))
                .find((b) => b.textContent.trim() === 'Close').click();
        });
        await pause(300);
        await bannerPage.evaluate(() => document.querySelector('.settings-btn').click());
        await waitFor(bannerPage, 'Settings', () => !!document.querySelector('.modal .modal-title'));
        await look2('Settings, signed in');
        await bannerPage.close();

        // === Weight app =================================================
        const wpage = await browser.newPage();
        await wpage.setViewport({ width: 390, height: 844 });
        const werrors = attachConsole(wpage);
        const wlook = async (name) => {
            const found = await wpage.evaluate(scanPage);
            stops.push(name);
            for (const f of found) problems.push(name + ' -> ' + f);
        };
        const wnav = async (label) => {
            await wpage.evaluate((l) => Array.from(document.querySelectorAll('.bottom-nav-btn'))
                .find((b) => b.textContent.includes(l)).click(), label);
            await pause(400);
        };
        await wpage.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        await wpage.evaluate((ns) => {
            localStorage.setItem(ns + 'weightHistorySeeded', 'true');
            localStorage.setItem(ns + 'gymWeightPlan', 'null');
            localStorage.removeItem(ns + 'gymWeightLog');
        }, NS);
        await wpage.reload({ waitUntil: 'networkidle0' });
        await waitFor(wpage, 'check-in', () => !!document.querySelector('.weigh-card'));
        await wlook('weight check-in, empty');
        await wnav('History');
        await wpage.waitForSelector('.empty-state', { timeout: 8000 });
        await wlook('weight History, empty');

        await wpage.evaluate((ns) => {
            const day = (n) => {
                const d = new Date();
                d.setDate(d.getDate() - n);
                return d.toISOString().split('T')[0];
            };
            const log = [];
            for (let n = 21; n >= 1; n--) {
                log.push({ date: day(n), weight: 180 - n * 0.2, loggedAt: day(n) + 'T14:30:00.000Z' });
            }
            localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
            localStorage.setItem(ns + 'gymWeightPlan', JSON.stringify({
                name: 'Cut', startDate: day(21), startWeight: 184, goalWeight: 170,
                ratePerWeek: 1, weeks: 14, solveFor: 'weeks' }));
        }, NS);
        await wpage.reload({ waitUntil: 'networkidle0' });
        await waitFor(wpage, 'check-in', () => !!document.querySelector('.weigh-card'));
        await wlook('weight check-in, with plan and readings');
        await wnav('History');
        await waitFor(wpage, 'weekly ledger', () => !!document.querySelector('.weigh-week'));
        await wlook('weight History, weeks');
        await wpage.evaluate(() => document.querySelector('.weigh-week-head').click());
        await waitFor(wpage, 'opened week', () => document.querySelectorAll('.weigh-day').length > 0);
        await wlook('weight History, week opened');
        await wpage.evaluate(() => document.querySelector('.weigh-day-value').click());
        await waitFor(wpage, 'inline editor', () => !!document.querySelector('.weigh-day-input'));
        await wlook('weight History, editing a reading');

        await wpage.evaluate(() => document.querySelector('.settings-btn').click());
        await waitFor(wpage, 'weight Settings', () => !!document.querySelector('.modal .modal-title'));
        await wlook('weight Settings, plan saved');
        await wpage.evaluate(() => {
            const b = Array.from(document.querySelectorAll('.modal .modal-btn'))
                .find((x) => x.textContent.trim() === 'Edit plan');
            if (b) b.click();
        });
        await pause(400);
        await wlook('weight Settings, plan form');
        await wpage.evaluate((ns) => localStorage.setItem(ns + 'gymWeightPlan', 'null'), NS);
        await wpage.evaluateOnNewDocument(() => {
            Object.defineProperty(window, 'FIREBASE_READY', { get: () => true, set: () => {} });
        });
        await wpage.reload({ waitUntil: 'networkidle0' });
        await waitFor(wpage, 'check-in', () => !!document.querySelector('.weigh-card'));
        await wpage.evaluate(() => document.querySelector('.settings-btn').click());
        await waitFor(wpage, 'weight Settings', () => !!document.querySelector('.modal .modal-title'));
        await wlook('weight Settings, no plan, signed out');

        eq(problems, [], 'no emoji in visible text on any screen');
        ok(stops.length >= 20, 'walked every stop (' + stops.length + ')');
        eq(errors, [], 'no console errors in the workout app');
        eq(werrors, [], 'no console errors in the weight app');
        console.log('PASS: no emoji appears on any of ' + stops.length + ' screens and modals.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
