// Puppeteer wrapper. Centralizes browser launch + page setup so test cases
// stay focused on the *what*, not the *how*.

const path = require('path');
const puppeteer = require(path.join(__dirname, '..', 'node_modules', 'puppeteer-core'));
const { installCdnShim } = require('./cdn');
const { PILL_JS } = require('./pill');
const { setNow } = require('./clock');

// Every page the harness opens runs in this time zone, whatever the machine's,
// so a case sees the same local date and hour everywhere. Phoenix has no DST.
// (Case 152 once failed at 8 p.m. Monday there, because the app sliced a UTC
// date and Sunday's check-in landed on Monday.)
const TIME_ZONE = 'America/Phoenix';
// The Node process running a case (fixtures built from `new Date()`) and the
// Chrome it launches use the same zone, so they agree on what day it is.
// run.sh exports it too; this covers a case run by hand. Chrome's launch
// environment also carries it, which closes the first-script race of a popup
// that the CDP override below cannot win.
process.env.TZ = TIME_ZONE;

async function pinTimeZone(page) {
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setTimezoneOverride', { timezoneId: TIME_ZONE });
}

// Try a few common chrome locations so this works on different boxes.
// puppeteer-core (unlike puppeteer) never downloads a browser of its own, so
// one of these has to exist. Set CHROME_PATH to override on an unusual box.
const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    // Linux
    '/usr/bin/google-chrome',
    // Playwright's browser cache, which is what CI containers usually ship
    // instead of a system Chrome. A symlink, and statSync follows symlinks.
    '/opt/pw-browsers/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // Windows. Both Program Files variants plus the per-user install, which is
    // where Chrome lands when it is installed without admin rights.
    process.env.ProgramFiles && process.env.ProgramFiles + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env['ProgramFiles(x86)'] && process.env['ProgramFiles(x86)'] + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA && process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

function findChrome() {
    const fs = require('fs');
    for (const p of CHROME_CANDIDATES) {
        try { if (fs.statSync(p)) return p; } catch (_) {}
    }
    throw new Error(
        'No Chrome found. Set CHROME_PATH, or install Chrome. Tried:\n  ' +
        CHROME_CANDIDATES.join('\n  '));
}

