// What this test covers
// ----------------------
// Six older personal-app fixes the public app never received, plus the
// removal of its dead Progress page. Each section says which personal behaviour
// it pins.
//
//   1. "Last:" on a logged card names the PREVIOUS session, not the set just
//      logged. getPreviousWorkout skips today's unsubmitted record, as the
//      personal app's has since 15830be.
//   2. Submit Day's "Exercises Completed" counts rows with real data. The
//      first log of a day writes a row for every exercise on it, and a
//      bodyweight stub carries weight 'Body Weight', which the old truthy check
//      counted as done (1995eba).
//   3. Editing a past day can fill in an exercise that day never logged. The
//      edit used to be silently dropped (56ef30e).
//   4. History lists a week newest first and numbers its days within the week,
//      however the entries sit in storage.
//   5. The header puts "Week N" on the title line (fca67f7's compact header),
//      so the card below gets the height back.
//   6. parseTimeToSeconds takes a non-string without throwing. Its strict
//      "M:SS" reading is unchanged on purpose: every time the app writes comes
//      from a dropdown in that shape, and reading a bare "12" as twelve minutes
//      would re-judge old cardio PRs.
//   7. The Progress page is gone, and Chart.js with it: nothing could open the
//      page since deff9b5, but every load still downloaded the library.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, waitFor } = require('../lib/browser');
const { seedPublicApp } = require('../lib/state');
const { PUBLIC_APP_ROOT, publicAppSource } = require('../lib/paths');
const { ACTIVE, bottomNav, goToCardById, logCard, revealCard, submitDay } = require('../lib/deck');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';

const dayOffset = (days, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};

function config() {
    return {
        version: 2,
        categories: ['Push'],
        minimalistPrTracking: true,
        days: {
            1: [
                { id: 'press', name: 'Chest Press', category: 'Push', order: 0, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'flies', name: 'Chest Flies', category: 'Push', order: 1, type: 'standard', minReps: 6, maxReps: 8 },
                { id: 'pushups', name: 'Push-ups', category: 'Push', order: 2, type: 'bodyweight', minReps: 10, maxReps: 20 },
            ],
        },
    };
}

const SCHEDULE = {
    version: 2, scheduleIsExplicit: true, totalWorkoutDays: 1,
    workoutDays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        .map(dayOfWeek => ({ dayOfWeek, workoutDayNumber: 1 })),
};

// Two sessions earlier today, stored OLDEST first. Chest Flies is missing from
// the older one, which is the row section 3 fills in. Same day as the new log
// below, so all three land in the current History week on any weekday.
const OLDER = {
    date: dayOffset(0, 0), day: 1, week: 1, submitted: true, plateauBusters: [],
    exercises: [{ id: 'press', name: 'Chest Press', category: 'Push', type: 'standard', weight: '100', reps: '6', minReps: 6, maxReps: 8 }],
};
const NEWER = {
    date: new Date(new Date(dayOffset(0, 0)).getTime() + 60000).toISOString(),
    day: 1, week: 1, submitted: true, plateauBusters: [],
    exercises: [{ id: 'press', name: 'Chest Press', category: 'Push', type: 'standard', weight: '100', reps: '7', minReps: 6, maxReps: 8 }],
};

