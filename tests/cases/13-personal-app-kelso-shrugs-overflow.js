// What this test covers
// ----------------------
// Kelso Shrugs is a PLATE-LOADED one-sided exercise (it used to be a pin
// stack capped at 200 lbs; that was changed to plate-loaded in config.js).
// The weight breakdown therefore shows the plate-loaded shape — warmup and
// top-set totals rendered as "(<total> lbs - ~NN%):" with a floor plate
// breakdown, and NO "Pin: ... lbs" overflow line. At a working weight of 215:
//   - Warmup 1 = 70% of 215 = 150.5 → 150, which is 45×3 + 10 + 5
//   - Warmup 2 = 90% of 215 = 193.5 → 195, which is 45×4 + 10 + 5
//   - Top set  = 215 (never rounded) → 45×4 + 25 + 10
//
// Warmup 2 was 190 under the old nearest-10 rule. Since Aug 2026 a warmup
// rounds to the nearest load you can actually BUILD — any number of 45s plus at
// most one each of 25, 10 and 5 — and 193.5 is nearer 195 than 190.
//
// To verify this test is real: in js/config.js, change kelso-shrugs's seeded
// loadType from 'plate-one-sided' to 'pin' and add 'kelso-shrugs': 200 to
// PIN_STACK_CAPS. The plate lists disappear — a pin row states one weight and
// nothing else — and the test fails.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { goToCard, revealCard, isRevealed, readDeckCard } = require('../lib/deck');
const { seedPersonalApp, workoutEntry } = require('../lib/state');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

// The breakdown lives on the card's revealed face now, so "clicking" it means
// navigating to the card and swiping up.
async function clickBreakdown(page, name) {
    await goToCard(page, name);
    await revealCard(page);
    return isRevealed(page);
}

async function readCard(page, name) {
    const card = await readDeckCard(page, name);
    return card.breakdown.join('  ~  ');
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });

        // Seed Kelso Shrugs at 215 lbs — well above the old 200 lb pin cap, so
        // if it were still a pin stack the top set would overflow. As a
        // plate-loaded movement there is no cap: every set is a plain plate
        // breakdown.
        const workoutHistory = [
            workoutEntry({
                date: '2026-05-27T20:00:00Z', day: 1,
                exercises: [{ id: 'kelso-shrugs', name: 'Kelso Shrugs', weight: '215', reps: '5' }],
            }),
        ];
        await seedPersonalApp(page, { workoutHistory });
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await selectDayType(page, 'posterior');

        const clicked = await clickBreakdown(page, 'Kelso Shrugs');
        ok(clicked, 'Kelso Shrugs opens to show its breakdown');
        await new Promise(r => setTimeout(r, 250));

        const text = await readCard(page, 'Kelso Shrugs');

        contains(text, '150 lbs',
            'warmup 1 (150.5) rounds to a loadable 150 = 45x3 + 10 + 5');
        contains(text, '195 lbs',
            'warmup 2 (193.5) rounds to a loadable 195 = 45x4 + 10 + 5, not the old 190');
        contains(text, '215 lbs',
            'top set shows exact 215 lbs (plate-loaded label shape)');

        // No pin cap anymore — the pin-stack overflow line must be gone.
        ok(text.indexOf('pin ') === -1,
            'no pin-at-max overflow row — Kelso Shrugs is plate-loaded, not a capped stack');
        // One-sided plate loading has no per-side split, so the thing that
        // separates it from a pin stack is the PLATE LIST: a pin row states a
        // single weight and nothing else.
        ok(/\d+(?: × \d+)?, /.test(text),
            'renders a comma-separated plate list, which a pin stack never does');

        // Top set 215 one-sided = 45×4 + 25 + 10. Spot-check the plate lines.
        ok(text.indexOf('45 × 4') !== -1, 'top set plate breakdown lists four 45 lb plates');
        ok(/(^|[^0-9])25([^0-9×]|$)/.test(text),
            'top set lists a 25 — a single plate carries no count now, so it reads "25" ' +
            'rather than "25 x 1"');
        ok(/(^|[^0-9])10([^0-9×]|$)/.test(text), 'and a 10 lb plate');

        eq(errors, [], 'no console errors during load');
        console.log('PASS: Kelso Shrugs renders plate-loaded one-sided breakdown at 215 lbs.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