async function launch() {
    // Deliberately NO userDataDir. Puppeteer then creates a fresh temp profile
    // per launch, which is what keeps concurrent cases from sharing the
    // `gym-local:` localStorage namespace — run.sh runs several at once. Setting
    // a fixed userDataDir here (a tempting way to shave launch time) would make
    // parallel runs silently nondeterministic rather than failing outright.
    // Cases also land on different ports, so they are different origins too;
    // that is a second layer, not the one to rely on.
    const browser = await puppeteer.launch({
        executablePath: findChrome(),
        headless: 'new',
        env: { ...process.env, TZ: TIME_ZONE },
        // --disable-dev-shm-usage: containers default /dev/shm to 64 MB SHARED
        // across every concurrent Chrome, and renderers crash in ways that read
        // as random flakes. Costs nothing outside a container.
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    // Every case builds its page with browser.newPage(), so wrapping it here
    // installs the CDN shim suite-wide without touching a single case file.
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async (...args) => {
        const page = await newPage(...args);
        await pinTimeZone(page);
        await installCdnShim(page);
        await page.evaluateOnNewDocument(PILL_JS);
        return page;
    };
    // Tabs the app opens itself (window.open, target=_blank) never pass through
    // newPage, so pin them as they appear. Best effort: unlike newPage this
    // cannot finish before the new tab's first script, so a case that
    // depends on a popup's time zone should open it with newPage instead.
    browser.on('targetcreated', async (target) => {
        if (target.type() !== 'page') return;
        try { await pinTimeZone(await target.page()); } catch (_) {}
    });
    return browser;
}

// Surfaces page-side errors back to the test process so a silent JS failure
// in the app shows up as a clear test failure.
//
// Chrome reports a generic "Failed to load resource: 404" console error for
// every 404, with no URL in the message. To filter the harmless favicon
// 404, we also watch the network layer and ignore any 404 console error
// that lines up (timing-wise) with a favicon.ico request failure.
function attachConsole(page) {
    const errors = [];
    let faviconFailed = false;

    page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`));
    page.on('response', resp => {
        if (resp.status() === 404 && resp.url().endsWith('/favicon.ico')) {
            faviconFailed = true;
        }
    });
    page.on('console', msg => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        // Swallow the matching favicon 404 console error.
        if (faviconFailed && /Failed to load resource.*404/i.test(text)) {
            faviconFailed = false;
            return;
        }
        errors.push(`[console.error] ${text}`);
    });
    return errors;
}

// Waits for the workout screen to render, which is our signal that React has
// finished hydrating.
//
// Two selectors because the workout screen has been both: a scrolling list of
// `.exercise-card`s and the swipe deck whose cards live inside `.deck-stage`.
// The list half dates from when this suite also covered the public app (until
// Oct 2026); asking for either costs nothing, and "the workout screen exists"
// is the same question whichever element answers it.
async function waitForApp(page, timeoutMs = 8000) {
    try {
        await page.waitForFunction(
            () => !!(document.querySelector('.deck-stage') || document.querySelector('.exercise-card')),
            { timeout: timeoutMs, polling: 50 });
    } catch (err) {
        throw new Error('timed out after ' + (timeoutMs / 1000) + 's waiting for the workout ' +
            'screen (neither .deck-stage nor .exercise-card appeared)');
    }
    // Give React one more tick so derived state (PR helpers, defaults) settles.
    await new Promise(r => setTimeout(r, 250));
}

// The day toggle lives in Settings (Nov 2026), above Manage Exercises. These
// open the gear, act, and close it again, so a case is left exactly where it
// was — on the deck, or on History — with only the day changed.
async function openSettings(page) {
    await page.evaluate(() => document.querySelector('.settings-btn').click());
    await waitFor(page, 'the Settings modal to open',
        () => !!document.querySelector('.modal .modal-title'));
}

async function closeSettings(page) {
    await page.evaluate(() => {
        const close = Array.from(document.querySelectorAll('.modal .modal-btn'))
            .find(b => b.textContent.trim() === 'Close');
        if (close) close.click();
    });
    await waitFor(page, 'the Settings modal to close', () => !document.querySelector('.modal'));
}

// What the Settings day toggle shows: every day it offers, which one is
// active, whether it is locked, and the note under it ('' when none).
async function readDayToggle(page) {
    await openSettings(page);
    const state = await page.evaluate(() => {
        const toggle = document.querySelector('.modal [data-day-type-toggle]');
        const pills = Array.from(document.querySelectorAll('.modal [data-day-type]'));
        return {
            days: pills.map(b => b.getAttribute('data-day-type')),
            active: (pills.find(b => b.classList.contains('active')) || { getAttribute: () => null })
                .getAttribute('data-day-type'),
            locked: !!toggle && toggle.hasAttribute('data-locked'),
            note: (document.querySelector('.modal [data-day-note]')?.textContent || '').trim(),
        };
    });
    await closeSettings(page);
    return state;
}

// Selects a day via the Settings toggle, so tests are independent of which
// day the app picked from history.
//
// Throws by default when it cannot: no pill for that day, or the toggle is
// locked on another one (something was logged today). It used to return false
// and let the caller carry on, but almost every call site ignores the return
// value, so a renamed day literal would leave ~20 cases silently testing
// whatever day the app opened on — which reads as flakiness rather than a bug.
// Failing loudly here turns that into one precise message.
//
// Asking for the day already showing is a success without a click, locked or
// not; that is the state the caller wanted.
//
// Pass { optional: true } when the absence of a toggle is the thing under test
// (e.g. asserting a retired day type is gone).
async function selectDayType(page, type, { optional = false } = {}) {
    await openSettings(page);
    const result = await page.evaluate((t) => {
        const toggle = document.querySelector('.modal [data-day-type-toggle]');
        const pills = Array.from(document.querySelectorAll('.modal [data-day-type]'));
        const available = pills.map(b => b.getAttribute('data-day-type'));
        const btn = pills.find(b => b.getAttribute('data-day-type') === t);
        if (!btn) return { clicked: false, available };
        if (btn.classList.contains('active')) return { clicked: false, already: true, available };
        if (toggle.hasAttribute('data-locked')) return { clicked: false, locked: true, available };
        btn.click();
        return { clicked: true, available };
    }, type);
    await closeSettings(page);
    if (result.already) return true;

    if (!result.clicked && !optional) {
        throw new Error(result.locked
            ? `the day toggle is locked, so "${type}" cannot be chosen (something was logged today)`
            : `no day-type toggle for "${type}" ` +
              `(available: ${result.available.length ? result.available.join(', ') : 'none'})`);
    }
    if (result.clicked) await new Promise(r => setTimeout(r, 150));
    return result.clicked;
}

// Reads exercise cards from the current view. Each card describes what
// the user actually sees: name, "Last:" text, default weight value, etc.
async function readCards(page) {
    return page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.exercise-card'));
        return cards.map(c => {
            const name = c.querySelector('.exercise-name')?.textContent?.trim() || '';
            const last = c.querySelector('.previous-data')?.textContent?.trim() || '';
            const weightInput = c.querySelector('input[inputmode="decimal"], input[type="number"]');
            return {
                name,
                last,
                weightValue: weightInput?.value || '',
                weightPlaceholder: weightInput?.placeholder || '',
                hasWeightBreakdown: !!Array.from(c.querySelectorAll('button'))
                    .find(b => b.textContent.includes('Weight Breakdown')),
            };
        });
    });
}

// Wait for something to become true in the page, instead of sleeping a fixed
// amount and hoping.
//
// A fixed sleep is a bet on how fast the machine is. Too short and the case
// fails spuriously; too long and every run pays for the worst case forever.
// Both halves of that bet got worse when run.sh started running six cases at
// once, because the machine is now busier exactly when a case is waiting.
//
// `label` is not decoration: when this throws, it is the only thing that says
// what the test was waiting for. "timed out waiting for the coach-code config
// to be written" is a bug report; "waitForFunction timed out" is a puzzle.
async function waitFor(page, label, fn, ...args) {
    try {
        await page.waitForFunction(fn, { timeout: 20000, polling: 50 }, ...args);
    } catch (err) {
        throw new Error(`timed out after 20s waiting for ${label}`);
    }
}

// A real tap: waits for the element, scrolls it to the middle of the screen
// and clicks its center through the browser's input pipeline, so hit-testing
// applies and an overlay covering it eats the tap, as it would for a thumb.
// Prefer it to `el.click()` inside page.evaluate, which skips hit-testing
// (tests/check-no-sync-waits.sh flags new ones). To wait for a condition, use
// waitFor above, which polls rather than sleeping.
//
// Most buttons in the app have no id, so `text` narrows the selector's matches
// by label: a string must equal the trimmed textContent ('Edit' does not match
// 'Edit Plan'), a RegExp is tested against it, and the first match is tapped.
// Without `text` the selector goes to Puppeteer as it is, so its own selector
// syntax (`::-p-text(...)`, `aria/...`) still works; with it, the selector must
// be plain CSS.
//
// A button only the case can pick out, such as the arrow in one named row,
// can be passed as an ElementHandle instead of a selector (from
// page.evaluateHandle); it is tapped as it is, with no waiting.
async function tap(page, selector, { text, timeout = 20000 } = {}) {
    let el;
    if (typeof selector !== 'string') {
        el = selector && selector.asElement && selector.asElement();
        if (!el) throw new Error('tap: expected a selector or an ElementHandle, got ' + selector);
    } else {
        el = await findTapTarget(page, selector, text, timeout);
    }
    await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await el.click();
}

async function findTapTarget(page, selector, text, timeout) {
    const label = selector +
        (text === undefined ? '' : ` with text ${text instanceof RegExp ? text : JSON.stringify(text)}`);
    // A RegExp cannot cross into the page, so it goes as source and flags.
    const want = text instanceof RegExp ? { re: text.source, flags: text.flags }
        : text === undefined ? null : { eq: String(text) };
    try {
        if (!want) return await page.waitForSelector(selector, { timeout });
        const handle = await page.waitForFunction((sel, want) => {
            const re = want.re !== undefined && new RegExp(want.re, want.flags);
            return Array.from(document.querySelectorAll(sel)).find((e) => {
                const t = e.textContent.trim();
                if (!re) return t === want.eq;
                re.lastIndex = 0; // g and y make test() resume where the last element left off
                return re.test(t);
            }) || false;
        }, { timeout, polling: 50 }, selector, want);
        return handle.asElement();
    } catch (err) {
        throw new Error(`timed out after ${timeout / 1000}s waiting for ${label} to exist`);
    }
}

// Wait until the page's own clock reads `ms` or later (epoch ms, what Date.now()
// returns in the page). For a case whose subject is elapsed time, such as two
// stamps a known gap apart or a timer that must have had its chance to fire,
// this is the condition a fixed sleep stood in for. It reads the clock the app
// stamps with, so a gap asserted between two page timestamps really is there.
async function waitForPageTime(page, label, ms) {
    if (!Number.isFinite(ms)) throw new Error(`waitForPageTime: no valid instant to wait for (${label}): ${ms}`);
    await waitFor(page, label, (t) => Date.now() >= t, ms);
}

// The two conditions almost every case waits on.
const waitForStorageKey = (page, ns, key) =>
    waitFor(page, `${key} to appear in localStorage`,
        (ns, key) => !!localStorage.getItem(ns + key), ns, key);

const waitForCards = (page) =>
    waitFor(page, 'exercise cards to render',
        () => document.querySelectorAll('.exercise-card').length > 0);

module.exports = { launch, setNow, TIME_ZONE, attachConsole, waitForApp, readCards, selectDayType, readDayToggle,
                   openSettings, closeSettings,
                   waitFor, waitForPageTime, tap, waitForStorageKey, waitForCards };
