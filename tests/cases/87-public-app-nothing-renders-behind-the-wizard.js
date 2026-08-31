// What this test covers
// ----------------------
// That the workout screen does not render behind the setup wizard.
//
// The coach-code path writes the program and only THEN hands it to App: the
// wizard plays a ~6 second welcome animation, and `onComplete` — which is what
// populates exercisesByDay and schedule — does not fire until it finishes. For
// that whole window App was rendering the wizard AND the workout screen, with
// exercisesByDay still {}.
//
// The deck read that as a day with no exercises and drew the degenerate case:
// totalWorkoutDays 0, so no day pills at all, and finishIndex 0, so the finish
// card ("Nothing logged yet") as the only slot. Both were visible around the
// animation for six seconds, and it looked like the program had failed to load
// — a refresh "fixed" it, because by then onComplete had run.
//
// Case 63 could not catch this: it reloads before entering the coach code and
// only ever asserts the settled state.
//
// The old list screen had the same hole and hid it better — an empty list looks
// like nothing, where an empty deck actively says "Nothing logged yet".
//
// Mutation to try: drop the `!showWizard &&` guard around the header/content/
// bottom-nav in App.jsx. The during-animation assertions below fail.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitFor, waitForStorageKey } = require('../lib/browser');
const { eq, ok } = require('../lib/assert');
const { PUBLIC_APP_ROOT } = require('../lib/paths');

const NS = 'gym-local:';
const IAN_CODE = 'D2O0O1M7';

const readScreen = (page) => page.evaluate(() => {
    const pills = Array.from(document.querySelectorAll('.day-pill'));
    return {
        wizardUp: Array.from(document.querySelectorAll('button'))
            .some(b => /have a coach/i.test(b.textContent))
            || !!document.querySelector('input[type="text"]')
            || !!document.querySelector('[class*="welcome"]'),
        deckStage: !!document.querySelector('.deck-stage'),
        bottomNav: !!document.querySelector('.bottom-nav'),
        header: !!document.querySelector('.header'),
        dayPills: pills.length,
        deckCount: (document.querySelector('.deck-count') || {}).textContent || null,
        finishCard: !!document.querySelector('.card-finish'),
    };
});

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'networkidle0' });
        await waitFor(page, 'the setup wizard to render',
            () => Array.from(document.querySelectorAll('button'))
                .some(b => /have a coach/i.test(b.textContent)));

        // === 1. Nothing behind the wizard on its very first screen =====
        let screen = await readScreen(page);
        ok(screen.wizardUp, 'the wizard is showing');
        eq(screen.deckStage, false, 'no deck behind the wizard');
        eq(screen.bottomNav, false, 'no bottom nav behind the wizard');
        eq(screen.header, false, 'no header behind the wizard');

        // === 2. Nor during the welcome animation =======================
        // This is the window the bug lived in: the config is already written to
        // storage, but onComplete has not run, so App's state is still empty.
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button'))
                .find(b => /have a coach/i.test(b.textContent));
            btn.click();
        });
        await waitFor(page, 'the coach-code input to appear',
            () => !!document.querySelector('input[type="text"]'));
        await page.evaluate((c) => {
            const input = document.querySelector('input[type="text"]');
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, c);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const btn = Array.from(document.querySelectorAll('button'))
                .find(b => !b.disabled && /load|submit|continue|start|next/i.test(b.textContent));
            btn.click();
        }, IAN_CODE);

        // The config lands well before the animation ends — that gap IS the bug.
        await waitForStorageKey(page, NS, 'gymExerciseConfig');
        await new Promise(r => setTimeout(r, 400));

        screen = await readScreen(page);
        ok(screen.wizardUp,
            'the welcome animation is still playing after the config was written');
        eq(screen.deckStage, false,
            'no deck is drawn behind the animation — with exercisesByDay still empty it ' +
            'would have no day pills and would sit on the finish card');
        eq(screen.finishCard, false, 'and certainly no "Nothing logged yet" finish card');
        eq(screen.dayPills, 0, 'no day pills behind the animation');

        // === 3. Once the wizard hands over, the program is there =======
        await waitFor(page, 'the deck to render Ian\'s program', () => {
            const c = document.querySelector('.deck-count');
            return !!c && /of \d+/.test(c.textContent) && !/finish/.test(c.textContent);
        });

        screen = await readScreen(page);
        eq(screen.wizardUp, false, 'the wizard is gone');
        eq(screen.deckStage, true, 'the deck is showing');
        eq(screen.dayPills, 2, 'both of his days have a pill');
        ok(/of 11|of 9/.test(screen.deckCount),
            `the deck holds one of his two rosters (got "${screen.deckCount}")`);

        eq(errors, [], `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: the workout screen stays out of sight until the wizard hands over.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch((err) => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
