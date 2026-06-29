// What this test covers
// ----------------------
// Editing a mis-logged cardio workout from the Weekly tab's pencil button must
// be fully functional — the same as editing a full-body log. Regression: the
// Edit modal's Stairmaster Level was a *disabled* field (un-editable) and the
// Time dropdown used the old 5:00-20:00/15s range instead of 10:00-20:00/30s.
//
// This opens a seeded cardio workout's edit modal, confirms Level is an
// editable Level 7-10 dropdown and Time uses the new range, edits every field,
// saves, and verifies the Weekly view reflects the changes.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp } = require('../lib/browser');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

async function clickNav(page, label) {
    await page.evaluate((l) => {
        const btn = Array.from(document.querySelectorAll('.nav-btn')).find(b => b.textContent.trim() === l);
        if (btn) btn.click();
    }, label);
    await new Promise(r => setTimeout(r, 200));
}

async function setNumber(page, selector, value) {
    await page.click(selector, { clickCount: 3 });
    await page.type(selector, value);
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        const today = new Date();
        today.setHours(12, 0, 0, 0);
        const workoutHistory = [
            workoutEntry({
                date: today.toISOString(), day: 'cardio', submitted: true,
                exercises: [
                    { id: 'body-weight-squats', name: 'Body Weight Squats', type: 'bodyweight', weight: 'Body Weight', reps: '50' },
                    { id: 'stairmaster', name: 'Stairmaster', type: 'stairmaster', level: 'Level 9', time: '12:00' },
                    { id: 'assault-bike', name: 'Assault Bike', type: 'assault-bike', watts: '25', intensity: '20/40' },
                ],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.evaluate(() => localStorage.setItem('gym-local:lastBackupReminder', String(Date.now())));
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);

        await clickNav(page, 'Weekly');
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('✏️'));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 200));

        // Level must be an editable dropdown (the bug: it was a disabled input).
        const levelInfo = await page.evaluate(() => {
            const sel = document.querySelector('.modal select[data-field="level"]');
            if (!sel) return null;
            return { disabled: sel.disabled, value: sel.value, options: Array.from(sel.options).map(o => o.value) };
        });
        ok(levelInfo, 'stairmaster Level is a <select> in the edit modal');
        ok(!levelInfo.disabled, 'stairmaster Level select is editable (not disabled)');
        eq(levelInfo.options, ['Level 7', 'Level 8', 'Level 9', 'Level 10'], 'Level options are 7-10');
        eq(levelInfo.value, 'Level 9', 'Level pre-selects the logged value (9)');

        // Time dropdown uses the new 10:00-20:00 / 30s range.
        const timeOpts = await page.evaluate(() =>
            Array.from(document.querySelector('.modal select[data-field="time"]').options).map(o => o.value));
        ok(timeOpts.includes('10:00') && timeOpts.includes('20:00'), 'time range covers 10:00-20:00');
        ok(timeOpts.includes('12:30') && !timeOpts.includes('12:15'), 'time uses 30s steps (12:30 yes, 12:15 no)');
        ok(!timeOpts.includes('5:00'), 'old 5:00 option is gone');

        // Edit every field, then save.
        await page.select('.modal select[data-field="level"]', 'Level 10');
        await page.select('.modal select[data-field="time"]', '15:00');
        await setNumber(page, '.modal input[data-field="reps"]', '99');
        await page.select('.modal select[data-field="watts"]', '35');
        await page.select('.modal select[data-field="intensity"]', '32/28');
        await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('.modal button')).find(b => /save/i.test(b.textContent));
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 300));

        // Weekly view should now reflect all of the edits.
        const weeklyText = await page.evaluate(() => document.querySelector('.content')?.textContent || '');
        contains(weeklyText, 'BW × 99', 'squats reps updated to 99');
        contains(weeklyText, '15:00 / Level 10', 'stairmaster time + level updated');
        contains(weeklyText, '32/28 @ 35W', 'assault bike intensity + watts updated');

        eq(errors, [], 'no console errors during edit');
        console.log('PASS: cardio workout is fully editable from the Weekly pencil button.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
