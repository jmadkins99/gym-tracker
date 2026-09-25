// What this test covers
// ----------------------
// Nothing done for Jessi reaches anyone else. Every other client — Lexi, Grace
// (graciepoo), Noah, Shawn, Ian — is installed through the REAL coach-code
// wizard, then reloaded again and again; self-serve programs are seeded
// directly. Their saved program and weekday map must never change.
//
// Every client except Josh and Jessi runs in local mode, so every local-only
// code path runs on their phones on every load. Two states per client:
//
//   1. As installed today: stamped with `coachPreset`. Three reloads, the
//      legacy one-shot flags cleared before each (a reset or restored backup
//      clears them too, so "the flag happens to be set" is no protection).
//   2. As installed before 27 Aug 2026: the same program with NO stamp, which
//      is what an older Grace, Lexi, Noah or Shawn install holds. Three more
//      reloads, flags cleared.
//
// Plus self-serve wizard programs, which never carry a stamp, named the way
// the old one-shots used to match: one day called "Full Body", Anterior/
// Posterior, Torso/Limbs and Push/Pull/Legs.
//
// Before Jessi's Sep 2026 Full Body switch, state 2 was NOT safe: the local
// one-shots renamed an unstamped Grace's Leg Extensions to Hip Adduction and
// reordered her day, collapsed an unstamped Ian into one day and then rebuilt
// him as Jessi's program, deleted Lateral Raises from a self-serve "Full Body"
// day and collapsed the multi-day self-serve programs. Those one-shots are
// gone (stubs remain), which is what turns this case green. Test 126 is the
// in-memory version of the same matrix; test 64 stays as Ian's original guard.
//
// To verify this test is real: restore the old body of migrateJessiToFullBody.
// The unstamped Grace and self-serve Full Body rows fail.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, waitFor, waitForStorageKey } = require('../lib/browser');
const { seedPublicApp } = require('../lib/state');
const { eq, ok } = require('../lib/assert');
const { PUBLIC_APP_ROOT } = require('../lib/paths');

const NS = 'gym-local:';

const CLIENTS = [
    ['lexi', 'D0O0O0M1'],
    ['graciepoo', 'D6O9O6M9'],
    ['noah', 'B1G4RK'],
    ['shawn', 'D2O9O9M1'],
    ['ian', 'D2O0O1M7'],
];

const LEGACY_FLAGS = [
    'jessiAPMigrationApplied',
    'jessiFullBodyMigrationApplied5', 'jessiFullBodyMigrationApplied4',
    'jessiFullBodyMigrationApplied3', 'jessiFullBodyMigrationApplied2',
    'jessiFullBodyMigrationApplied1',
    'jessiRepsDropdownEnabled', 'jessiGympinEnabled',
];

async function enterCoachCode(page, code) {
    await waitFor(page, 'the setup wizard to render',
        () => Array.from(document.querySelectorAll('button')).some(b => /have a coach/i.test(b.textContent)));
    await page.evaluate(() => {
        Array.from(document.querySelectorAll('button')).find(b => /have a coach/i.test(b.textContent)).click();
    });
    await waitFor(page, 'the coach-code input to appear', () => !!document.querySelector('input[type="text"]'));
    const submitted = await page.evaluate((c) => {
        const input = document.querySelector('input[type="text"]');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, c);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const btn = Array.from(document.querySelectorAll('button'))
            .find(b => !b.disabled && /load|submit|continue|start|next/i.test(b.textContent));
        if (!btn) return false;
        btn.click();
        return true;
    }, code);
    ok(submitted, 'entered coach code ' + code);
    await waitForStorageKey(page, NS, 'gymExerciseConfig');
}

const readState = (page) => page.evaluate((ns) => ({
    config: localStorage.getItem(ns + 'gymExerciseConfig'),
    schedule: localStorage.getItem(ns + 'gymScheduleConfig'),
}), NS);

