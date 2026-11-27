// What this test covers
// ----------------------
// The text buttons that replaced the icon buttons (Settings, History's Time and
// Edit, Manage Exercises' Edit / up / down, weight History's reading and NA
// buttons) are big enough to hit with a thumb, and Manage Exercises still fits
// its row with a long custom name.
//
// Tap targets. Both pages ask for initial-scale 0.75, so a phone renders every
// CSS px at 0.75 of a device-independent px: a 44px box on the stylesheet is
// only 33px under the thumb. The test therefore emulates a 390px-wide touch
// phone, checks the page really did land on 0.75, and measures each button with
// getBoundingClientRect multiplied by that scale. Each must be at least 44
// rendered px tall and wide (with 1px of slack for rounding).
//
// Fit. An unbroken custom exercise name must not push the up / down / Edit
// buttons past the row at 390px and 320px of layout width (narrower than a
// phone ever lays the page out at 0.75, so this is the strict case), and the
// modal must not scroll sideways. When the row is too narrow the three buttons
// wrap together below the name, so the name keeps at least 80 px (checked at
// 320 and 390 CSS px on a desktop and on the 390px phone).
//
// Mutation check: set .text-btn's min-height back to 44px and the tap-target
// check names the button; drop min-width:0 from .exercise-row-name and the fit
// check names the width.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, waitFor, setNow } = require('../lib/browser');
const { seedPersonalApp, seedExerciseConfig, workoutEntry } = require('../lib/state');
const { bottomNav } = require('../lib/deck');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';
const MIN = 44;
const MIN_NAME = 80; // rendered px the exercise name must keep beside its controls
const LONG = 'Supercalifragilisticexpialidocious' + 'Pneumonoultramicroscopic'.repeat(2);
// 8 p.m. on a Monday in Phoenix: the moment a UTC date slice put Sunday's
// check-in into Monday and failed this case. Pinned so the case never depends
// on the day or hour it runs.
const NOW = '2026-11-23T20:00:00-07:00';
const FLIES = 'pecs-transverse-shoulder-adduction';

// Evaluated in the page: rendered size (CSS px times the page's real scale) of
// every element matching `sel` that is on screen.
function measure(sel, ratio) {
    return Array.from(document.querySelectorAll(sel))
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => {
            const r = el.getBoundingClientRect();
            return { text: el.textContent.trim().slice(0, 16), w: r.width * ratio, h: r.height * ratio };
        });
}

// Buttons the scan below does not hold to MIN yet. They are outside the text-button
// work (#30): the bottom nav, the deck's steppers and the like were never
// restyled for thumbs. Listed so the scan can run on every other button;
// Josh decides which of these to enlarge. An entry is a CSS selector; delete it
// once the button passes.
const ALLOWLIST = [
    '.bottom-nav-btn', // both apps' bottom bar: ~182x34 rendered, wide but short
    '.deck-arrow',     // the swipe deck's next / previous arrows: ~28x28 rendered
    '.day-pill',       // Settings' Anterior / Posterior toggle and weight History's 7d / 30d / 6mo / All: ~25 rendered tall
    '.modal-btn',      // Settings and Manage Exercises' full-width modal buttons: ~31 rendered tall
];

// Evaluated in the page: rendered size of EVERY visible, enabled button on the
// screen (<button>, role=button, input buttons), not a hand-picked list, so a
// new button cannot dodge the check by being absent from it.
function measureAll(ratio, allow) {
    return Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'))
        .filter((el) => el.getClientRects().length > 0 && !el.disabled && el.getAttribute('aria-disabled') !== 'true')
        .filter((el) => !allow.some((sel) => el.matches(sel)))
        .map((el) => {
            const r = el.getBoundingClientRect();
            const label = el.textContent.trim().slice(0, 16) || el.getAttribute('aria-label') || '';
            return { text: label, cls: String(el.className).slice(0, 40), w: r.width * ratio, h: r.height * ratio };
        });
}

