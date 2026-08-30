// What this test covers
// ----------------------
// That an opened card always fits the screen, on every phone size, with no
// scrollbar of its own.
//
// The card body used to be `overflow-y: auto`, which was wrong twice over. The
// premise of this screen is one exercise, one screen — a card you have to
// scroll is not one screen. And a scrollable region nested inside a
// `touch-action: none` stage competes with the horizontal swipe, which iOS
// resolves in the scroller's favour, so the card that needed scrolling was also
// the card that was awkward to swipe off.
//
// The body never scrolls now. Its contents are measured against the space
// available and scaled down only when they do not fit, anchored at the top so
// the hero number stays where the eye expects it. The measurement reads
// scrollHeight, which is the UNSCALED layout height — a CSS transform never
// feeds back into layout — so it cannot chase its own tail.
//
// Scaling is a safety net, not a design, so this checks it stays idle at normal
// phone sizes and only engages on a short screen.
//
// The assertion that matters is NOT "the element is at the right coordinates".
// card-body clips, so an element can measure perfectly and still be invisible.
// It asks whether the field lies inside the clip — a distinction that hid a real
// bug in the lab, where the weight input was being cut off while the geometry
// said it was fine.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { ACTIVE, DEFAULT_NS, revealCard, swipe, activeName, selectDeckDay } = require('../lib/deck');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// A small phone, a normal one, and a big one. The first is the one that has to
// scale; the others must not.
const DEVICES = [
    ['iPhone SE', 375, 667, true],
    ['iPhone 13', 390, 844, false],
    ['Pixel 7', 412, 915, false],
];

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        for (const [label, width, height, mayScale] of DEVICES) {
            const page = await browser.newPage();
            const errors = attachConsole(page);
            await page.setViewport({ width, height });
            await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

            // A heavy plate-loaded machine: the tallest the breakdown ever
            // gets, because every set lists its own plates.
            await seedPersonalApp(page, {
                workoutHistory: [{
                    date: new Date(Date.now() - 86400000).toISOString(),
                    day: 'anterior', week: 1, submitted: true, plateauBusters: [],
                    exercises: [{ id: 'chest-press', name: 'Chest Press', category: 'Anterior',
                                  type: 'standard', weight: '287.5', reps: '6' }],
                }],
            });
            await page.evaluate((ns) =>
                localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), DEFAULT_NS);
            await page.reload({ waitUntil: 'networkidle0' });
            await waitForApp(page);
            await selectDeckDay(page, 'anterior');
            await revealCard(page);

            const m = await page.evaluate((sel) => {
                const slot = document.querySelector(sel);
                const body = slot.querySelector('.card-body');
                const fit = slot.querySelector('.card-fit');
                const card = slot.querySelector('.card');
                const stage = document.querySelector('.deck-stage').getBoundingClientRect();
                const inside = (el) => {
                    const a = body.getBoundingClientRect();
                    const b = el.getBoundingClientRect();
                    return b.top >= a.top - 1.5 && b.bottom <= a.bottom + 1.5;
                };
                const onStage = (el) => {
                    const r = el.getBoundingClientRect();
                    return r.top >= stage.top - 1 && r.bottom <= stage.bottom + 1;
                };
                return {
                    open: !!slot.querySelector('.card-open'),
                    overflowY: getComputedStyle(body).overflowY,
                    // Deliberately NOT measuring scrollHeight or scrollTop
                    // here. Both look like the obvious check and both are
                    // wrong for this layout: the scaler shrinks the contents
                    // with a transform, and a transform never feeds back into
                    // layout, so scrollHeight stays at the UNSCALED height and
                    // exceeds clientHeight whenever scaling engages — while
                    // nothing is actually cut off. scrollTop is no better,
                    // because an overflow:hidden box is still scrollable from
                    // script even though no user can scroll it. The two
                    // questions that mean something are: is overflow hidden
                    // (so it cannot take the swipe), and is the content inside
                    // the clip (so none of it is lost).
                    needed: fit.scrollHeight,
                    available: body.clientHeight,
                    transform: getComputedStyle(fit).transform,
                    // Painted visibility, not coordinates.
                    inputInsideClip: inside(slot.querySelector('input[type="number"]')),
                    repsInsideClip: inside(slot.querySelector('select[data-field="reps"]')),
                    nameOnStage: onStage(slot.querySelector('.card-open-name')),
                    logOnStage: onStage(slot.querySelector('.log-btn')),
                    cardOnStage: card.getBoundingClientRect().bottom <= stage.bottom + 1,
                };
            }, ACTIVE);

            eq(m.open, true, `[${label}] the card is open`);
            eq(m.overflowY, 'hidden',
                `[${label}] the card body never scrolls — a scroller here fights the swipe`);

            eq(m.inputInsideClip, true,
                `[${label}] the weight field is inside the clip, not merely at the right ` +
                'coordinates — card-body hides overflow, so geometry alone proves nothing');
            eq(m.repsInsideClip, true, `[${label}] and so is the reps dropdown`);
            eq(m.nameOnStage, true, `[${label}] the exercise name is on screen`);
            eq(m.logOnStage, true, `[${label}] LOG is on screen`);
            eq(m.cardOnStage, true, `[${label}] and the card fits the stage`);

            const scaled = m.transform !== 'none' && !/matrix\(1, 0, 0, 1/.test(m.transform);
            if (!mayScale) {
                eq(scaled, false,
                    `[${label}] no scaling should be needed at this size — it wanted ` +
                    `${m.needed}px of ${m.available}px. Scaling here means the layout has ` +
                    'grown and the safety net is doing work the design should');
            }
            ok(true, `[${label}] ${m.needed}px of ${m.available}px` +
                (scaled ? ' (scaled to fit)' : ' (no scaling)'));

            // A revealed card must still be swipeable — the original complaint.
            const before = await activeName(page);
            await swipe(page, -180, 0);
            const after = await activeName(page);
            ok(after && after !== before,
                `[${label}] a revealed card can still be swiped away`);

            eq(errors.length, 0, `[${label}] no console errors (got: ${JSON.stringify(errors)})`);
            await page.close();
        }

        console.log('PASS: an open card fits the screen at every size, and never grows a scrollbar.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
