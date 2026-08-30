// What this test covers
// ----------------------
// That the page itself cannot scroll or be shoved, including when a keyboard
// opens.
//
// Two problems with one cause. The page used to overflow the viewport by
// exactly the 78px of body padding that cleared a fixed bottom nav — the page
// was permanently taller than the screen by the height of its own navigation —
// and `.app` asked for `min-height: 100vh`, which on a phone is the height with
// the browser chrome HIDDEN and knows nothing about a keyboard.
//
// That overflow is also what let iOS drag the card upward and take the exercise
// name off the top: iOS only scrolls a focused input into view when the page is
// taller than what the keyboard leaves.
//
// WHY overflow:hidden ALONE IS NOT ENOUGH, which is the part worth remembering:
// iOS never scrolls the document when a keyboard opens. It pans the VISUAL
// viewport across the layout viewport, so `window.scrollY` stays 0 the whole
// time. An earlier case here asserted "cannot be scrolled", passed, and told us
// nothing while the phone was still shoving the card. So the shell is pinned
// and counter-translated by `visualViewport.offsetTop` — glued to whatever iOS
// has decided is visible.
//
// Chrome cannot raise an iOS keyboard, but iOS's entire effect on the page is
// expressed through visualViewport, which is also the only surface the app can
// respond to. Stubbing it reproduces the exact condition.
//
// A dropdown is deliberately NOT treated as a keyboard: a picker closes on the
// first tap, and rebuilding the card for it reads as the page lurching.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { ACTIVE, DEFAULT_NS, revealCard, selectDeckDay, bottomNav } = require('../lib/deck');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const VW = 390, VH = 844;
const KEYBOARD = 336;   // roughly what iOS takes
const PAN = 120;        // how far Safari shoves the visible area down

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: VW, height: VH });

        // Replace visualViewport BEFORE the app mounts, so its listeners bind
        // to the stub rather than the real thing.
        await page.evaluateOnNewDocument(() => {
            const vv = new EventTarget();
            vv.height = window.innerHeight;
            vv.width = window.innerWidth;
            vv.offsetTop = 0;
            vv.offsetLeft = 0;
            vv.scale = 1;
            Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
            window.__keyboard = (heightLeft, pan) => {
                vv.height = heightLeft;
                vv.offsetTop = pan;
                vv.dispatchEvent(new Event('resize'));
                vv.dispatchEvent(new Event('scroll'));
            };
        });

        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, {
            workoutHistory: [1, 2, 3].map((d) => ({
                date: new Date(Date.now() - d * 86400000).toISOString(),
                day: 'anterior', week: 1, submitted: true, plateauBusters: [],
                exercises: [{ id: 'chest-press', name: 'Chest Press', category: 'Anterior',
                              type: 'standard', weight: '200', reps: '6' }],
            })),
        });
        await page.evaluate((ns) =>
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now())), DEFAULT_NS);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDeckDay(page, 'anterior');

        const overflow = () => page.evaluate(() => {
            window.scrollTo(0, 99999);
            const scrolled = window.scrollY;
            window.scrollTo(0, 0);
            return { excess: document.documentElement.scrollHeight - window.innerHeight, scrolled };
        });
        const geom = () => page.evaluate((sel) => {
            const q = (s) => {
                const el = document.querySelector(s);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) };
            };
            const slot = document.querySelector(sel);
            const body = slot && slot.querySelector('.card-body');
            const input = slot && slot.querySelector('input[type="number"]');
            return {
                app: q('.app'), name: q(sel + ' .card-open-name'),
                hero: q(sel + ' .hero-weight'), input: q(sel + ' input[type="number"]'),
                log: q(sel + ' .log-btn'),
                kbOpen: document.documentElement.classList.contains('kb-open'),
                clipped: body && input ? !(input.getBoundingClientRect().top >= body.getBoundingClientRect().top - 1
                    && input.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 1) : null,
            };
        }, ACTIVE);

        // === 1. The page cannot scroll, on either tab =================
        let o = await overflow();
        eq(o.excess <= 0, true, 'the workout tab does not overflow the page');
        eq(o.scrolled, 0, 'and cannot be scrolled');
        eq(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden',
            'body overflow is hidden');
        eq(await page.evaluate(() => Math.abs(
            document.querySelector('.app').getBoundingClientRect().height - window.innerHeight) < 2),
            true, 'the shell is exactly the viewport height');

        await bottomNav(page, 'History');
        eq((await overflow()).scrolled, 0, 'the History tab does not scroll the page either');
        eq(await page.evaluate(() => getComputedStyle(document.querySelector('.content')).overflowY),
            'auto', 'but .content scrolls its own list');
        await bottomNav(page, 'Workout');

        // === 2. Settings must still reach its bottom ==================
        // It is taller than a phone and used to lean on the page scroll that no
        // longer exists. Manage Exercises is the pane that actually overflows.
        await page.evaluate(() => document.querySelector('.settings-btn').click());
        await page.waitForSelector('.modal', { timeout: 8000 });
        await page.evaluate(() => {
            const b = Array.from(document.querySelectorAll('.modal button'))
                .find((x) => /Manage Exercises/i.test(x.textContent));
            if (b) b.click();
        });
        await new Promise((r) => setTimeout(r, 400));
        const modal = await page.evaluate(() => {
            const m = document.querySelector('.modal');
            m.scrollTop = 999999;
            const r = m.getBoundingClientRect();
            return {
                overflowY: getComputedStyle(m).overflowY,
                scrollable: m.scrollHeight > m.clientHeight,
                atBottom: Math.abs(m.scrollTop + m.clientHeight - m.scrollHeight) < 2,
                fits: r.top >= -1 && r.bottom <= window.innerHeight + 1,
            };
        });
        eq(modal.overflowY, 'auto', 'Settings carries its own scroll');
        eq(modal.fits, true, 'and fits on screen');
        eq(modal.scrollable, true,
            'Manage Exercises is genuinely taller than the phone — if this is false the ' +
            'case is not exercising the scroll it claims to');
        eq(modal.atBottom, true, 'and it can be scrolled to the bottom');
        eq((await overflow()).scrolled, 0, 'opening it still does not scroll the page');
        await page.evaluate(() => {
            const b = Array.from(document.querySelectorAll('.modal-btn'))
                .find((x) => /close|done|cancel/i.test(x.textContent));
            if (b) b.click(); else document.querySelector('.modal-overlay').click();
        });
        await new Promise((r) => setTimeout(r, 400));

        // === 3. The keyboard =========================================
        await revealCard(page);
        const before = await geom();
        eq(before.app.top, 0, 'with no keyboard the app starts at the top');
        eq(before.kbOpen, false, 'and no keyboard state is set');

        await page.focus(ACTIVE + ' input[type="number"]');
        await page.evaluate((h, p) => window.__keyboard(h, p), VH - KEYBOARD, PAN);
        await new Promise((r) => setTimeout(r, 400));

        const visibleTop = PAN;
        const visibleBottom = PAN + (VH - KEYBOARD);
        const after = await geom();

        eq(after.kbOpen, true, 'focusing a text field sets the keyboard state');
        eq(after.app.top, visibleTop,
            'the app moved DOWN to sit under the visible band — iOS panned the visual ' +
            'viewport, and a fixed element that ignored that would slide off the top');
        eq(after.app.height, VH - KEYBOARD, 'and shrank to exactly what the keyboard left');

        const onScreen = (r) => r.top >= visibleTop - 1 && r.bottom <= visibleBottom + 1;
        eq(onScreen(after.name), true,
            'THE BUG: the exercise name is still visible rather than pushed off the top');
        eq(onScreen(after.input), true, 'the weight field is visible');
        eq(onScreen(after.log), true, 'and LOG is visible');
        eq(after.clipped, false,
            'and the field is inside card-body\'s clip, not merely at the right coordinates');
        eq(after.hero.height, 0,
            'the big hero number stands down — it holds the same value as the field, so ' +
            'with the keyboard up the field takes its place rather than being clipped ' +
            'out of existence beneath it');

        // === 4. A dropdown is NOT a keyboard ==========================
        await page.evaluate(() => document.activeElement && document.activeElement.blur());
        await page.evaluate((h) => window.__keyboard(h, 0), VH);
        await new Promise((r) => setTimeout(r, 350));

        const restPositions = await page.evaluate((sel) => {
            const t = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null; };
            return { hero: t(sel + ' .hero-weight'), toggle: t('.day-toggle'),
                     foot: t('.deck-foot'), log: t(sel + ' .log-btn') };
        }, ACTIVE);
        await page.focus(ACTIVE + ' select[data-field="reps"]');
        await new Promise((r) => setTimeout(r, 350));
        const afterSelect = await page.evaluate((sel) => {
            const t = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null; };
            return { hero: t(sel + ' .hero-weight'), toggle: t('.day-toggle'),
                     foot: t('.deck-foot'), log: t(sel + ' .log-btn') };
        }, ACTIVE);

        eq(await page.evaluate(() => document.documentElement.classList.contains('kb-open')), false,
            'focusing the reps dropdown does NOT set the keyboard state — a picker closes ' +
            'on the first tap, and rebuilding the card for it reads as the page lurching');
        eq(afterSelect, restPositions, 'and nothing on the card moves');

        // === 5. Dismissing puts everything back =======================
        await page.evaluate(() => document.activeElement && document.activeElement.blur());
        await new Promise((r) => setTimeout(r, 300));
        const back = await geom();
        eq(back.app.top, 0, 'dismissing the keyboard puts the app back at the top');
        eq(back.app.height, VH, 'and back to full height');
        ok(back.hero.height > 0, 'and the hero number returns');
        ok(await page.$(ACTIVE + ' .breakdown'), 'as does the warmup breakdown');

        eq(errors.length, 0, `no console errors (got: ${JSON.stringify(errors)})`);
        console.log('PASS: the page cannot scroll or be shoved, and the keyboard leaves the card alone.');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
