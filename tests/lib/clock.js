// Fixes the page's clock, so a case can pick its date instead of depending on
// the day and hour the suite happens to run.
//
//   await setNow(page, '2026-11-23T20:00:00-07:00');   // before page.goto
//
// Installed with evaluateOnNewDocument, so it is in place before any page
// script runs and survives reloads. `new Date()` and Date.now() start at the
// given instant and then keep ticking with real time, so timers, animations
// and "elapsed" arithmetic still behave; only the starting point is pinned.
// Combined with the harness's America/Phoenix time zone, the same instant
// is the same local date and hour on every machine.

function CLOCK_JS(startMs) {
    const RealDate = Date;
    const t0 = performance.now();
    const now = () => startMs + (performance.now() - t0);
    function FakeDate(...args) {
        if (!new.target) return new RealDate(now()).toString();
        return args.length === 0 ? new RealDate(Math.floor(now())) : new RealDate(...args);
    }
    FakeDate.prototype = RealDate.prototype;
    FakeDate.now = () => Math.floor(now());
    FakeDate.parse = RealDate.parse;
    FakeDate.UTC = RealDate.UTC;
    Object.setPrototypeOf(FakeDate, RealDate);
    RealDate.prototype.constructor = FakeDate;
    window.Date = FakeDate;
}

async function setNow(page, isoString) {
    const ms = Date.parse(isoString);
    if (Number.isNaN(ms)) throw new Error('setNow: not a date: ' + isoString);
    await page.evaluateOnNewDocument(CLOCK_JS, ms);
}

module.exports = { setNow };
