// What this test covers
// ----------------------
// The public app's load-type dropdown: that the name-based rules are now only a
// DEFAULT, and that a user's choice overrides them and changes what the Weight
// Breakdown renders.
//
// This is the public-app twin of case 58, and it is the only case proving the
// setting is wired to anything. Everything else about load type on this app
// (09, 14, 15, 27, 29) exercises the name-derived default, which is what the
// old code did anyway — all of them pass if the dropdown writes to storage and
// is never read.
//
// Two halves, and the second is the one that matters most here:
//
//   1. A movement the rules DO recognise. Kelso Shrugs is matched by
//      /kelso|shrug/ and defaults to one-sided plate-loaded. Switching it to a
//      pin stack must change the rendered shape, proving the user's choice
//      beats the regex rather than merely being stored beside it.
//
//   2. A movement the rules do NOT recognise. Anyone can type their own
//      exercise name in the wizard, which is exactly why this app classifies by
//      name in the first place — and exactly where a name-based guess has
//      nothing to go on. Such an exercise must still get a button (defaulting
//      to a plain pin stack) and must still be settable. This is the case that
//      did not exist on the personal app, where the roster is fixed.
//
// Shapes, as in 58: "Per side" ⇒ two-sided plate; plate rows without "Per side"
// ⇒ one-sided plate; a bare "(~70%): N lbs" ⇒ plain pin stack.
//
// To verify this test is real: make breakdownConfigFor ignore
// resolveLoadType(exercise) and return getWeightBreakdownConfig(exercise.name)
// directly. Both halves fail.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { seedPublicApp, jessiPreMigrationConfig, jessiDefaultSchedule } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const { PUBLIC_APP_ROOT } = require('../lib/paths');
const NS = 'gym-local:';

async function openSettings(page) {
    await page.click('.settings-btn');
    await new Promise(r => setTimeout(r, 300));
}

// Walks every "Manage Day N Exercises" view looking for the named exercise,
// opens its ✏️ editor, sets the load type, and saves.
async function setLoadType(page, exerciseName, loadType) {
    await openSettings(page);

    const dayCount = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.modal-btn'))
            .filter(b => b.textContent.includes('Manage Day')).length);
    ok(dayCount > 0, 'Settings offers at least one Manage Day view');

    for (let day = 1; day <= dayCount; day++) {
        await page.evaluate((d) => {
            const btn = Array.from(document.querySelectorAll('.modal-btn'))
                .find(b => b.textContent.includes(`Manage Day ${d} Exercises`));
            if (btn) btn.click();
        }, day);
        await new Promise(r => setTimeout(r, 300));

        // Open the pencil on the row whose text starts with this exercise.
        const opened = await page.evaluate((name) => {
            const rows = Array.from(document.querySelectorAll('.modal div'));
            const row = rows.find(r => r.textContent.trim().startsWith(name)
                && Array.from(r.querySelectorAll('button')).some(b => b.textContent.includes('✏️')));
            if (!row) return false;
            const pencil = Array.from(row.querySelectorAll('button'))
                .find(b => b.textContent.includes('✏️'));
            pencil.click();
            return true;
        }, exerciseName);

        if (!opened) {
            // Not on this day — go back and try the next.
            await page.evaluate(() => {
                const back = Array.from(document.querySelectorAll('.modal-btn'))
                    .find(b => b.textContent.includes('Back'));
                if (back) back.click();
            });
            await new Promise(r => setTimeout(r, 250));
            continue;
        }

        await new Promise(r => setTimeout(r, 300));

        const set = await page.evaluate((value) => {
            const select = document.querySelector('select[data-field="loadType"]');
            if (!select) return 'no select';
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLSelectElement.prototype, 'value').set;
            setter.call(select, value);
            select.dispatchEvent(new Event('change', { bubbles: true }));
            const save = Array.from(document.querySelectorAll('button'))
                .find(b => b.textContent.trim() === 'Save');
            if (!save) return 'no save button';
            save.click();
            return 'ok';
        }, loadType);
        eq(set, 'ok', `set "${exerciseName}" to ${loadType}`);
        await new Promise(r => setTimeout(r, 350));

        // Close the modal entirely.
        await page.evaluate(() => {
            const overlay = document.querySelector('.modal-overlay');
            if (overlay) overlay.click();
        });
        await new Promise(r => setTimeout(r, 300));
        return true;
    }
    throw new Error(`could not find "${exerciseName}" in any Manage Day view`);
}

