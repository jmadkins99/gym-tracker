// What this test covers
// ----------------------
// Ian's coach code builds his whole program on ONE load: both days in the right
// order, his flags, his weekday map, and — the part with no precedent — a
// loadType seeded on every exercise.
//
// The seeding is the half worth having. Six of Ian's twenty names are ones the
// public app's name-based rules classify as plate-loaded, because they are the
// names of Jessi's machines: Leg Press and Back Extensions two-sided, and
// Sagittal Plane Pulldowns, Transverse Plane Rows, Kelso Shrugs and Preacher
// Curls one-sided. Ian trains somewhere else and everything of his is a stack,
// so his preset overrides all twenty. That override only works because the
// preset-to-config writer was taught to copy `loadType` at all — it silently
// dropped unknown fields before, so a seeded preset would have looked correct
// in source and done nothing.
//
// Also asserted: NO splitRevision (see case 64 for why that matters), and no
// startingWeight anywhere, which is a deliberate choice rather than an omission.
//
// To verify this test is real: drop the `...(ex.loadType ? ...)` line from the
// preset writer in index.html. The loadType assertions fail while everything
// else still passes.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { eq, ok } = require('../lib/assert');

const { PUBLIC_APP_ROOT } = require('../lib/paths');
const NS = 'gym-local:';
const IAN_CODE = 'D2O0O1M7';

const ANTERIOR = [
    'Shoulder Press', 'Tricep Extensions', 'Lateral Raises',
    'Overhead Tricep Extensions', 'Reverse Wrist Curls', 'Wrist Curls',
    'Chest Flies', 'Incline Chest Press', 'Ab Crunches', 'Leg Extensions',
    'Leg Press',
];
const POSTERIOR = [
    'Sagittal Plane Pulldowns', 'Frontal Plane Pulldowns',
    'Transverse Plane Rows', 'Kelso Shrugs', 'Preacher Curls', 'Incline Curls',
    'Back Extensions', 'Hip Adduction', 'Calf Raises',
];

// The six whose names would otherwise be read as plate-loaded. Listed
// explicitly so the point of the seeding is visible in the failure output.
const WOULD_GUESS_PLATE = [
    'Leg Press', 'Back Extensions', 'Sagittal Plane Pulldowns',
    'Transverse Plane Rows', 'Kelso Shrugs', 'Preacher Curls',
];

async function enterCoachCode(page, code) {
    const entered = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => /have a coach/i.test(b.textContent));
        if (!btn) return 'no-coach-button';
        btn.click();
        return 'clicked';
    });
    eq(entered, 'clicked', 'found and clicked the "I Have a Coach" button');
    await new Promise(r => setTimeout(r, 600));

    const submitted = await page.evaluate((c) => {
        const input = document.querySelector('input[type="text"]');
        if (!input) return 'no-input';
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, c);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => !b.disabled && /load|submit|continue|start|next/i.test(b.textContent));
        if (!btn) return 'no-submit';
        btn.click();
        return 'submitted';
    }, code);
    eq(submitted, 'submitted', 'entered coach code ' + code + ' and submitted');

    // The wizard plays a ~6s welcome animation before writing config.
    await new Promise(r => setTimeout(r, 9000));
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1200));

        await enterCoachCode(page, IAN_CODE);

        const cfg = await page.evaluate((ns) => {
            const raw = localStorage.getItem(ns + 'gymExerciseConfig');
            return raw ? JSON.parse(raw) : null;
        }, NS);
        ok(cfg, 'the coach code wrote an exerciseConfig');

        // --- Flags ---------------------------------------------------------
        eq(cfg.minimalistPrTracking, true, 'Ian gets minimalist PR tracking, like Jessi');
        eq(cfg.repsDropdown, { min: 5, max: 8 }, 'and the same 5-8 reps dropdown');
        eq(cfg.coachPreset, 'ian', 'the config is stamped with the preset that built it');
        eq(cfg.splitRevision, undefined,
            'and carries NO splitRevision — case 64 is what that protects');
        eq(cfg.categories.slice().sort(), ['Anterior', 'Posterior'],
            'two categories, Anterior and Posterior');

        // --- The program, on ONE load --------------------------------------
        const byDay = Object.fromEntries(
            Object.entries(cfg.days).map(([d, list]) => [d, list.map(e => e.name)]));
        eq(byDay['1'], ANTERIOR, 'day 1 is Anterior, 11 movements in order');
        eq(byDay['2'], POSTERIOR, 'day 2 is Posterior, 9 movements in order');

        const all = Object.values(cfg.days).flat();
        eq(all.length, 20, 'twenty movements in total');

        // --- Goal range ----------------------------------------------------
        const offRange = all
            .filter(e => e.sets !== 1 || e.minReps !== 6 || e.maxReps !== 8)
            .map(e => e.name + ': ' + e.sets + 'x' + e.minReps + '-' + e.maxReps);
        eq(offRange, [], 'every movement is 1 set of 6-8');

        // --- loadType, the new part ----------------------------------------
        const wrongLoad = all
            .filter(e => e.loadType !== 'pin')
            .map(e => e.name + ': ' + JSON.stringify(e.loadType));
        eq(wrongLoad, [], 'every movement is seeded loadType "pin"');

        // Non-vacuity: prove the seeding is doing work rather than agreeing with
        // a guess that would have happened anyway.
        const guessed = await page.evaluate((names) => Object.fromEntries(
            names.map(n => [n, JSON.stringify(getWeightBreakdownConfig(n))])), WOULD_GUESS_PLATE);
        for (const name of WOULD_GUESS_PLATE) {
            ok(/plate-loaded/.test(guessed[name]),
                '"' + name + '" would be guessed plate-loaded from its name (' + guessed[name] + ')');
        }
        // ...and yet resolves to a stack, because the seed wins.
        const rendered = await page.evaluate((names, ns) => Object.fromEntries(
            names.map(n => {
                const all = Object.values(
                    JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig')).days).flat();
                return [n, JSON.stringify(breakdownConfigFor(all.find(e => e.name === n)))];
            })), WOULD_GUESS_PLATE, NS);
        for (const name of WOULD_GUESS_PLATE) {
            eq(rendered[name], '{"type":"pin-stack"}',
                '"' + name + '" resolves to a plain pin stack — the seed overrides the guess');
        }

        // --- No starting weights -------------------------------------------
        const seeded = all.filter(e => e.startingWeight !== undefined)
            .map(e => e.name + ': ' + e.startingWeight);
        eq(seeded, [], 'no startingWeight anywhere — his first session is blank by choice');

        // --- The weekday map -----------------------------------------------
        const sched = await page.evaluate((ns) => {
            const raw = localStorage.getItem(ns + 'gymScheduleConfig');
            return raw ? JSON.parse(raw) : null;
        }, NS);
        ok(sched, 'a schedule was written');
        const map = Object.fromEntries(
            (sched.workoutDays || []).map(d => [d.dayOfWeek, d.workoutDayNumber]));
        eq(map, {
            Monday: 1, Tuesday: 2, Wednesday: 1, Thursday: 2,
            Friday: 1, Saturday: 2, Sunday: 2,
        }, 'Anterior Mon/Wed/Fri, Posterior Tue/Thu/Sat/Sun — all seven days mapped');

        eq(errors, [], 'no console errors');
        console.log('PASS: Ian coach code builds the program, seeded all-pin, in one load.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