const clearFlags = (page) => page.evaluate((ns, flags) => {
    flags.forEach(f => localStorage.removeItem(ns + f));
    localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
    localStorage.setItem(ns + 'hasSeenTutorial', 'true');
}, NS, LEGACY_FLAGS);

async function reloadsKeep(page, label, expected) {
    for (let pass = 1; pass <= 3; pass++) {
        await clearFlags(page);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        const now = await readState(page);
        eq(now.config, expected.config, `${label}, reload ${pass}: the program is byte-identical`);
        eq(now.schedule, expected.schedule, `${label}, reload ${pass}: the weekday map is byte-identical`);
    }
    const days = Object.keys(JSON.parse(expected.config).days).length;
    const pills = await page.evaluate(() => document.querySelectorAll('.day-pill').length);
    eq(pills, days, `${label}: one day pill per program day (${days})`);
}

function selfServe(dayNames) {
    const days = {}; let n = 0;
    dayNames.forEach((name, i) => {
        days[i + 1] = [1, 2, 3].map(j => ({ id: `self-${++n}`, name: `${name} Move ${j}`,
            category: name, typeId: 'standard', sets: 3, minReps: 8, maxReps: 12, order: j - 1 }));
    });
    if (dayNames.length === 1 && dayNames[0] === 'Full Body') {
        days[1] = ['Leg Extensions', 'Lateral Raises', 'Preacher Curls', 'Leg Press', 'Squat']
            .map((name, j) => ({ id: `self-fb-${j}`, name, category: 'Full Body', typeId: 'standard',
                sets: 3, minReps: 8, maxReps: 12, order: j }));
    }
    return {
        exerciseConfig: { version: 2, days, categories: dayNames.slice(),
            prTracking: true, advancedPrTracking: false, minimalistPrTracking: false },
        schedule: { version: 2, totalWorkoutDays: dayNames.length, scheduleIsExplicit: false,
            workoutDays: ['Monday', 'Wednesday', 'Friday'].map((d, i) => ({
                dayOfWeek: d, workoutDayNumber: (i % dayNames.length) + 1 })) },
    };
}

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // === Coach-code clients ===========================================
        for (const [who, code] of CLIENTS) {
            await page.evaluate(() => localStorage.clear());
            await page.reload({ waitUntil: 'networkidle0' });
            await enterCoachCode(page, code);
            await waitForApp(page, 12000);

            const installed = await readState(page);
            ok(installed.config && installed.schedule, `${who}: installed`);
            eq(JSON.parse(installed.config).coachPreset, who, `${who}: stamped with their preset`);
            eq(JSON.parse(installed.config).splitRevision, undefined, `${who}: carries no splitRevision`);

            // 1. As installed today.
            await reloadsKeep(page, who, installed);

            // 2. As installed before the stamp existed.
            const unstamped = await page.evaluate((ns) => {
                const cfg = JSON.parse(localStorage.getItem(ns + 'gymExerciseConfig'));
                delete cfg.coachPreset;
                localStorage.setItem(ns + 'gymExerciseConfig', JSON.stringify(cfg));
                return { config: localStorage.getItem(ns + 'gymExerciseConfig'),
                    schedule: localStorage.getItem(ns + 'gymScheduleConfig') };
            }, NS);
            await reloadsKeep(page, `${who} (unstamped)`, unstamped);
        }

        // === Self-serve programs ============================================
        const shapes = {
            'self-serve Full Body': ['Full Body'],
            'self-serve Anterior/Posterior': ['Anterior', 'Posterior'],
            'self-serve Torso/Limbs': ['Torso', 'Limbs'],
            'self-serve Push/Pull/Legs': ['Push', 'Pull', 'Legs'],
        };
        for (const [label, dayNames] of Object.entries(shapes)) {
            await page.evaluate(() => localStorage.clear());
            await seedPublicApp(page, { ...selfServe(dayNames), workoutHistory: [] });
            const seeded = await readState(page);
            await reloadsKeep(page, label, seeded);
        }

        eq(errors, [], 'no console errors');
        console.log('PASS: every other client and self-serve program survives every reload untouched.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
