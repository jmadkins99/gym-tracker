// What this test covers
// ----------------------
// The daily badge as ADHERENCE, and bootstrapped history earning nothing,
// September 2026.
//
// The daily streak used to reward a reading that held or fell against the one
// before. That paid out for a dehydrated Tuesday, broke on a legitimate refeed,
// and — measured over the real seeded history — went dark for a week or more at
// a time during a regain, which is when logging matters most. It now counts
// days in a row the scale was stood on, whatever it said, and the weekly badge
// carries the question of whether any of it is working.
//
// Two rules fall out of that and both are pinned here:
//
//   - A missed day ends the run. Consecutive has to mean consecutive or the
//     badge is measuring nothing.
//   - Days inside a FLAT WEEK cannot be credited. A week seeded to bootstrap
//     the plan — seven days that never varied by a tenth — is typed-in history,
//     not seven mornings anyone showed up for, and the streak stops at its
//     edge. The definition is deliberately the narrowest one that still catches
//     a bootstrap: all seven days present, every reading identical. Six
//     matching days and a seventh that differs is a real week, and phase 2
//     pins that boundary by changing a single day by 0.1 and watching the
//     streak run back through it.
//
// The expected counts are derived from the weekday the suite runs on rather
// than hardcoded, because "days so far this week" is 1 on a Monday and 7 on a
// Sunday. Hardcoding either would leave a case that failed six days in seven.
//
// Mutation checks: drop the `length === 7` clause and phase 2 fails, since a
// six-day week would then read as flat; drop the flat-week check inside
// checkInStreak and phase 1 counts straight back through the seeded week; drop
// the consecutive-day check and phase 3 reads the full week instead of 1;
// drop the `weeks[i - 1].flat` clause in weekStreak and phase 1 grows a weekly
// badge it has not earned.

const { start } = require('../lib/server');
const { launch, attachConsole, waitFor } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';

const FLAT = 175.0;
// This week descends from just under the flat week, so the weekly badge has
// something to earn in phase 2. Descending rather than constant also keeps the
// current week from itself reading as flat when the suite runs on a Sunday.
const THIS_WEEK_TOP = 174.0;
const BREAK_DAY = 6;
const BREAK_TO = 174.9;

// Week buckets are LOCAL Mondays, so the fixture is built against the page's
// own clock — the same reason cases 96 and 97 do it in-page.
const seed = (page, opts) => page.evaluate((ns, flat, top, o) => {
    const pad = (n) => String(n).padStart(2, '0');
    const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const now = new Date();
    const monday = new Date(getMondayOfWeek(now));
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    const log = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(d.getDate() - 7 + i);
        log.push({
            date: key(d),
            weight: (o.breakFlat && i === o.breakDay) ? o.breakTo : flat,
            loggedAt: new Date(d).toISOString(),
        });
    }
    // This week, Monday through today.
    for (let d = new Date(monday), i = 0; key(d) <= key(now); d.setDate(d.getDate() + 1), i++) {
        if (o.skipYesterday && key(d) === key(yesterday)) continue;
        log.push({ date: key(d), weight: top - i * 0.1, loggedAt: new Date(d).toISOString() });
    }

    localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
    localStorage.setItem(ns + 'weightHistorySeeded', 'true');
    localStorage.setItem(ns + 'gymWeightPlan', 'null');
}, NS, FLAT, THIS_WEEK_TOP, opts);

// Monday is 1 day in, Sunday is 7.
const daysThisWeek = (page) => page.evaluate(() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
});

const badges = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('.weigh-badge')).map((b) => b.textContent.trim()));

const dayCount = (list) => {
    const badge = list.find((b) => b.includes('day'));
    return badge ? parseInt(badge.replace(/[^0-9]/g, ''), 10) : 0;
};

const load = async (page, server, opts) => {
    await seed(page, opts);
    await page.reload({ waitUntil: 'networkidle0' });
    await waitFor(page, 'the check-in card to render',
        () => !!document.querySelector('.weigh-card'));
    return badges(page);
};

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);

        await page.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        const week = await daysThisWeek(page);

        // === 1. The streak stops at the edge of a bootstrapped week ======
        const afterFlat = await load(page, server, { breakFlat: false });
        eq(dayCount(afterFlat), week,
            'adherence should count this week only, stopping at the seeded week: '
            + JSON.stringify(afterFlat));
        eq(afterFlat.some((b) => b.includes('wk')), false,
            'a flat week may not be scored against: ' + JSON.stringify(afterFlat));

        // === 2. One different reading makes it a real week again ========
        const afterReal = await load(page, server, {
            breakFlat: true, breakDay: BREAK_DAY, breakTo: BREAK_TO,
        });
        eq(dayCount(afterReal), week + 7,
            'six identical days and a seventh that differs is a real week, and the '
            + 'streak runs back through it: ' + JSON.stringify(afterReal));
        ok(afterReal.some((b) => b.includes('wk')),
            'a real week must still be scoreable: ' + JSON.stringify(afterReal));

        // === 3. A missed day ends the run ================================
        //
        // Whatever the weekday, skipping yesterday leaves today as the only
        // day with an unbroken line behind it.
        const afterGap = await load(page, server, {
            breakFlat: true, breakDay: BREAK_DAY, breakTo: BREAK_TO, skipYesterday: true,
        });
        eq(dayCount(afterGap), 1,
            'a missed day must end the streak: ' + JSON.stringify(afterGap));

        ok(errors.length === 0, 'no console errors: ' + JSON.stringify(errors));
        console.log('PASS');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
