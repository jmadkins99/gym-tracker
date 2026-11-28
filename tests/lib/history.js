// Driving the History deck.
//
// History is a swipe deck of History cards, one per calendar date, from the
// date of the first session ever logged through today. Like the Workout deck
// it mounts three cards at once, so a bare `.history-item` selector also finds
// the neighbours: scope to HISTORY_CARD (the card in the active slot).
//
// The footer's date label carries the shown card's date as
// `data-history-shown="YYYY-MM-DD"`, which is what every helper here waits on.

const { ACTIVE, waitForDeckToSettle } = require('./deck');
const { tap, waitFor } = require('./browser');

const HISTORY_CARD = ACTIVE + ' .history-card';
// The session on the shown card, if the date has one.
const HISTORY_SESSION = HISTORY_CARD + ' .history-item';
// The session's Edit button: a gear, so it has an aria-label rather than text.
const HISTORY_EDIT = HISTORY_SESSION + ' [aria-label="Edit workout"]';

// The footer's buttons: 'prev' / 'next' move one day, 'back' / 'forward' are
// the 7-day jumps. The two jumps share a class, so their text tells them apart.
const FOOT = {
    prev: { sel: '.history-foot [aria-label="Previous day"]' },
    next: { sel: '.history-foot [aria-label="Next day"]' },
    back: { sel: '.history-foot .history-jump', text: '← Week' },
    forward: { sel: '.history-foot .history-jump', text: 'Week →' },
};

function footButton(which) {
    const b = FOOT[which];
    if (!b) throw new Error('history: unknown footer button ' + which);
    return b;
}

// A Date, ISO string or YYYY-MM-DD as the local YYYY-MM-DD key the deck uses.
// Run in Node, so it relies on the harness's pinned time zone matching the
// page's (America/Phoenix, see browser.js).
function dateKey(d) {
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const x = new Date(d);
    const pad = (n) => String(n).padStart(2, '0');
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
}

// Calendar dates from key `from` to key `to`: positive when `to` is later.
function daysFromTo(from, to) {
    const ms = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((ms(to) - ms(from)) / 86400000);
}

// The YYYY-MM-DD of the card on screen, or null if History is not showing.
const shownDate = (page) => page.evaluate(() => {
    const el = document.querySelector('[data-history-shown]');
    return el ? el.getAttribute('data-history-shown') : null;
});

// Is that footer button ('prev', 'next', 'back' or 'forward') missing or disabled?
const footDisabled = (page, which) => page.evaluate(({ sel, text }) => {
    const el = Array.from(document.querySelectorAll(sel))
        .find((x) => !text || x.textContent.indexOf(text) !== -1);
    return !el || el.disabled;
}, footButton(which));

async function waitForShown(page, label, key) {
    await waitFor(page, label, (k, sel) => {
        const el = document.querySelector('[data-history-shown]');
        const card = document.querySelector(sel);
        return !!el && el.getAttribute('data-history-shown') === k
            && !!card && card.getAttribute('data-history-date') === k;
    }, key, HISTORY_CARD);
    // The index commits at once and the rail then slides for RAIL_MS; a tap
    // during the slide can miss its button, so hand back a still deck.
    await waitForDeckToSettle(page);
}

// Taps one of the footer buttons and waits for the shown date to change.
async function historyPress(page, which) {
    const { sel, text } = footButton(which);
    const before = await shownDate(page);
    await tap(page, sel, text ? { text: new RegExp(text) } : undefined);
    await waitFor(page, 'History to move off ' + before, (b) => {
        const el = document.querySelector('[data-history-shown]');
        return !!el && el.getAttribute('data-history-shown') !== b;
    }, before);
}

// Moves the deck to `date` (Date, ISO string or YYYY-MM-DD) with 7-day jumps
// and then single days, and waits for the deck to come to rest. Throws if the
// date is outside the deck.
async function historyGoTo(page, date) {
    const target = dateKey(date);
    for (let guard = 0; guard < 400; guard++) {
        const now = await shownDate(page);
        if (!now) throw new Error('historyGoTo: History is not on screen');
        const diff = daysFromTo(now, target);
        if (diff === 0) { await waitForShown(page, 'History card ' + target, target); return; }
        const which = diff <= -7 ? 'back' : diff >= 7 ? 'forward' : diff < 0 ? 'prev' : 'next';
        if (await footDisabled(page, which)) {
            throw new Error('historyGoTo: ' + target + ' is outside the deck (stuck at ' + now + ')');
        }
        await historyPress(page, which);
    }
    throw new Error('historyGoTo: gave up reaching ' + target);
}

module.exports = { HISTORY_CARD, HISTORY_SESSION, HISTORY_EDIT, dateKey, shownDate, footDisabled, historyPress, historyGoTo };
