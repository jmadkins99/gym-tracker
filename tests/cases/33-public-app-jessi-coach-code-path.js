// What this test covers
// ----------------------
// The path a human actually uses to set Jessi up from scratch: reset data,
// tap "I Have a Coach", enter code D1O9O9M2. Two bugs made this path NOT
// produce his configured app, while the seeded-localStorage path did:
//
//   1. resetData cleared only the ancient jessiAPMigrationApplied flag, so
//      jessiGympinEnabled / jessiRepsDropdownEnabled / the FullBody gates
//      survived a reset. The one-shot enablers self-gate on those flags, so
//      after one reset they never fired again — the coach code produced a
//      program with no Weight Breakdown and a free-type reps field, forever.
//
//   2. The coach-preset writer copied only the three prTracking fields, not
//      gympinMode / repsDropdown. The one-shot enablers run at mount, so even
//      with flags cleared a fresh coach-code install needed a SECOND page load
//      before either feature showed up.
//
// Asserts the coach code alone, on one load, yields gympinMode + the 5-8 reps
// dropdown; and that a reset genuinely clears every one-shot gate.
//
// To verify this is real: revert either fix. Dropping the extra removeItem
// calls from resetData fails the "flags cleared" assertion; dropping
// gympinMode/repsDropdown from the preset writer fails the config assertions.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole } = require('../lib/browser');
const { eq, ok } = require('../lib/assert');

