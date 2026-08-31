// What this test covers
// ----------------------
// That the `kb-open` class cannot outlive the field that caused it.
//
// While a text field has focus, <html> carries `kb-open` and the CSS hides the
// day pills and the deck footer, so the card can keep its own space while the
// keyboard is up. The class is added on focusin and removed on focusout.
//
// focusout is NOT dispatched reliably when the focused element is REMOVED from
// the document. Chromium sends it; Firefox does not. The setup wizard does
// exactly that — the coach-code input still has focus when the wizard unmounts
// — so on Firefox the class stuck on <html> for the rest of the session. The
// program had loaded correctly and looked broken: a card with no day pills
// above it and no footer below, "fixed" by a refresh.
//
// That difference is why this case forces the class rather than trusting the
// browser to strand it. Under Chromium the natural path already cleans up, so
// a test that merely completed the wizard and checked would pass with or
// without the fix — it would be green here and useless where the bug lives.
//
// The recovery is a render-time invariant in App.jsx rather than another
// listener, because a render is the one thing that reliably happens when the
// focused node goes away.
//
// Mutation to try: delete the no-dependency-array useEffect from App.jsx that
// removes the class. Both halves below fail.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, waitFor } = require('../lib/browser');
const { seedPublicApp, jessiDefaultSchedule, DEFAULT_NS } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { PUBLIC_APP_ROOT } = require('../lib/paths');
const { ACTIVE, goToCard, revealCard, stepTo } = require('../lib/deck');

function config() {
    return {
        version: 2,
        days: {
            1: [
                { id: 'ex-a', name: 'Chest Press', category: 'Push', typeId: 'standard',
                  sets: 3, minReps: 5, maxReps: 8, order: 0,
                  startingWeight: '100', loadType: 'plate-two-sided' },
                { id: 'ex-b', name: 'Shoulder Press', category: 'Push', typeId: 'standard',
                  sets: 3, minReps: 5, maxReps: 8, order: 1,
                  startingWeight: '60', loadType: 'pin' },
            ],
            2: [
                { id: 'ex-c', name: 'Seated Row', category: 'Pull', typeId: 'standard',
                  sets: 3, minReps: 5, maxReps: 8, order: 0, loadType: 'pin' },
            ],
        },
        categories: ['Push', 'Pull'],
        repsDropdown: { min: 5, max: 8 },
    };
}

const chrome = (page) => page.evaluate(() => ({
    kbOpen: document.documentElement.classList.contains('kb-open'),
    dayToggleVisible: (() => {
        const t = document.querySelector('.day-toggle');
        return t ? getComputedStyle(t).display !== 'none' : null;
    })(),
    deckFootVisible: (() => {
        const f = document.querySelector('.deck-foot');
        return f ? getComputedStyle(f).display !== 'none' : null;
    })(),
}));

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPublicApp(page, {
            exerciseConfig: config(),
            schedule: jessiDefaultSchedule(),
            workoutHistory: [],
        });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), DEFAULT_NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // === 1. A stranded class is cleaned up on the next render =======
        // Exactly the state Firefox is left in after the wizard unmounts with
        // the coach-code input focused: the class is set, and nothing has
        // focus to take it back off.
        await page.evaluate(() => document.documentElement.classList.add('kb-open'));
        let before = await chrome(page);
        ok(before.kbOpen, 'the class is stranded on <html> with nothing focused');
        eq(before.dayToggleVisible, false, 'and it really does hide the day pills');
        eq(before.deckFootVisible, false, 'and the deck footer');

        // Any render at all should settle it. Switching card is one.
        await stepTo(page, 2);
        await new Promise((r) => setTimeout(r, 400));

        let after = await chrome(page);
        eq(after.kbOpen, false,
            'the stranded class is removed once something renders — no focusout required');
        eq(after.dayToggleVisible, true, 'the day pills are back');
        eq(after.deckFootVisible, true, 'and so is the deck footer');

        // === 2. It is not removed while a field really is focused =======
        // The cleanup must not fight the feature it is protecting.
        await goToCard(page, 'Chest Press');
        await revealCard(page);
        await page.focus(ACTIVE + ' input[type="number"]');
        await page.type(ACTIVE + ' input[type="number"]', '5', { delay: 20 });
        await new Promise((r) => setTimeout(r, 300));

        const typing = await chrome(page);
        ok(typing.kbOpen, 'typing into the weight field still sets the class');
        eq(typing.dayToggleVisible, false,
            'and the pills still step aside for the keyboard');

        // === 3. Swiping away from the card puts it back =================
        // The field is about to be unmounted; the deck blurs it first rather
        // than relying on the removal being reported.
        await stepTo(page, 2);
        await new Promise((r) => setTimeout(r, 400));

        after = await chrome(page);
        eq(after.kbOpen, false, 'leaving the card puts the keyboard away');
        eq(after.dayToggleVisible, true, 'and brings the pills back');

        eq(errors, [], `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: kb-open cannot outlive the field that set it.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch((err) => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
