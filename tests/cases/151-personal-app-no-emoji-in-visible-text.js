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
// count), the text a stylesheet injects through ::before / ::after `content`,
// and the attributes a person can see or hear (placeholder, title, aria-label,
// button values) of elements that are actually on screen, for Unicode
// Extended_Pictographic characters, variation selectors, and the typographic
// symbols that used to stand in for words: check mark, cross, pencil, gear.
// Every native alert and confirm the walk triggers is captured and scanned
// too. Navigation is by real browser clicks, and each stop first waits for a
// control that only that screen has, and fails if it never shows, so a stop
// cannot be "scanned" while the screen it names is not open.
//
// Stops, workout app: the deck (front of a card, open card with its streak
// pill, logged state, finish card), the swipe-down Quick Edit form, Day
// Breakdown, History (rows with Time and Edit, PR badges, an empty week), the
// timing modal, the edit-workout modal, Settings, Manage Exercises with an edit
// form open, and the sign-in banner with both Settings sign-in states. Weight
// app: the empty check-in and empty History, a seeded check-in with a plan,
// History with a week opened and a reading being edited, and Settings in its
// signed-out, signed-in and plan forms. Dialogs: Reset All Data (both
// confirms), a bad backup file, Submit Day with nothing logged (workout app),
// Reset All Data, a bad backup file and deleting a reading (weight app).
//
// Signed-in states are faked the way the sign-in banner stop does it: the page
// is told Firebase is ready and window.repo is patched to report an account.
// No repo helper exists for it in tests/lib.
//
// Mutation check: put any emoji back in a label and the stop that shows it is
// named in the failure.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, waitFor, selectDayType } = require('../lib/browser');
const { ACTIVE, setWeightAndOpen, logCard, submitDay, bottomNav, readDeckCard, swipe } = require('../lib/deck');
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

// What counts as an emoji or an icon standing in for a word.
const BAD = /\p{Extended_Pictographic}|️|‍|[✓✔✕✖✎✏⚙⭐]/u;

const excerpt = (text) => {
    const m = BAD.exec(text);
    return m ? '"' + text.slice(Math.max(0, m.index - 12), m.index + 12).trim() + '"' : null;
};

