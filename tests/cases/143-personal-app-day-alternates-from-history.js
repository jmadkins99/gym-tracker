// What this test covers
// ----------------------
// Which day the app opens on, under the Nov 2026 Anterior/Posterior program,
// and the lock that fixes it for the rest of the date once anything is logged.
//
//   1. No history at all: Anterior, unlocked.
//   2. The most recent Anterior or Posterior session of THIS program was
//      Anterior: Posterior. A Full Body session since, and an Aug–Sep 2026
//      'posterior' session in between, change nothing. They are other programs'
//      days, and alternating off them would make the first day depend on
//      whatever was logged in September.
//   3. The most recent was Posterior: Anterior.
//   4. Log one card: the Settings toggle is locked on today's day with
//      "Today is Posterior. It switches tomorrow.", a tap on Anterior does
//      nothing, and a reload keeps both the day and the lock. The workout is
//      stamped with its day at the first LOG, so letting the day change after
//      that would put the rest of the session's cards under the wrong day.
//
// The day is derived from history rather than stored, so there is no flag to
// drift between devices: a second synced phone opens on the same day.
//
// To verify this test is real: make getDefaultDayType return
// PROGRAM_DAYS[0].id again. (2) fails on the active day. Or drop the lock
// from the Settings toggle: (4) fails on `locked`.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, readDayToggle, openSettings, closeSettings } = require('../lib/browser');
const { activeName, revealCard, logCard } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');
const NS = 'gym-local:';

const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(17, 0, 0, 0);
    return d.toISOString();
};
// Invented sessions: one movement each, enough to carry a `day`.
const session = (n, day) => workoutEntry({
    date: daysAgo(n), day,
    exercises: [{ id: 'quads-knee-extension', name: 'Leg Extensions', weight: '100', reps: '6' }],
});

async function loadWith(page, history) {
    await seedPersonalApp(page, { workoutHistory: history });
    await page.evaluate((ns) => {
        localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
        localStorage.removeItem(ns + 'dayPick');
    }, NS);
    await page.reload({ waitUntil: 'networkidle0' });
    await waitForApp(page);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // === 1. No history ================================================
        await loadWith(page, []);
        let toggle = await readDayToggle(page);
        eq(toggle.days, ['anterior-2', 'posterior-2'], 'Settings offers Anterior and Posterior');
        eq([toggle.active, toggle.locked, toggle.note], ['anterior-2', false, ''],
            'with no history the app opens on Anterior, unlocked');
        eq(await activeName(page), 'Chest Flies', 'and the deck is the Anterior day');
        eq(await page.evaluate(() => document.querySelectorAll('.deck [data-day-type]').length), 0,
            'the deck itself carries no day pills any more');

        // === 2. Last was Anterior, other programs' days since =============
        await loadWith(page, [
            session(1, 'full-body'),
            session(2, 'posterior'),
            session(4, 'anterior-2'),
        ]);
        toggle = await readDayToggle(page);
        eq(toggle.active, 'posterior-2',
            'after an Anterior session the app opens on Posterior, ignoring other programs\' days');
        eq(await activeName(page), 'Recline Curls', 'and the deck is the Posterior day');

        // === 3. Last was Posterior =========================================
        await loadWith(page, [session(1, 'posterior-2'), session(3, 'anterior-2')]);
        eq((await readDayToggle(page)).active, 'anterior-2', 'after a Posterior session, Anterior');

        // === 4. A LOG locks the day ========================================
        await loadWith(page, [session(1, 'anterior-2')]);
        await revealCard(page);
        ok(await logCard(page), 'logged the first Posterior card');

        toggle = await readDayToggle(page);
        eq([toggle.active, toggle.locked], ['posterior-2', true], 'after a LOG the toggle is locked on Posterior');
        eq(toggle.note, 'Today is Posterior. It switches tomorrow.', 'and says why');

        await openSettings(page);
        await page.evaluate(() => document.querySelector('.modal [data-day-type="anterior-2"]').click());
        await new Promise(r => setTimeout(r, 150));
        await closeSettings(page);
        eq((await readDayToggle(page)).active, 'posterior-2', 'a tap on Anterior changes nothing');
        eq(await page.evaluate(() => document.querySelector('.deck-count')?.textContent.trim().split(' ')[2]),
            '11', 'the deck is still the 11 Posterior cards');

        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        toggle = await readDayToggle(page);
        eq([toggle.active, toggle.locked], ['posterior-2', true], 'a reload keeps the day and the lock');

        eq(errors, [], 'no console errors');
        console.log('PASS: the day alternates from history and locks after a LOG');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    console.error(err);
    process.exit(1);
});
