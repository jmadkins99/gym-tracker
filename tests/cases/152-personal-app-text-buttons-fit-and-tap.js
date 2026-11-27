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
// modal must not scroll sideways.
//
// Mutation check: set .text-btn's min-height back to 44px and the tap-target
// check names the button; drop min-width:0 from .exercise-row-name and the fit
// check names the width.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, waitFor } = require('../lib/browser');
const { seedPersonalApp, seedExerciseConfig, workoutEntry } = require('../lib/state');
const { bottomNav } = require('../lib/deck');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';
const MIN = 44;
const LONG = 'Supercalifragilisticexpialidocious' + 'Pneumonoultramicroscopic'.repeat(2);
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
        await bottomNav(page, 'History');
        await page.waitForSelector('.history-item', { timeout: 8000 });
        await check('workout History', '.history-date .text-btn', 2);
        await bottomNav(page, 'Workout');
        await page.click('.settings-btn');
        await waitFor(page, 'Settings', () => !!document.querySelector('.modal .modal-title'));
        await clickText(page, '.modal-btn', 'Manage Exercises');
        await waitFor(page, 'exercise rows', () => document.querySelectorAll('.exercise-row').length > 0);
        await check('Manage Exercises', '.exercise-row .text-btn', 3);
        await page.close();

        // Weight app, same phone.
        const wpage = await browser.newPage();
        await wpage.setViewport(phone);
        const werrors = attachConsole(wpage);
        const wratio = () => wpage.evaluate(() => 390 / document.documentElement.clientWidth);
        await wpage.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        await wpage.evaluate((ns) => {
            const day = (n) => {
                const d = new Date();
                d.setDate(d.getDate() - n);
                return d.toISOString().split('T')[0];
            };
            const log = [];
            // Skip some days so the opened week has NA rows too.
            for (let n = 21; n >= 1; n--) {
                if (n % 3 === 0) continue;
                log.push({ date: day(n), weight: 180 - n * 0.2, loggedAt: day(n) + 'T14:30:00.000Z' });
            }
            localStorage.setItem(ns + 'weightHistorySeeded', 'true');
            localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
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
        await (await wpage.evaluateHandle(() => Array.from(document.querySelectorAll('.bottom-nav-btn'))
            .find((b) => b.textContent.includes('History')))).click();
        await waitFor(wpage, 'weekly ledger', () => !!document.querySelector('.weigh-week'));
        await wpage.click('.weigh-week-head');
        await waitFor(wpage, 'opened week', () => document.querySelectorAll('.weigh-day-value').length > 0);
        await wcheck('weight History reading', '.weigh-day-value:not(.na)', 1);
        await wcheck('weight History NA', '.weigh-day-value.na', 1);
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
                return { out, sideways, buttons };
            }, FLIES);
            eq(fit.buttons.slice(0, 3), ['↑', '↓', 'Edit'], width + 'px: the long-named row still has its three buttons');
            eq(fit.out, [], width + 'px: nothing in the long-named row spills out of it');
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
