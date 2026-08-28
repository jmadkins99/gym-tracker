// Puppeteer wrapper. Centralizes browser launch + page setup so test cases
// stay focused on the *what*, not the *how*.

const path = require('path');
const puppeteer = require(path.join(__dirname, '..', 'node_modules', 'puppeteer-core'));
const { installCdnShim } = require('./cdn');

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
        await installCdnShim(page);
        return page;
    };
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

// Waits for an `.exercise-card` to appear, which is our signal that React
// has finished hydrating + the workout view has rendered.
async function waitForApp(page, timeoutMs = 8000) {
    await page.waitForSelector('.exercise-card', { timeout: timeoutMs });
    // Give React one more tick so derived state (PR helpers, defaults) settles.
    await new Promise(r => setTimeout(r, 250));
}

// Selects a day type via the in-app toggle, so tests are independent of the
// real weekday (the view otherwise opens on whichever day the weekday rule
// picks).
//
// Throws by default when the toggle is not there. It used to return false and
// let the caller carry on, but almost every call site ignores the return value,
// so a renamed day literal would leave ~20 cases silently testing whatever day
// today happens to default to — passing or failing depending on the weekday,
// which reads as flakiness rather than a bug. Failing loudly here turns that
// into one precise message naming the toggles that do exist.
//
// Pass { optional: true } when the absence of a toggle is the thing under test
// (e.g. asserting a retired day type is gone).
async function selectDayType(page, type, { optional = false } = {}) {
    const result = await page.evaluate((t) => {
        const btn = document.querySelector(`[data-day-type="${t}"]`);
        if (btn) { btn.click(); return { clicked: true, available: [] }; }
        return {
            clicked: false,
            available: Array.from(document.querySelectorAll('[data-day-type]'))
                .map(b => b.getAttribute('data-day-type')),
        };
    }, type);

    if (!result.clicked && !optional) {
        throw new Error(
            `no day-type toggle for "${type}" ` +
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

// The two conditions almost every case waits on.
const waitForStorageKey = (page, ns, key) =>
    waitFor(page, `${key} to appear in localStorage`,
        (ns, key) => !!localStorage.getItem(ns + key), ns, key);

const waitForCards = (page) =>
    waitFor(page, 'exercise cards to render',
        () => document.querySelectorAll('.exercise-card').length > 0);

module.exports = { launch, attachConsole, waitForApp, readCards, selectDayType,
                   waitFor, waitForStorageKey, waitForCards };