(async () => {
    const server = await start({ root: PUBLIC_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        const requested = [];
        page.on('request', (req) => requested.push(req.url()));
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPublicApp(page, { exerciseConfig: config(), workoutHistory: [OLDER, NEWER], schedule: SCHEDULE });
        await page.evaluate((ns) => {
            localStorage.setItem(ns + 'lastBackupReminder', String(Date.now()));
            localStorage.setItem(ns + 'hasSeenTutorial', 'true');
        }, NS);
        requested.length = 0;
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        // --- 7. No Progress page, no Chart.js ------------------------------
        eq(requested.filter(u => /chart\.js|chart\.umd/i.test(u)), [], 'Chart.js is not downloaded');
        eq(await page.evaluate(() => typeof ProgressView), 'undefined', 'the Progress page is gone');
        ok(!/ProgressView/.test(publicAppSource()), 'and nothing in the source still names it');

        // --- 5. Header ------------------------------------------------------
        const header = await page.evaluate(() => {
            const week = document.querySelector('.header .week-indicator');
            const top = document.querySelector('.header .header-top');
            return { inTop: !!(week && top && top.contains(week)), text: week ? week.textContent.trim() : null };
        });
        ok(header.inTop, '"Week N" sits on the title line, inside .header-top');
        ok(/^Week \d+$/.test(header.text || ''), 'and still reads "Week N"');

        // --- 6. parseTimeToSeconds -----------------------------------------
        const parsed = await page.evaluate(() => {
            const r = {};
            for (const [k, v] of [['mss', '12:30'], ['number', 90], ['bare', '12'], ['empty', '']]) {
                try { r[k] = parseTimeToSeconds(v); } catch (e) { r[k] = 'threw'; }
            }
            return r;
        });
        eq(parsed, { mss: 750, number: 0, bare: 0, empty: 0 },
            'parseTimeToSeconds never throws, and keeps its strict M:SS reading');

        // --- 1. "Last:" after logging ----------------------------------------
        await goToCardById(page, 'press');
        await revealCard(page);
        await page.evaluate((sel) => {
            const w = document.querySelector(sel + ' input[type="number"][inputmode="decimal"]');
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(w, '105');
            w.dispatchEvent(new Event('input', { bubbles: true }));
            const r = document.querySelector(sel + ' input[type="number"][inputmode="numeric"]');
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(r, '6');
            r.dispatchEvent(new Event('input', { bubbles: true }));
        }, ACTIVE);
        await new Promise(r => setTimeout(r, 120));
        ok(await logCard(page, { settle: 250, waitForAutoAdvance: false }), 'logged Chest Press 105 x 6');
        await new Promise(r => setTimeout(r, 2500));
        await goToCardById(page, 'press');
        const last = await page.evaluate((sel) => {
            const el = document.querySelector(sel + ' .card-last');
            return el ? el.textContent.trim() : null;
        }, ACTIVE);
        eq(last, 'Last: 100lbs × 7', 'the logged card\'s "Last:" is the previous session, not the set just logged');

        // --- 2. Exercises Completed ----------------------------------------
        ok(await submitDay(page), 'Submit Day clicked');
        await waitFor(page, 'the Day Breakdown', () =>
            Array.from(document.querySelectorAll('div')).some(d => d.textContent.trim() === 'Exercises Completed'));
        const completed = await page.evaluate(() => {
            const label = Array.from(document.querySelectorAll('div'))
                .find(d => d.textContent.trim() === 'Exercises Completed');
            return label.nextElementSibling.textContent.trim();
        });
        eq(completed, '1 / 3', 'only the one logged exercise counts — not the empty rows beside it');
        await page.evaluate(() => {
            const close = Array.from(document.querySelectorAll('button')).find(b => /^Close$/i.test(b.textContent.trim()));
            if (close) close.click();
        });
        await new Promise(r => setTimeout(r, 250));

        // --- 4. History order and numbering --------------------------------
        await bottomNav(page, 'History');
        await page.waitForSelector('.history-item', { timeout: 8000 });
        const titles = await page.evaluate(() => Array.from(document.querySelectorAll('.history-item'))
            .map(item => {
                const text = item.textContent;
                const m = text.match(/Day (\d+)/);
                const reps = Array.from(item.querySelectorAll('.history-exercise-data')).map(d => d.textContent.trim())[0];
                return [m ? Number(m[1]) : null, reps];
            }));
        eq(titles, [[3, '105lbs × 6'], [2, '100lbs × 7'], [1, '100lbs × 6']],
            'newest first, numbered 3, 2, 1 within the week, whatever the storage order');

        // --- 3. Edit a past day, filling in an exercise it never logged ----
        await page.evaluate(() => {
            const items = document.querySelectorAll('.history-item');
            const oldest = items[items.length - 1];
            Array.from(oldest.querySelectorAll('button')).find(b => b.textContent.includes('✏')).click();
        });
        await waitFor(page, 'the edit modal', () =>
            Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Save Changes')));
        await page.evaluate(() => {
            // Weight inputs render in program order: Chest Press, then Chest Flies.
            const weights = Array.from(document.querySelectorAll('.modal input[placeholder="Weight"]'));
            const reps = Array.from(document.querySelectorAll('.modal input[placeholder="Reps"]'));
            const set = (el, v) => {
                Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
                el.dispatchEvent(new Event('input', { bubbles: true }));
            };
            set(weights[1], '80');
            set(reps[1], '8');
        });
        await new Promise(r => setTimeout(r, 100));
        await page.evaluate(() => Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.includes('Save Changes')).click());
        await new Promise(r => setTimeout(r, 300));
        const filled = await page.evaluate((ns, date) => {
            const h = JSON.parse(localStorage.getItem(ns + 'gymWorkoutHistory'));
            const w = h.find(x => x.date === date);
            const f = w.exercises.find(e => e.id === 'flies');
            return f ? [f.name, f.weight, f.reps] : null;
        }, NS, OLDER.date);
        eq(filled, ['Chest Flies', '80', '8'], 'the edit adds the missing exercise to that day');

        eq(errors, [], 'no console errors');
        console.log('PASS: the public app has the six older personal-app fixes and no Progress page.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