// Types a weight into the card and opens its breakdown; returns the card text.
async function readBreakdown(page, exerciseName, weight) {
    const opened = await page.evaluate((name, w) => {
        const cards = Array.from(document.querySelectorAll('.exercise-card'));
        const card = cards.find(c =>
            c.querySelector('.exercise-name')?.textContent?.trim() === name);
        const rendered = cards
            .map(c => c.querySelector('.exercise-name')?.textContent?.trim())
            .join(', ');
        if (!card) return `no card for "${name}" — rendered: ${rendered}`;
        const input = card.querySelector('input[type="number"], input[inputmode="decimal"]');
        if (input) {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, w);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const btn = Array.from(card.querySelectorAll('button'))
            .find(b => b.textContent.includes('Weight Breakdown'));
        if (!btn) {
            const labels = Array.from(card.querySelectorAll('button'))
                .map(b => JSON.stringify(b.textContent.trim())).join(', ');
            return `no breakdown button on "${name}" — its buttons: ${labels}`;
        }
        btn.click();
        return 'ok';
    }, exerciseName, weight);
    eq(opened, 'ok', `opened the Weight Breakdown on "${exerciseName}"`);
    await new Promise(r => setTimeout(r, 350));

    const text = await page.evaluate((name) => {
        const card = Array.from(document.querySelectorAll('.exercise-card'))
            .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === name);
        return card ? card.textContent : '';
    }, exerciseName);

    // Collapse again so the next read starts from a closed panel. The button
    // reads "Hide" while expanded, not "Weight Breakdown" — matching on the
    // latter here leaves the panel open and the next read finds no button.
    await page.evaluate((name) => {
        const card = Array.from(document.querySelectorAll('.exercise-card'))
            .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === name);
        const btn = card && Array.from(card.querySelectorAll('button'))
            .find(b => b.textContent.trim() === 'Hide');
        if (btn) btn.click();
    }, exerciseName);
    await new Promise(r => setTimeout(r, 200));

    return text;
}

async function savedLoadType(page, exerciseName) {
    return page.evaluate((ns, name) => {
        const raw = localStorage.getItem(ns + 'gymExerciseConfig');
        if (!raw) return null;
        const cfg = JSON.parse(raw);
        for (const day of Object.values(cfg.days || {})) {
            for (const ex of (day.exercises || day || [])) {
                if (ex && ex.name === name) return ex.loadType;
            }
        }
        return null;
    }, NS, exerciseName);
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // A custom movement the name rules have never seen, added alongside
        // Jessi's own. "Nautilus Pullover" matches none of the regexes.
        const CUSTOM = 'Nautilus Pullover';
        const cfg = jessiPreMigrationConfig();
        const firstDay = Object.keys(cfg.days)[0];
        const list = cfg.days[firstDay].exercises || cfg.days[firstDay];
        list.push({
            id: 'custom-nautilus-pullover',
            name: CUSTOM,
            typeId: 'standard',
            sets: 1, minReps: 6, maxReps: 8,
            order: list.length,
        });

        await seedPublicApp(page, {
            exerciseConfig: cfg,
            schedule: jessiDefaultSchedule(),
        });
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1500));

        // === 1. A recognised movement: Kelso Shrugs ========================
        // /kelso|shrug/ makes it one-sided plate-loaded by default.
        let text = await readBreakdown(page, 'Kelso Shrugs', '200');
        ok(!/Per side/.test(text),
            'Kelso Shrugs defaults to ONE-sided plate-loaded — no per-side line');
        contains(text, 'Warmup Set #1 (140 lbs',
            'and it renders the plate-loaded label shape by default');

        await setLoadType(page, 'Kelso Shrugs', 'pin');
        text = await readBreakdown(page, 'Kelso Shrugs', '200');
        contains(text, 'Warmup Set #1 (~70%): 140 lbs',
            'set to a pin stack, it renders the pin shape — the choice beats the name rule');
        ok(!/Per side/.test(text), 'still no per-side line as a stack');

        eq(await savedLoadType(page, 'Kelso Shrugs'), 'pin',
            'the choice persisted onto the exercise in exerciseConfig');

        // Two-sided, to prove all three values reach the render.
        await setLoadType(page, 'Kelso Shrugs', 'plate-two-sided');
        text = await readBreakdown(page, 'Kelso Shrugs', '200');
        contains(text, 'Per side: 70 lbs', 'set two-sided, 140 splits to 70 a side');

        // === 2. A movement the rules have never seen ======================
        // 200 rather than a rounder-looking 100 on purpose: at 100 the
        // two-sided warmup is 35 a side, which the nearest-10 rule rounds DOWN
        // to 30 (the exact-halfway case case 28 pins). 200 keeps this case about
        // the load type rather than about rounding.
        text = await readBreakdown(page, CUSTOM, '200');
        contains(text, 'Warmup Set #1 (~70%): 140 lbs',
            'an unrecognised custom exercise defaults to a plain pin stack');
        ok(!/Per side/.test(text), 'and not to any plate shape');

        await setLoadType(page, CUSTOM, 'plate-two-sided');
        text = await readBreakdown(page, CUSTOM, '200');
        contains(text, 'Per side: 70 lbs',
            'a custom exercise can be set two-sided — 140 splits to 70 a side');

        // === 3. It survives a reload ======================================
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1500));
        eq(await savedLoadType(page, CUSTOM), 'plate-two-sided',
            'the custom exercise kept its load type across a reload');
        text = await readBreakdown(page, CUSTOM, '200');
        contains(text, 'Per side: 70 lbs', 'and still renders two-sided after the reload');

        eq(errors, [], 'no console errors');
        console.log('PASS: the load-type choice overrides the name rules and persists.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
