// What this test covers
// ----------------------
// The gesture rules, which are hand-written pointer events — there is no
// gesture library here and no build step to add one — and which are therefore
// entirely ours to get wrong.
//
// Four rules, each of which was a bug at some point in the lab:
//
//   1. NEIGHBOURS ARE MOUNTED. The stage carries previous, current and next on
//      a rail, so a drag slides the adjacent card in from the screen edge
//      rather than revealing black. Without it the deck reads as a page load.
//
//   2. NO SWIPE IS EVER DROPPED. The index commits BEFORE the animation and the
//      rail is then displaced back and travels home. Doing it the obvious way
//      round — animate, then commit when it lands — forces input to be locked
//      out for the length of the animation, which swallows swipes exactly when
//      you are moving through the deck fastest. Four swipes 90ms apart against
//      a 300ms animation must all count.
//
//   3. DISTANCE **OR** SPEED. Distance alone is a bad trade: long enough and a
//      quick flick is ignored, short enough and a card you grabbed to read
//      slides away. A fast flick commits however short it is; a slow drag of
//      the same distance does not.
//
//   4. A DRAG MAY START ON A CONTROL. The deck used to refuse gestures that
//      began on the weight box, the reps dropdown or LOG, which made all three
//      dead zones. Movement decides instead: past the axis lock it is a swipe
//      and the tap is swallowed; below it the control keeps the tap. Dragging
//      off LOG must therefore NOT log.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const {
    ACTIVE, DEFAULT_NS, swipe, swipeFrom, revealCard, activeName,
    deckIndex, selectDeckDay, todayWorkout,
} = require('../lib/deck');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, {});
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), DEFAULT_NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDeckDay(page, 'anterior');

        // === 1. Neighbours ride the rail ===============================
        eq(await page.$$eval('.deck-slot', (e) => e.length), 2,
            'on the first card there is no previous slot, so two are mounted');
        await swipe(page, -170, 0);
        eq(await page.$$eval('.deck-slot', (e) => e.length), 3,
            'with a card either side, all three are mounted');

        // Hold a partial drag: a neighbour must genuinely be on screen.
        await swipe(page, -120, 0, { release: false });
        const sharing = await page.evaluate(() => {
            const stage = document.querySelector('.deck-stage').getBoundingClientRect();
            return Array.from(document.querySelectorAll('.deck-slot')).filter((s) => {
                const r = s.getBoundingClientRect();
                return r.right > stage.left + 4 && r.left < stage.right - 4;
            }).length;
        });
        await page.mouse.up();
        await new Promise((r) => setTimeout(r, 520));
        eq(sharing, 2, 'two cards share the stage mid-drag — the peek, not one card over black');

        // === 2. Fast swipes are not dropped ============================
        const before = await deckIndex(page);
        for (let i = 0; i < 4; i++) await swipe(page, -170, 0, { settle: 90 });
        await new Promise((r) => setTimeout(r, 600));
        eq(await deckIndex(page) - before, 4,
            'four swipes 90ms apart all count — the index commits before the animation, ' +
            'so there is no window in which input is locked out');

        // === 3. Distance OR speed ======================================
        let at = await deckIndex(page);
        await swipe(page, -40, 0, { steps: 3 });                    // short, fast
        eq(await deckIndex(page) - at, 1, 'a short FAST flick advances');

        at = await deckIndex(page);
        await swipe(page, -40, 0, { steps: 8, stepDelay: 45 });     // short, slow
        eq(await deckIndex(page) - at, 0, 'the same distance dragged SLOWLY does not');

        at = await deckIndex(page);
        await swipe(page, -170, 0, { steps: 8, stepDelay: 45 });    // long, slow
        eq(await deckIndex(page) - at, 1, 'a long slow drag still commits');

        at = await deckIndex(page);
        await swipe(page, -12, 0, { steps: 3 });                    // a tap with a wobble
        eq(await deckIndex(page) - at, 0, 'a tap with a wobble is not a swipe');

        // Backwards works too.
        at = await deckIndex(page);
        await swipe(page, 170, 0);
        eq(at - await deckIndex(page), 1, 'swiping the other way goes back one card');

        // === 4. A gesture may start on a control =======================
        await revealCard(page);
        const opened = await activeName(page);

        at = await deckIndex(page);
        await swipeFrom(page, ACTIVE + ' input[type="number"]', -180, 0);
        eq(await deckIndex(page) - at, 1, 'dragging FROM the weight box swipes the deck');

        await swipe(page, 170, 0);
        await revealCard(page);
        at = await deckIndex(page);
        await swipeFrom(page, ACTIVE + ' select[data-field="reps"]', -180, 0);
        eq(await deckIndex(page) - at, 1, 'dragging FROM the reps dropdown swipes the deck');

        await swipe(page, 170, 0);
        await revealCard(page);
        at = await deckIndex(page);
        await swipeFrom(page, ACTIVE + ' .log-btn', -180, 0);
        eq(await deckIndex(page) - at, 1, 'dragging FROM LOG swipes the deck');
        eq(await todayWorkout(page), null,
            'and does NOT log — a fumbled swipe off the button must not record a set ' +
            'you did not do');

        // The other half: a tap still belongs to the control.
        await swipe(page, 170, 0);
        await revealCard(page);
        at = await deckIndex(page);
        await page.click(ACTIVE + ' input[type="number"]');
        eq(await page.evaluate(() =>
            document.activeElement && document.activeElement.type === 'number'), true,
            'tapping the weight box still focuses it');
        eq(await deckIndex(page), at, 'and does not move the deck');

        await page.evaluate((s) => { document.querySelector(s).value = ''; },
            ACTIVE + ' input[type="number"]');
        await page.type(ACTIVE + ' input[type="number"]', '187.5');
        eq(await page.evaluate((s) => document.querySelector(s).value,
            ACTIVE + ' input[type="number"]'), '187.5',
            'and it still accepts typing');

        await page.select(ACTIVE + ' select[data-field="reps"]', '6');
        eq(await page.evaluate((s) => document.querySelector(s).value,
            ACTIVE + ' select[data-field="reps"]'), '6',
            'the reps dropdown still changes value');

        ok(opened, 'a card was opened during this case');
        eq(errors.length, 0, `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: the deck peeks, never drops a swipe, reads speed, and lets a drag start anywhere.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
