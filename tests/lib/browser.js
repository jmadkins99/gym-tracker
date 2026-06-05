// Puppeteer wrapper. Centralizes browser launch + page setup so test cases
// stay focused on the *what*, not the *how*.

const path = require('path');
const puppeteer = require(path.join(__dirname, '..', 'node_modules', 'puppeteer-core'));

// Try a few common chrome locations so this works on different boxes.
const CHROME_CANDIDATES = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

function findChrome() {
    const fs = require('fs');
    for (const p of CHROME_CANDIDATES) {
        try { if (fs.statSync(p)) return p; } catch (_) {}
    }
    throw new Error(`No Chrome found. Tried: ${CHROME_CANDIDATES.join(', ')}`);
}

async function launch() {
    const browser = await puppeteer.launch({
        executablePath: findChrome(),
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
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

// Waits for an `.exercise-card` to appear, which is our signal that React
// has finished hydrating + the workout view has rendered.
async function waitForApp(page, timeoutMs = 8000) {
    await page.waitForSelector('.exercise-card', { timeout: timeoutMs });
    // Give React one more tick so derived state (PR helpers, defaults) settles.
    await new Promise(r => setTimeout(r, 250));
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

module.exports = { launch, attachConsole, waitForApp, readCards };