// Evaluated in the page. Returns every offending character with a little
// context so the failure says where it is. Looks at rendered text, at
// pseudo-element content, and at attributes of elements that are on screen.
function scanPage(badSource) {
    const bad = new RegExp(badSource, 'u');
    const found = [];
    const note = (where, text) => {
        const m = bad.exec(text);
        if (m) found.push(where + ': "' + text.slice(Math.max(0, m.index - 12), m.index + 12).trim() + '"');
    };
    const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    note('text', document.body.innerText);
    for (const el of document.querySelectorAll('body *')) {
        if (!shown(el)) continue;
        for (const pseudo of ['::before', '::after']) {
            const c = getComputedStyle(el, pseudo).content;
            if (c && c !== 'none' && c !== 'normal') note('content ' + pseudo, c);
        }
        for (const a of ['placeholder', 'title', 'aria-label']) {
            const v = el.getAttribute(a);
            if (v) note(a, v);
        }
        if (el.matches('input[type=button],input[type=submit]') && el.value) note('value', el.value);
    }
    return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Queues what the page's next native dialogs should do and records every one.
// Alerts are accepted; a confirm is accepted while `accept` > 0, else dismissed.
function watchDialogs(page, label, log) {
    const state = { accept: 0 };
    page.on('dialog', async (d) => {
        log.push({ label, type: d.type(), message: d.message() });
        if (d.type() === 'confirm' && state.accept > 0) { state.accept--; await d.accept(); }
        else if (d.type() === 'confirm') await d.dismiss();
        else await d.accept();
    });
    return state;
}

// A real mouse click on the first element matching `sel` (and reading `text`,
// when given): scrolled into view and hit-tested, never a DOM .click().
async function tap(page, sel, text) {
    const h = await page.evaluateHandle((s, t) => Array.from(document.querySelectorAll(s))
        .find((x) => t === undefined || x.textContent.trim() === t) || null, sel, text);
    const el = h.asElement();
    if (!el) throw new Error('no ' + sel + (text === undefined ? '' : ' reading "' + text + '"') + ' to click');
    await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await el.click();
}

// Waits for a native dialog beyond the first `count` to be recorded, so the
// next reload cannot cancel the one the page is about to raise.
async function dialogCame(log, count, label) {
    const end = Date.now() + 20000;
    while (log.length <= count) {
        if (Date.now() > end) throw new Error('timed out after 20s waiting for ' + label);
        await sleep(50);
    }
}

const modalHas = (src) => !!document.querySelector('.modal') &&
    new RegExp(src).test(document.querySelector('.modal').innerText);

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    const problems = [];
    const stops = [];
    const dialogs = [];
    const junk = path.join(os.tmpdir(), 'gym-151-not-a-backup.json');
    fs.writeFileSync(junk, 'this is not json');
    try {
        // One look() per page. `ready` is a function run in the page that is
        // true only once the screen the stop names is up: it is awaited (a
        // timeout fails the case) before the scan, so a stop cannot pass on
        // some other screen.
        const lookFor = (pg) => async (name, ready, ...args) => {
            await waitFor(pg, name + ' to be on screen', ready, ...args);
            const found = await pg.evaluate(scanPage, BAD.source);
            stops.push(name);
            for (const f of found) problems.push(name + ' -> ' + f);
        };
        const newPhone = async () => {
            const pg = await browser.newPage();
            await pg.setViewport({ width: 390, height: 844 });
            return pg;
        };
        // Real click on the modal button whose words match `re`.
        const closeByWord = async (pg, re) => {
            const h = await pg.evaluateHandle((src) => Array.from(document.querySelectorAll('.modal button'))
                .find((x) => new RegExp(src, 'i').test(x.textContent.trim())) || null, re);
            const el = h.asElement();
            if (!el) throw new Error('no modal button matching ' + re);
            await el.click();
            await sleep(300);
        };

        const page = await newPhone();
        const errors = attachConsole(page);
        const confirms = watchDialogs(page, 'workout', dialogs);
        const look = lookFor(page);

        // === Workout app ================================================
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, { workoutHistory: HISTORY });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'anterior-2');
        await sleep(300);

        await look('workout deck, card front', (a) => !!document.querySelector(a), ACTIVE);
        await readDeckCard(page, 'Chest Flies');
        await look("workout deck, open card with PR streak pill",
            (a) => /PR ×[0-9]/.test(document.querySelector(a).innerText), ACTIVE);

        // Swipe down on the open card: the Quick Edit form.
        await swipe(page, 0, 180, { settle: 400 });
        await look('Quick Edit, swipe-down form',
            () => !!document.querySelector('.modal.quick-edit input[data-field="hint"]'));
        await closeByWord(page, '^Cancel$');
        await waitFor(page, 'Quick Edit to close', () => !document.querySelector('.modal.quick-edit'));

        await setWeightAndOpen(page, 'Chest Flies', 200);
        ok(await logCard(page, { settle: 300 }), 'logged Chest Flies');
        await look('workout deck, logged card with PR pill',
            (a) => /Logged/.test(document.querySelector(a).innerText)
                && /PR/.test(document.querySelector(a).innerText), ACTIVE);
        // The celebration holds the logged card, then the deck advances: wait
        // for the active card to be a different exercise.
        await waitFor(page, 'the deck to advance past Chest Flies',
            (a, id) => { const el = document.querySelector(a + ' [data-exercise-id]');
                return !!el && el.getAttribute('data-exercise-id') !== id; }, ACTIVE, FLIES);
        await look('workout deck, after the auto-advance', (a) => !!document.querySelector(a), ACTIVE);

        ok(await submitDay(page), 'pressed Submit Day');
        await look('Day Breakdown modal', () => !!document.querySelector('[data-pr-count]'));
        await closeByWord(page, '^(Close|Done|Got it)$');
        for (let i = 0; i < 30 && !(await page.$(ACTIVE + ' .card-finish')); i++) {
            const arrows = await page.$$('.deck-arrow');
            await arrows[arrows.length - 1].click();
            await sleep(200);
        }
        await look('workout deck, finish card',
            (a) => !!document.querySelector(a + ' .card-finish'), ACTIVE);

        await bottomNav(page, 'History');
        await look('History, rows with Time and Edit', () => {
            const btns = Array.from(document.querySelectorAll('.history-date button')).map((b) => b.textContent.trim());
            return btns.includes('Time') && btns.includes('Edit');
        });

        await tap(page, '.history-date button', 'Time');
        await look('timing details modal', () => !!document.querySelector('.modal [data-timing-total]'));
        await closeByWord(page, '^(Close|Done|Got it)$');

        await tap(page, '.history-date button', 'Edit');
        await look('edit workout modal', modalHas, 'Chest Flies');
        await closeByWord(page, '^(Close|Cancel|Done)$');

        await bottomNav(page, 'Workout');
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await page.click('.settings-btn');
        await look('Settings', modalHas, 'Manage Exercises');
        await tap(page, '.modal-btn', 'Manage Exercises');
        await look('Manage Exercises', () => document.querySelectorAll('.exercise-row').length > 0);
        await tap(page, '.exercise-row .text-btn', 'Edit');
        await look('Manage Exercises, edit form',
            () => !!document.querySelector('.exercise-row select[data-field="increment"]'));

        // Native dialogs from Settings. A fresh load leaves the walk above
        // untouched. Reset All Data: the first confirm is accepted so the
        // second one shows, and that one is dismissed, so nothing is erased.
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await page.click('.settings-btn');
        await waitFor(page, 'Settings', modalHas, 'Reset All Data');
        confirms.accept = 1;
        await tap(page, '.modal-btn', 'Reset All Data');
        await sleep(300);
        const input = await page.$('.modal input[type=file]');
        ok(input, 'Settings has a file input for Import Data');
        const before = dialogs.length;
        await input.uploadFile(junk);
        await dialogCame(dialogs, before, 'the workout bad-backup alert');

        // A device with no history: Submit Day with nothing logged alerts,
        // and History shows its empty state.
        const emptyPage = await newPhone();
        watchDialogs(emptyPage, 'workout, empty', dialogs);
        await emptyPage.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        // Pages in one browser share localStorage, so drop what the first one seeded.
        await emptyPage.evaluate((ns) => {
            localStorage.removeItem(ns + 'gymWorkoutHistory');
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        }, NS);
        await emptyPage.reload({ waitUntil: 'networkidle0' });
        await waitForApp(emptyPage);
        await selectDayType(emptyPage, 'anterior-2');
        await submitDay(emptyPage);
        await sleep(300);
        await bottomNav(emptyPage, 'History');
        await lookFor(emptyPage)('History, empty', () => !!document.querySelector('.empty-state'));
        await emptyPage.close();

        // === Sign-in banner and Settings sign-in states =================
        const bannerPage = await newPhone();
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
        const look2 = lookFor(bannerPage);
        await look2('sign-in banner', () => /Sign in to sync/.test(document.body.innerText));
        await bannerPage.click('.settings-btn');
        await look2('Settings, signed out', modalHas, 'Sign in');
        await bannerPage.evaluate(() => {
            window.repo.mode = 'firestore';
            window.repo.status = () => ({ email: 'josh@example.com', pendingWrites: 2 });
        });
        await closeByWord(bannerPage, '^Close$');
        await bannerPage.click('.settings-btn');
        await look2('Settings, signed in', modalHas, 'Syncing as');
        await bannerPage.close();

        // === Weight app =================================================
        const wpage = await newPhone();
        const werrors = attachConsole(wpage);
        watchDialogs(wpage, 'weight', dialogs);
        const wlook = lookFor(wpage);
        const wgo = async (label) => {
            const h = await wpage.evaluateHandle((l) => Array.from(document.querySelectorAll('.bottom-nav-btn'))
                .find((b) => b.textContent.includes(l)) || null, label);
            const el = h.asElement();
            if (!el) throw new Error('no bottom nav button ' + label);
            await el.click();
            await sleep(400);
        };
        await wpage.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        await wpage.evaluate((ns) => {
            localStorage.setItem(ns + 'weightHistorySeeded', 'true');
            localStorage.setItem(ns + 'gymWeightPlan', 'null');
            localStorage.removeItem(ns + 'gymWeightLog');
        }, NS);
        await wpage.reload({ waitUntil: 'networkidle0' });
        await wlook('weight check-in, empty', () => !!document.querySelector('.weigh-card'));
        await wgo('History');
        await wlook('weight History, empty', () => !!document.querySelector('.empty-state'));

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
        await wlook('weight check-in, with plan and readings', () => !!document.querySelector('.weigh-card'));
        await wgo('History');
        await wlook('weight History, weeks', () => !!document.querySelector('.weigh-week'));
        await wpage.click('.weigh-week-head');
        await wlook('weight History, week opened', () => document.querySelectorAll('.weigh-day').length > 0);
        await wpage.click('.weigh-day-value:not(.na)');
        await wlook('weight History, editing a reading', () => !!document.querySelector('.weigh-day-input'));
        // Deleting a reading asks first; the confirm is dismissed.
        await tap(wpage, '.weigh-day-btn.danger', 'Delete');
        await sleep(300);

        await wpage.click('.settings-btn');
        await wlook('weight Settings, plan saved', modalHas, 'Edit plan');
        await tap(wpage, '.modal .modal-btn', 'Edit plan');
        await wlook('weight Settings, plan form', modalHas, 'Save plan');

        // Native dialogs from weight Settings: Reset All Data (dismissed) and a bad backup.
        await wpage.reload({ waitUntil: 'networkidle0' });
        await waitFor(wpage, 'check-in', () => !!document.querySelector('.weigh-card'));
        await wpage.click('.settings-btn');
        await waitFor(wpage, 'weight Settings', modalHas, 'Reset All Data');
        await tap(wpage, '.modal-btn', 'Reset All Data');
        await sleep(300);
        const winput = await wpage.$('.modal input[type=file]');
        ok(winput, 'weight Settings has a file input for Import Data');
        const wbefore = dialogs.length;
        await winput.uploadFile(junk);
        await dialogCame(dialogs, wbefore, 'the weight bad-backup alert');

        await wpage.evaluate((ns) => localStorage.setItem(ns + 'gymWeightPlan', 'null'), NS);
        await wpage.evaluateOnNewDocument(() => {
            Object.defineProperty(window, 'FIREBASE_READY', { get: () => true, set: () => {} });
        });
        await wpage.reload({ waitUntil: 'networkidle0' });
        await waitFor(wpage, 'check-in', () => !!document.querySelector('.weigh-card'));
        await wpage.click('.settings-btn');
        await wlook('weight Settings, no plan, signed out', modalHas, 'Set a plan');
        await wpage.evaluate(() => {
            window.repo.mode = 'firestore';
            window.repo.status = () => ({ email: 'josh@example.com', pendingWrites: 2 });
        });
        await closeByWord(wpage, '^Close$');
        await wpage.click('.settings-btn');
        await wlook('weight Settings, signed in', modalHas, 'Syncing as');

        // === Dialogs =====================================================
        const said = (re) => dialogs.some((d) => re.test(d.message));
        ok(said(/ARE YOU VERY SURE/), 'captured the workout Reset All Data confirm');
        ok(said(/FINAL WARNING/), 'captured its second confirm');
        ok(said(/Invalid backup file/), 'captured the workout bad-backup alert');
        ok(said(/Please log at least one exercise/), 'captured the Submit Day with nothing logged alert');
        ok(said(/Delete the .* reading/), 'captured the weight delete-reading confirm');
        ok(said(/Delete every weight check-in/), 'captured the weight Reset All Data confirm');
        ok(said(/Could not read that file/), 'captured the weight bad-backup alert');
        for (const d of dialogs) {
            const hit = excerpt(d.message);
            if (hit) problems.push('native ' + d.type + ' (' + d.label + ') -> ' + hit);
        }

        eq(problems, [], 'no emoji in visible text on any screen');
        ok(stops.length >= 24, 'walked every stop (' + stops.length + ')');
        eq(errors, [], 'no console errors in the workout app');
        eq(werrors, [], 'no console errors in the weight app');
        console.log('PASS: no emoji appears on any of ' + stops.length + ' screens and modals, or in ' +
            dialogs.length + ' native dialogs.');
    } finally {
        fs.rmSync(junk, { force: true });
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