const PUBLIC_APP_ROOT = path.resolve(__dirname, '..', '..', '..', 'public_gym_app');
const NS = 'gym-local:';
const JESSI_CODE = 'D1O9O9M2';

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Simulate a device that has already run every one-shot (as any real
        // install of Jessi's would have) and then had its data reset.
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'jessiGympinEnabled', 'true');
            localStorage.setItem(ns + 'jessiRepsDropdownEnabled', 'true');
            localStorage.setItem(ns + 'jessiFullBodyMigrationApplied5', 'true');
        }, NS);

        // What resetData does to storage. Kept in lockstep with the app; the
        // assertion below is what catches drift.
        const clearedByReset = await page.evaluate((ns) => {
            for (const k of [
                'gymWorkoutHistory', 'gymExerciseConfig', 'gymScheduleConfig',
                'gymSetupCompleted', 'lastBackupReminder', 'hasSeenTutorial',
                'jessiAPMigrationApplied',
                'jessiFullBodyMigrationApplied5', 'jessiFullBodyMigrationApplied4',
                'jessiFullBodyMigrationApplied3', 'jessiFullBodyMigrationApplied2',
                'jessiFullBodyMigrationApplied1',
                'jessiGympinEnabled', 'jessiRepsDropdownEnabled',
            ]) localStorage.removeItem(ns + k);
            return [
                localStorage.getItem(ns + 'jessiGympinEnabled'),
                localStorage.getItem(ns + 'jessiRepsDropdownEnabled'),
                localStorage.getItem(ns + 'jessiFullBodyMigrationApplied5'),
            ];
        }, NS);
        eq(clearedByReset, [null, null, null],
            'reset clears every jessi one-shot gate, not just jessiAPMigrationApplied');

        // Confirm the app's own resetData lists all of them, so the simulation
        // above cannot drift from the real implementation unnoticed.
        const resetSource = await page.evaluate(() => {
            const html = document.documentElement.outerHTML;
            const i = html.indexOf('const resetData =');
            if (i === -1) return '';
            // Bound by the end of the function's body rather than a character
            // count, so the check survives edits to the confirm() copy.
            const j = html.indexOf('setShowWizard(true)', i);
            return j === -1 ? '' : html.slice(i, j);
        });
        ok(resetSource, 'located the resetData implementation in the page source');
        for (const flag of ['jessiGympinEnabled', 'jessiRepsDropdownEnabled', 'jessiFullBodyMigrationApplied5']) {
            ok(resetSource.includes(flag), `resetData removes ${flag}`);
        }

        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1200));

        // Drive the wizard: "I Have a Coach" -> code -> submit.
        const entered = await page.evaluate((code) => {
            const btn = Array.from(document.querySelectorAll('button'))
                .find(b => /have a coach/i.test(b.textContent));
            if (!btn) return 'no-coach-button';
            btn.click();
            return 'clicked';
        }, JESSI_CODE);
        eq(entered, 'clicked', 'found and clicked the "I Have a Coach" button');
        await new Promise(r => setTimeout(r, 600));

        const submitted = await page.evaluate((code) => {
            const input = document.querySelector('input[type="text"]');
            if (!input) return 'no-input';
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, code);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            const btn = Array.from(document.querySelectorAll('button'))
                .find(b => !b.disabled && /load|submit|continue|start|next/i.test(b.textContent));
            if (!btn) return 'no-submit';
            btn.click();
            return 'submitted';
        }, JESSI_CODE);
        eq(submitted, 'submitted', `entered coach code ${JESSI_CODE} and submitted`);

        // The wizard plays a ~6s welcome animation before writing config.
        await new Promise(r => setTimeout(r, 9000));

        const cfg = await page.evaluate((ns) => {
            const raw = localStorage.getItem(ns + 'gymExerciseConfig');
            return raw ? JSON.parse(raw) : null;
        }, NS);
        ok(cfg, 'coach code wrote an exerciseConfig');
        eq(cfg.minimalistPrTracking, true, 'preset carries minimalistPrTracking');
        eq(cfg.gympinMode, true,
            'preset carries gympinMode — no second page load required');
        eq(cfg.repsDropdown, { min: 5, max: 8 },
            'preset carries the 5-8 repsDropdown — no second page load required');

        // The program itself, on load 1. The original version of this test
        // asserted only the two flags above and walked straight past the fact
        // that the preset was still Torso/Limbs, so a coach-code install showed
        // the old two-day split until a refresh.
        const UPPER = [
            'Chest Flies',
            'Incline Chest Press',
            'Recline Curls',
            'Overhead Tricep Extensions',
            'Chest Press',
            'Lateral Raises',
            'Shoulder Press',
            'Frontal Plane Pulldowns',
            'Transverse Plane Rows',
            'Kelso Shrugs',
            'Sagittal Plane Pulldowns',
            'Tricep Extensions',
            'Preacher Curls',
        ];
        const LOWER = [
            'Reverse Wrist Curls',
            'Cable Wrist Curls',
            'Back Extensions', // moved up off the end of Lower, Aug 2026
            'Ab Crunches',
            'Leg Extensions',
            'Leg Press',
            'Hip Adduction', // moved ahead of Calf Raises, Aug 2026
            'Calf Raises',
        ];
        eq(cfg.categories, ['Upper', 'Lower'], 'coach code yields the Upper/Lower split');
        eq(Object.keys(cfg.days).length, 2, 'two days, not the old single Full Body day');
        eq((cfg.days[1] || []).map(e => e.name), UPPER,
            'coach code yields Upper in order on the FIRST load');
        eq((cfg.days[2] || []).map(e => e.name), LOWER,
            'coach code yields Lower in order on the FIRST load');

        // The stamp is what stops migrateJessiToUpperLower from treating a
        // fresh install as an un-split program, and what lets a future
        // JESSI_SPLIT_REVISION bump reach it. A preset that writes the right
        // exercises but no stamp looks correct today and goes deaf to every
        // reorder from here on, which is invisible without this assertion.
        ok(cfg.splitRevision !== undefined,
            'preset stamps splitRevision so later revisions still reach this install');

        // The two movements with no history to inherit. Both carry a stable
        // literal id rather than a generateUUID() one, because the coach preset
        // and migrateJessiToUpperLower have to agree on a single key — a UUID
        // here would mean a fresh install and a migrated install disagree about
        // what the same movement is called.
        const preacher = (cfg.days[1] || []).find(e => e.name === 'Preacher Curls');
        eq(preacher.id, 'actual-preacher-curls',
            'preset pins the stable Preacher Curls id, matching the migration');
        eq(preacher.startingWeight, '50', 'preset seeds the Preacher Curls starting weight');

        const legExt = (cfg.days[2] || []).find(e => e.name === 'Leg Extensions');
        eq(legExt.id, 'actual-leg-extensions',
            'preset pins the stable Leg Extensions id, matching the migration');
        eq(legExt.startingWeight, '50', 'preset seeds the Leg Extensions starting weight');

        // The schedule has to come from scheduleDays, not the round-robin
        // fallback — Sat and Sun are both Upper, which alternation can't express.
        const sched = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymScheduleConfig')), NS);
        eq(sched.workoutDays.map(d => [d.dayOfWeek, d.workoutDayNumber]), [
            ['Monday', 2], ['Tuesday', 1], ['Wednesday', 2], ['Thursday', 1],
            ['Friday', 2], ['Saturday', 1], ['Sunday', 1],
        ], 'coach code yields the exact weekday map, not an alternating round-robin');

        const onScreen1 = await page.evaluate(async () => {
            const out = {};
            const btns = Array.from(document.querySelectorAll('.day-btn'));
            for (let i = 0; i < btns.length; i++) {
                btns[i].click();
                await new Promise(r => setTimeout(r, 250));
                out[i + 1] = Array.from(document.querySelectorAll('.exercise-name'))
                    .map(e => e.textContent.trim());
            }
            return out;
        });
        eq(onScreen1[1], UPPER, 'Upper is what actually renders on screen');
        eq(onScreen1[2], LOWER, 'Lower is what actually renders on screen');

        // Drift guard: the preset (fresh installs) and migrateJessiToUpperLower
        // (existing devices) are two sources of truth for one program. If they
        // agree, a refresh is a no-op. Edit either side alone and this fails —
        // which is exactly the regression that shipped, whichever side rots.
        await page.reload({ waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 1800));
        const afterRefresh = await page.evaluate((ns) => {
            const c = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig'));
            return {
                categories: c.categories,
                upper: (c.days[1] || []).map(e => e.name),
                lower: (c.days[2] || []).map(e => e.name),
                dayCount: Object.keys(c.days).length,
            };
        }, NS);
        eq(afterRefresh.upper, UPPER,
            'preset and migration agree on Upper — refreshing does not change the program');
        eq(afterRefresh.lower, LOWER,
            'preset and migration agree on Lower — refreshing does not change the program');
        eq(afterRefresh.categories, ['Upper', 'Lower'], 'categories stable across the refresh');
        eq(afterRefresh.dayCount, 2, 'day count stable across the refresh');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: coach code D1O9O9M2 yields the Upper/Lower program on first load.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
