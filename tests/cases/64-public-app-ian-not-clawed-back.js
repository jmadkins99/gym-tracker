// What this test covers
// ----------------------
// That Jessi's one-shot migrations leave Ian's program alone. This is the
// direct sibling of case 56, which pins the same property for Jessi herself.
//
// The danger is real and was found while building Ian, not theorised. Three of
// those one-shots identify "Jessi's install" by the SHAPE of the config —
// categories of exactly Anterior/Posterior — which is also exactly what Ian's
// preset produces. The worst is migrateJessiToFullBody: on an unstamped
// Anterior/Posterior config it drops Lateral Raises, Reverse Wrist Curls and
// Overhead Tricep Extensions, renames Leg Extensions to "Hip Adduction" (giving
// two cards the same name), renames Preacher Curls to "Recline Curls", collapses
// both days into one "Full Body" day and flattens the schedule so every weekday
// opens day 1. Silently, with no error.
//
// It does not fire on Ian's FIRST load, which is what makes it nasty. The
// migrations run at mount, before the wizard has written anything, so `raw` is
// null, they return early — and crucially never set their one-shot flag, which
// is only written after the work. His config appears on that load looking
// perfect. The trap springs on load TWO.
//
// Jessi is protected by her `splitRevision` stamp. Ian cannot use that: it would
// shield him here but expose him to migrateJessiSplit rebuilding his program as
// hers on the next JESSI_SPLIT_REVISION bump. What protects him instead is
// `coachPreset`, written by the coach-code path and checked by each one-shot.
//
// The reload loop below matters as much as the flag-clearing. A reset or a
// restored backup clears those flags too, so "the flag happens to be set" is not
// protection — that is the same argument case 56 makes for Jessi.
//
// To verify this test is real: remove the `config.coachPreset` guard from
// migrateJessiToFullBody in index.html. This case reddens on the first reload
// and every other case in the suite stays green.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, waitFor, waitForStorageKey } = require('../lib/browser');
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

// Exactly what migrateJessiToFullBody would take away, named individually so a
// failure says which movement went missing rather than just a count.
const MUST_SURVIVE = [
    'Lateral Raises', 'Reverse Wrist Curls', 'Overhead Tricep Extensions',
];

async function enterCoachCode(page, code) {
    const entered = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => /have a coach/i.test(b.textContent));
        if (!btn) return 'no-coach-button';
        btn.click();
        return 'clicked';
    });
    eq(entered, 'clicked', 'clicked the "I Have a Coach" button');
    await waitFor(page, 'the coach-code input to appear',
        () => !!document.querySelector('input[type="text"]'));

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
    eq(submitted, 'submitted', 'entered coach code ' + code);
    // The wizard plays a ~6s welcome animation and only then writes the config.
    // Waiting for the config itself returns the moment the work is actually
    // done, and still fails loudly if it never happens.
    await waitForStorageKey(page, NS, 'gymExerciseConfig');
}

async function readProgram(page) {
    return page.evaluate((ns) => {
        const raw = localStorage.getItem(ns + 'gymExerciseConfig');
        if (!raw) return null;
        const cfg = JSON.parse(raw);
        const days = Object.keys(cfg.days || {}).sort();
        return {
            dayCount: days.length,
            categories: (cfg.categories || []).slice().sort(),
            byDay: Object.fromEntries(days.map(d => [d, cfg.days[d].map(e => e.name)])),
            allNames: Object.values(cfg.days || {}).flat().map(e => e.name),
            coachPreset: cfg.coachPreset,
            repsDropdown: cfg.repsDropdown,
        };
    }, NS);
}

// What a reset, or restoring a backup, leaves behind: no one-shot flags at all.
async function clearOneShots(page) {
    await page.evaluate((ns) => {
        for (const k of [
            'jessiAPMigrationApplied',
            'jessiFullBodyMigrationApplied5', 'jessiFullBodyMigrationApplied4',
            'jessiFullBodyMigrationApplied3', 'jessiFullBodyMigrationApplied2',
            'jessiFullBodyMigrationApplied1',
            'jessiRepsDropdownEnabled', 'jessiGympinEnabled',
        ]) localStorage.removeItem(ns + k);
    }, NS);
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
        await waitFor(page, 'the setup wizard to render',
            () => Array.from(document.querySelectorAll('button'))
                .some(b => /have a coach/i.test(b.textContent)));

        await enterCoachCode(page, IAN_CODE);

        const installed = await readProgram(page);
        ok(installed, 'Ian has a config after entering his code');
        eq(installed.coachPreset, 'ian', 'stamped with his preset — this is what guards him');
        eq(installed.byDay['1'], ANTERIOR, 'Anterior is right on the install load');
        eq(installed.byDay['2'], POSTERIOR, 'Posterior is right on the install load');

        // Three reloads with the flags cleared each time. The trap needs a
        // second load to spring; doing it repeatedly also catches a migration
        // that damages the program a little on each pass rather than all at once.
        for (let pass = 1; pass <= 3; pass++) {
            await clearOneShots(page);
            await page.reload({ waitUntil: 'networkidle0' });
            // The one-shots run at mount, synchronously, before the first
            // render — so a rendered card means they have already had their
            // chance at the config. That is the thing this case is watching.
            await waitForApp(page);

            const now = await readProgram(page);
            ok(now, 'pass ' + pass + ': config still exists');

            eq(now.dayCount, 2,
                'pass ' + pass + ': still TWO days — not collapsed into one Full Body day');
            eq(now.categories, ['Anterior', 'Posterior'],
                'pass ' + pass + ': categories unchanged');
            eq(now.byDay['1'], ANTERIOR,
                'pass ' + pass + ': Anterior is intact, in order, all 11');
            eq(now.byDay['2'], POSTERIOR,
                'pass ' + pass + ': Posterior is intact, in order, all 9');

            const missing = MUST_SURVIVE.filter(n => !now.allNames.includes(n));
            eq(missing, [],
                'pass ' + pass + ': the three movements migrateJessiToFullBody drops are all present');

            // The rename half of that migration: Leg Extensions -> Hip Adduction
            // would leave two cards with the same name.
            ok(now.allNames.includes('Leg Extensions'),
                'pass ' + pass + ': Leg Extensions was not renamed to Hip Adduction');
            eq(now.allNames.filter(n => n === 'Hip Adduction').length, 1,
                'pass ' + pass + ': exactly one Hip Adduction, not two');
            ok(!now.allNames.includes('Recline Curls'),
                'pass ' + pass + ': Preacher Curls was not renamed to Recline Curls');
            ok(now.allNames.includes('Incline Curls'),
                'pass ' + pass + ': Incline Curls kept its own name');

            eq(now.coachPreset, 'ian',
                'pass ' + pass + ': the stamp survived the save/reload cycle');
            eq(now.repsDropdown, { min: 5, max: 8 },
                'pass ' + pass + ': his reps dropdown is untouched');
        }

        // The schedule must not have been flattened to "every day is day 1".
        const map = await page.evaluate((ns) => {
            const raw = localStorage.getItem(ns + 'gymScheduleConfig');
            if (!raw) return null;
            return Object.fromEntries(
                (JSON.parse(raw).workoutDays || []).map(d => [d.dayOfWeek, d.workoutDayNumber]));
        }, NS);
        eq(map, {
            Monday: 1, Tuesday: 2, Wednesday: 1, Thursday: 2,
            Friday: 1, Saturday: 2, Sunday: 2,
        }, 'the weekday map survived — not flattened onto a single day');

        eq(errors, [], 'no console errors');
        console.log('PASS: Ian program survives the Jessi one-shots across reloads.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
