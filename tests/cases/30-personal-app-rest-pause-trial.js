// What this test covers
// ----------------------
// The 3-rep rest-pause / Trial of Strength flow (simple tracking mode):
//   - Last session at 3 reps -> yellow "Rest Pause Set Recommended" banner,
//     reps default carries the 3, weight carries over unchanged.
//   - Two sessions in a row at 3 reps -> still the yellow rest-pause banner.
//   - Three sessions in a row at 3 reps -> green "Trial of Strength" banner,
//     reps default bumps to 4, weight still unchanged.
//   - Breaking the streak (last session 4+) -> no banner, normal carry-over.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// Read a standard card's weight, reps value, and any banner texts.
async function readStandardCard(page, name) {
    return page.evaluate((n) => {
        const card = Array.from(document.querySelectorAll('.exercise-card'))
            .find(c => c.querySelector('.exercise-name')?.textContent?.trim() === n);
        if (!card) return null;
        const weightInput = card.querySelector('input[type="number"][inputmode="decimal"]');
        const repsSelect = card.querySelector('select[data-field="reps"]');
        const text = card.textContent;
        return {
            weightValue: weightInput ? weightInput.value : null,
            repsValue: repsSelect ? repsSelect.value : null,
            hasRestPauseBanner: text.includes('Rest Pause Set Recommended'),
            hasTrialBanner: text.includes('Trial of Strength'),
        };
    }, name);
}

// Build history of consecutive weekly full-body sessions for shoulder-press
// with the given reps sequence (oldest first). The app stores history
// newest-first (it prepends), so the returned array is newest-first too.
function historyWithReps(repsSeq) {
    return repsSeq.map((reps, i) =>
        workoutEntry({
            date: `2026-0${4 + Math.floor(i / 4)}-${String(1 + (i % 4) * 7).padStart(2, '0')}T20:00:00Z`,
            day: 'fullbody',
            exercises: [{ id: 'shoulder-press', name: 'Shoulder Press', weight: '100', reps }],
        }))
        .reverse();
}

async function loadWithHistory(page, server, workoutHistory) {
    await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
    await seedPersonalApp(page, { workoutHistory });
    await page.evaluate(() => localStorage.setItem('gym-local:firstWorkoutMonday', '2026-04-01T00:00:00.000Z'));
    await page.reload({ waitUntil: 'networkidle0' });
    await waitForApp(page);
    await selectDayType(page, 'upper');
    return readStandardCard(page, 'Shoulder Press');
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);

        // One session at 3 reps -> yellow rest-pause banner, carry 3 reps @ 100.
        let sp = await loadWithHistory(page, server, historyWithReps(['5', '3']));
        ok(sp, 'Shoulder Press card renders');
        eq(sp.hasRestPauseBanner, true, '1x 3-rep session shows Rest Pause Set Recommended');
        eq(sp.hasTrialBanner, false, '1x 3-rep session shows no Trial of Strength');
        eq(sp.repsValue, '3', 'reps default carries the 3');
        eq(sp.weightValue, '100', 'weight carries over unchanged');

        // Two sessions at 3 reps -> still yellow rest-pause.
        sp = await loadWithHistory(page, server, historyWithReps(['5', '3', '3']));
        eq(sp.hasRestPauseBanner, true, '2x 3-rep sessions still show Rest Pause Set Recommended');
        eq(sp.hasTrialBanner, false, '2x 3-rep sessions show no Trial of Strength');

        // Three sessions at 3 reps -> green Trial of Strength, target 4 reps.
        sp = await loadWithHistory(page, server, historyWithReps(['5', '3', '3', '3']));
        eq(sp.hasTrialBanner, true, '3x 3-rep sessions show Trial of Strength');
        eq(sp.hasRestPauseBanner, false, 'Trial replaces the rest-pause banner');
        eq(sp.repsValue, '4', 'Trial of Strength hints 4 reps');
        eq(sp.weightValue, '100', 'Trial of Strength keeps the same weight');

        // Streak broken (most recent session 4 reps) -> no banners, normal carry.
        sp = await loadWithHistory(page, server, historyWithReps(['3', '3', '3', '4']));
        eq(sp.hasRestPauseBanner, false, 'streak broken: no rest-pause banner');
        eq(sp.hasTrialBanner, false, 'streak broken: no Trial of Strength');
        eq(sp.repsValue, '4', 'streak broken: reps carry over normally');

        eq(errors, [], 'no console errors');
        console.log('PASS: 3-rep rest-pause banner escalates to Trial of Strength after 3 sessions.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