const clickText = async (page, sel, text) => {
    const h = await page.evaluateHandle((s, t) => Array.from(document.querySelectorAll(s))
        .find((b) => b.textContent.trim() === t) || null, sel, text);
    const el = h.asElement();
    ok(el, 'found ' + sel + ' reading "' + text + '"');
    await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await el.click();
};

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    const problems = [];
    try {
        // === Tap targets on a 390px touch phone ===========================
        const phone = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
        const page = await browser.newPage();
        await page.setViewport(phone);
        const errors = attachConsole(page);
        const ratio = () => page.evaluate(() => 390 / document.documentElement.clientWidth);
        const check = async (stop, sel, expectCount) => {
            const boxes = await page.evaluate(measure, sel, await ratio());
            ok(boxes.length >= expectCount, stop + ': found ' + boxes.length + ' x ' + sel + ', wanted ' + expectCount);
            for (const b of boxes) {
                if (b.w < MIN - 1 || b.h < MIN - 1) {
                    problems.push(stop + ' ' + sel + ' "' + b.text + '" renders ' +
                        b.w.toFixed(1) + 'x' + b.h.toFixed(1));
                }
            }
        };

        const scan = async (pg, stop, ratioFn) => {
            const boxes = await pg.evaluate(measureAll, await ratioFn(), ALLOWLIST);
            ok(boxes.length > 0, stop + ': the scan found buttons');
            for (const b of boxes) {
                if (b.w < MIN - 1 || b.h < MIN - 1) {
                    problems.push(stop + ' button "' + b.text + '" (.' + b.cls + ') renders ' +
                        b.w.toFixed(1) + 'x' + b.h.toFixed(1));
                }
            }
        };

        await setNow(page, NOW);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        const version = await page.evaluate(() => EXERCISE_CONFIG_VERSION);
        // Monday of this week, so the entry is on History's default page whatever
        // day the suite runs. startedAt and loggedAt are what make the Time button appear.
        const day = new Date();
        day.setHours(0, 0, 0, 0);
        const dow = day.getDay();
        day.setDate(day.getDate() + (dow === 0 ? -6 : 1 - dow));
        day.setHours(9, 0, 0, 0);
        const stamp = (min) => new Date(day.getTime() + min * 60000).toISOString();
        await seedPersonalApp(page, {
            workoutHistory: [workoutEntry({
                date: day.toISOString(), day: 'anterior-2',
                exercises: [{ id: FLIES, name: 'Chest Flies', weight: '100', reps: '8',
                    startedAt: stamp(0), loggedAt: stamp(6) }],
            })],
        });
        await seedExerciseConfig(page, { version, overrides: { [FLIES]: { name: LONG } } });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        const scale = await ratio();
        ok(Math.abs(scale - 0.75) < 0.02, 'the phone lays the workout page out at 0.75 (got ' + scale.toFixed(3) + ')');

        await check('workout header', '.settings-btn', 1);
        await scan(page, 'workout', ratio);
        await bottomNav(page, 'History');
        await page.waitForSelector('.history-item', { timeout: 8000 });
        await check('workout History', '.history-date .text-btn', 2);
        await scan(page, 'workout History', ratio);
        await bottomNav(page, 'Workout');
        await page.click('.settings-btn');
        await waitFor(page, 'Settings', () => !!document.querySelector('.modal .modal-title'));
        await scan(page, 'Settings', ratio);
        await clickText(page, '.modal-btn', 'Manage Exercises');
        await waitFor(page, 'exercise rows', () => document.querySelectorAll('.exercise-row').length > 0);
        await scan(page, 'Manage Exercises (all)', ratio);
        await check('Manage Exercises', '.exercise-row .text-btn', 3);
        const phoneName = await page.evaluate((id) =>
            document.querySelector('[data-exercise-id="' + id + '"] .exercise-row-name')
                .getBoundingClientRect().width, FLIES);
        ok(phoneName * (await ratio()) >= MIN_NAME,
            'phone: the name keeps a usable width (' + Math.round(phoneName * (await ratio())) + ' rendered px)');
        await page.close();

        // Weight app, same phone.
        const wpage = await browser.newPage();
        await wpage.setViewport(phone);
        await setNow(wpage, NOW);
        const werrors = attachConsole(wpage);
        const wratio = () => wpage.evaluate(() => 390 / document.documentElement.clientWidth);
        await wpage.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        // Two completed weeks (the one before last Monday and the one before
        // that), keyed by local day, so the result does not depend on the
        // weekday, the time of day or the time zone the suite runs in. The
        // later week skips Wednesday and Saturday so it has NA rows too; it is
        // the one opened below, by its label.
        const openLabel = await wpage.evaluate((ns) => {
            const monday = getMondayOfWeek(new Date());
            const at = (weeks, i) => {
                const d = new Date(monday);
                d.setDate(d.getDate() - 7 * weeks + i);
                return d;
            };
            const log = [];
            for (let weeks = 2; weeks >= 1; weeks--) {
                for (let i = 0; i < 7; i++) {
                    if (weeks === 1 && (i === 2 || i === 5)) continue;
                    const key = localDayKey(at(weeks, i));
                    log.push({ date: key, weight: 180 - (weeks * 7 - i) * 0.2, loggedAt: key + 'T14:30:00.000Z' });
                }
            }
            localStorage.setItem(ns + 'weightHistorySeeded', 'true');
            localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
            return 'Week of ' + formatShortDay(localDayKey(at(1, 0)));
        }, NS);
        await wpage.reload({ waitUntil: 'networkidle0' });
        await waitFor(wpage, 'check-in', () => !!document.querySelector('.weigh-card'));
        const wscale = await wratio();
        ok(Math.abs(wscale - 0.75) < 0.02, 'the phone lays the weight page out at 0.75 (got ' + wscale.toFixed(3) + ')');
        const wcheck = async (stop, sel, expectCount) => {
            const boxes = await wpage.evaluate(measure, sel, await wratio());
            ok(boxes.length >= expectCount, stop + ': found ' + boxes.length + ' x ' + sel + ', wanted ' + expectCount);
            for (const b of boxes) {
                if (b.w < MIN - 1 || b.h < MIN - 1) {
                    problems.push(stop + ' ' + sel + ' "' + b.text + '" renders ' +
                        b.w.toFixed(1) + 'x' + b.h.toFixed(1));
                }
            }
        };
        await wcheck('weight header', '.settings-btn', 1);
        await scan(wpage, 'weight check-in', wratio);
        await (await wpage.evaluateHandle(() => Array.from(document.querySelectorAll('.bottom-nav-btn'))
            .find((b) => b.textContent.includes('History')))).click();
        await waitFor(wpage, 'weekly ledger', () => !!document.querySelector('.weigh-week'));
        const head = await wpage.evaluateHandle((label) => Array.from(document.querySelectorAll('.weigh-week-head'))
            .find((h) => h.textContent.includes(label)) || null, openLabel);
        ok(head.asElement(), 'found the ledger row "' + openLabel + '"');
        await head.asElement().click();
        await waitFor(wpage, 'opened week', () => document.querySelectorAll('.weigh-day-value').length > 0);
        await wcheck('weight History reading', '.weigh-day-value:not(.na)', 1);
        await wcheck('weight History NA', '.weigh-day-value.na', 1);
        await scan(wpage, 'weight History', wratio);
        await wpage.close();

        eq(Array.from(new Set(problems)), [], 'every text button is at least ' + MIN + ' rendered px each way');

        // === Manage Exercises fits at the narrowest layouts ===============
        for (const width of [390, 320]) {
            const p = await browser.newPage();
            await p.setViewport({ width, height: 844 });
            await p.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
            await seedPersonalApp(p, {});
            await seedExerciseConfig(p, { version, overrides: { [FLIES]: { name: LONG } } });
            await p.reload({ waitUntil: 'networkidle0' });
            await waitForApp(p);
            await p.click('.settings-btn');
            await waitFor(p, 'Settings', () => !!document.querySelector('.modal .modal-title'));
            await clickText(p, '.modal-btn', 'Manage Exercises');
            await p.waitForSelector('[data-exercise-id="' + FLIES + '"]', { timeout: 8000 });
            const fit = await p.evaluate((id) => {
                const row = document.querySelector('[data-exercise-id="' + id + '"]');
                const rr = row.getBoundingClientRect();
                const out = [];
                for (const el of row.querySelectorAll('button, .exercise-row-name')) {
                    const r = el.getBoundingClientRect();
                    if (r.right > rr.right + 0.5 || r.left < rr.left - 0.5) {
                        out.push((el.textContent.trim().slice(0, 12) || el.className) +
                            ' spills to ' + Math.round(r.right) + ' past ' + Math.round(rr.right));
                    }
                }
                const modal = row.closest('.modal');
                const sideways = modal ? modal.scrollWidth - modal.clientWidth : 0;
                const buttons = Array.from(row.querySelectorAll('button')).map((b) => b.textContent.trim());
                const nameW = row.querySelector('.exercise-row-name').getBoundingClientRect().width;
                return { out, sideways, buttons, nameW };
            }, FLIES);
            eq(fit.buttons.slice(0, 3), ['↑', '↓', 'Edit'], width + 'px: the long-named row still has its three buttons');
            eq(fit.out, [], width + 'px: nothing in the long-named row spills out of it');
            ok(fit.nameW >= MIN_NAME, width + 'px: the name keeps a usable width (' + Math.round(fit.nameW) + ')');
            ok(fit.sideways <= 0, width + 'px: the modal does not scroll sideways (' + fit.sideways + ')');
            await p.close();
        }

        eq(errors, [], 'no console errors in the workout app');
        eq(werrors, [], 'no console errors in the weight app');
        console.log('PASS: text buttons are thumb-sized as rendered and Manage Exercises fits a long name.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
