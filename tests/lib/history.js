// Driving the History deck.
//
// History is a swipe deck of History cards, one per calendar date, from the
// date of the first session ever logged through today. Like the Workout deck
// it mounts three cards at once, so a bare `.history-item` selector also finds
// the neighbours: scope to HISTORY_CARD (the card in the active slot).
//
// The footer's date label carries the shown card's date as
// `data-history-shown="YYYY-MM-DD"`, which is what every helper here waits on.

const { ACTIVE } = require('./deck');
const { tap, waitFor } = require('./browser');

const HISTORY_CARD = ACTIVE + ' .history-card';
// The session on the shown card, if the date has one.
const HISTORY_SESSION = HISTORY_CARD + ' .history-item';

// A Date, ISO string or YYYY-MM-DD as the local YYYY-MM-DD key the deck uses.
// Run in Node, so it relies on the harness's pinned time zone matching the
// page's (America/Phoenix, see browser.js).
function dateKey(d) {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const x = new Date(d);
    const pad = (n) => String(n).padStart(2, '0');
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
}

function keyDiff(a, b) {
    const ms = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((ms(b) - ms(a)) / 86400000);
}

// The YYYY-MM-DD of the card on screen, or null if History is not showing.
const shownDate = (page) => page.evaluate(() => {
    const el = document.querySelector('[data-history-shown]');
    return el ? el.getAttribute('data-history-shown') : null;
});

async function waitForShown(page, label, key) {
    await waitFor(page, label, (k) => {
        const el = document.querySelector('[data-history-shown]');
        const card = document.querySelector('.deck-slot:not([aria-hidden="true"]) .history-card');
        return !!el && el.getAttribute('data-history-shown') === k
            && !!card && card.getAttribute('data-history-date') === k;
    }, key);
}

// Taps one of the footer buttons and waits for the shown date to change.
// `which`: 'prev' / 'next' (one day) or 'back' / 'forward' (the 7-day jump).
async function historyPress(page, which) {
    const before = await shownDate(page);
    if (which === 'prev') await tap(page, '.history-foot [aria-label="Previous day"]');
    else if (which === 'next') await tap(page, '.history-foot [aria-label="Next day"]');
    else if (which === 'back') await tap(page, '.history-foot .history-jump', { text: /← Week/ });
    else if (which === 'forward') await tap(page, '.history-foot .history-jump', { text: /Week →/ });
    else throw new Error('historyPress: unknown button ' + which);
    await waitFor(page, 'History to move off ' + before, (b) => {
        const el = document.querySelector('[data-history-shown]');
        return !!el && el.getAttribute('data-history-shown') !== b;
    }, before);
}

// Moves the deck to `date` (Date, ISO string or YYYY-MM-DD) with 7-day jumps
// and then single days. Throws if the date is outside the deck.
async function historyGoTo(page, date) {
    const target = dateKey(date);
    for (let guard = 0; guard < 400; guard++) {
        const now = await shownDate(page);
        if (!now) throw new Error('historyGoTo: History is not on screen');
        const diff = keyDiff(now, target);
        if (diff === 0) { await waitForShown(page, 'History card ' + target, target); return; }
        const which = diff <= -7 ? 'back' : diff >= 7 ? 'forward' : diff < 0 ? 'prev' : 'next';
        const disabled = await page.evaluate((w) => {
            const b = w === 'prev' ? document.querySelector('.history-foot [aria-label="Previous day"]')
                : w === 'next' ? document.querySelector('.history-foot [aria-label="Next day"]')
                : Array.from(document.querySelectorAll('.history-foot .history-jump'))
                    .find((x) => x.textContent.indexOf(w === 'back' ? '← Week' : 'Week →') !== -1);
            return !b || b.disabled;
        }, which);
        if (disabled) throw new Error('historyGoTo: ' + target + ' is outside the deck (stuck at ' + now + ')');
        await historyPress(page, which);
    }
    throw new Error('historyGoTo: gave up reaching ' + target);
}

module.exports = { HISTORY_CARD, HISTORY_SESSION, dateKey, shownDate, historyPress, historyGoTo };
