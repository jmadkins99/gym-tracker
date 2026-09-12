// What this test covers
// ----------------------
// Shoulder Press (id `shoulder-press`) is a pin stack capped at 250, added
// Sep 2026. Unlike every other cap in the program it was already PASSED on the
// day it landed: the user is working at 255, up from 232.5-233.75 in the June
// backup, so the overflow shape is not a future state this entry anticipates —
// it is what the card renders every session from now on.
//
// The third home for overflow rendering, and it earns the slot by covering the
// branch the other two cannot:
//
//   - 08 (Calf Raises, 500 against 405) overflows by 95 — 45 + 45 + 5.
//   - 26 (Back Extensions, 270 against 260) overflows by 10 — one plate.
//   - here (Shoulder Press, 257.5 against 250) overflows by 7.5 — a 5 AND a
//     2.5, the first overflow the SUITE renders that uses a micro-plate.
//
// That matters because `breakdownPlatesFloor` walks [45, 25, 10, 5, 2.5, 1.25]
// and drops any remainder under 1.25 as unloadable. Every overflow this suite
// had ever rendered stopped at the 5; nothing proved the tail of that list is
// reachable. A regression that truncated availablePlates after the 5 would pass
// 08 and 26 untouched and silently round this card down to 255.
//
// "First in the suite", not first in the program — Lateral Raises has been
// loading pin 100 + 25 + 5 + 2.5 in the gym since before this case existed, and
// nothing renders it. That gap is the whole reason the tail went unproven: the
// program reached the micro-plates well before the tests noticed.
//
// Two working weights, both real:
//   255   — today. 70% = 178.5 -> 180, 90% = 229.5 -> 230, both on the pin.
//           Top set 255 -> overflow -> pin 250 + a 5.
//   257.5 — next session at the 2.5 lb step. Warmups round to the same
//           180/230; top set -> overflow -> pin 250 + a 5 + a 2.5.
// Only the top set overflows in either, so one card renders both branches —
// the same shape 26 proves, on a machine where the excess needs two plates of
// different sizes.
//
// This is also the first overflow case on ANTERIOR; both existing ones sit on
// Posterior, so the day toggle has never been part of this rendering path.
//
// To verify this test is real: in js/config.js, delete the 'shoulder-press'
// entry from PIN_STACK_CAPS. The "pin 250" rows disappear, both top sets render
// as plain pin positions, and the test fails. Raise the cap to 255 and the
// 255 probe stops overflowing while the 257.5 one drops its 5 — either half
// alone fails.

const path = require('path');
const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, selectDayType } = require('../lib/browser');
const { setWeightAndOpen } = require('../lib/deck');
const { eq, ok, contains } = require('../lib/assert');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        const errors = attachConsole(page);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await waitForApp(page);

        await selectDayType(page, 'anterior');

        // === 1. Today's working weight: 255, five over the cap ==========
        const today = await setWeightAndOpen(page, 'Shoulder Press', 255);

        contains(today, '255 lbs', 'top set total shown as 255 lbs');
        contains(today, 'pin 250', 'the pin is pegged at the 250 cap');
        contains(today, '180 lbs', 'warmup #1 = 178.5 -> nearest-10 = 180, under the cap');
        contains(today, '230 lbs', 'warmup #2 = 229.5 -> nearest-10 = 230, under the cap');

        const [todayWarmups, todayTop] = today.split('TOP SET');
        ok(todayTop && todayTop.indexOf('pin 250') !== -1,
            'the overflow row belongs to the top set');
        ok(todayWarmups.indexOf('pin ') === -1,
            'neither warmup overflows — both round to a position under the cap');
        ok(todayTop.indexOf('2.5') === -1,
            'a 5 lb excess is one 5, never a 2.5 pair');

        // === 2. Next session: 257.5, the first micro-plate overflow =====
        const next = await setWeightAndOpen(page, 'Shoulder Press', 257.5);

        contains(next, '257.5 lbs', 'top set total shown as 257.5 lbs (unrounded)');
        contains(next, 'pin 250', 'the pin is still pegged at the cap');
        contains(next, '2.5', 'the 7.5 excess reaches the micro-plate tail of the plate list');
        contains(next, '180 lbs', 'warmups are unchanged at 180');
        contains(next, '230 lbs', 'and 230');

        const [, nextTop] = next.split('TOP SET');
        ok(nextTop && nextTop.indexOf('2.5') !== -1,
            'the micro-plate belongs to the top set, not to a warmup');
        ok(nextTop.indexOf('1.25') === -1,
            'and the remainder is a single 2.5, never split into 1.25s');

        // A stack has no per-side split. Shoulder Press has always seeded 'pin',
        // so this is not guarding a reclassification the way 26 is — it guards
        // against the excess being handed to the plate-loaded branch, which
        // would render 7.5 as "3.75/side" and still satisfy every contains above.
        ok(next.indexOf('/side') === -1,
            'no per-side figures — Shoulder Press is a stack, not a two-sided sled');

        // === 3. The boundary: exactly at the cap is not overflow ========
        //
        // 250 is a real pin position. A cap that overflowed on its own top notch
        // would put a plate on the floor for every set at the ceiling, which is
        // where this user now lives.
        //
        // The proof is the TOP SET row being absent altogether rather than just
        // the pin row: a top set renders only in overflow mode, being otherwise
        // redundant with the Weight (lbs) input just typed into, so its absence
        // is the same statement the boundary is making.
        const atCap = await setWeightAndOpen(page, 'Shoulder Press', 250);
        ok(atCap.indexOf('pin 250') === -1,
            'a working weight exactly at the cap sits on the pin, no overflow row');
        ok(atCap.indexOf('TOP SET') === -1,
            'and no top set row at all — that row exists only to describe an overflow');
        contains(atCap, '180 lbs', 'the warmups still render at the boundary');
        contains(atCap, '230 lbs', 'both of them');

        eq(errors, [], 'no console errors during load');
        console.log('PASS');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
