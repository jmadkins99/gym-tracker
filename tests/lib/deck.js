// Driving the swipe deck.
//
// The workout screen is one card at a time, moved by pointer gestures, so
// almost every case needs the same handful of verbs: reveal a card, swipe it,
// log it, ask where the deck is. Those live here rather than being copied into
// each case, because they are not three lines — a swipe is a pointer
// sequence whose step count and timing both matter, and eleven private copies
// would drift.
//
// THE ACTIVE SLOT. Three cards are mounted at once so the neighbours can peek
// in during a drag. `document.querySelector('.card-name')` therefore finds the
// PREVIOUS card once you have moved off the first one. Everything here scopes
// to `.deck-slot:not([aria-hidden="true"])`, and cases should use ACTIVE rather
// than reaching for a bare card selector.

const ACTIVE = '.deck-slot:not([aria-hidden="true"])';

// The suite serves the app from the server root, so the path does not match
// /gym-tracker/ and APP_NAMESPACE falls through to
// `gym-local:`. Case 36 pins that on purpose — it is what keeps the
// tests off the real data and off Firebase.
const { DEFAULT_NS } = require('./state');
const { selectDayType, tap, waitFor } = require('./browser');

// A pointer drag across the card stage, sent as raw CDP mouse events that
// carry their own timestamps. The deck reads a gesture's speed from the event
// `timeStamp`s (e.timeStamp in SwipeDeck), and the commit rule is distance OR
// velocity, so a short flick and a slow short drag are meant to behave
// differently. With real timing that speed was whatever the machine managed: on
// a busy runner the round trip between two moves could stretch a 3-step flick
// past FLICK_SPEED (0.45 px/ms) and read it as slow (case 73's known flake).
// Stamping each move `stepDelay` ms after the last makes the speed exactly
// dx / steps / stepDelay, whatever the load, and costs no real waiting.
//
// After the release the swipe waits for the deck to come to rest, unless
// `settle: false` (a case that acts inside the rail's 300 ms, or opens a form).
// `release: false` holds the drag; the returned `release()` lets go.
const STEP_MS = 8;
const gestureClock = new WeakMap(); // page -> last stamp sent, so stamps never run backwards

async function pointer(page) {
    let state = gestureClock.get(page);
    if (!state) {
        state = { cdp: await page.createCDPSession(), last: 0 };
        gestureClock.set(page, state);
    }
    return state;
}

async function drag(page, from, dx, dy, { steps, stepDelay, settle, release }) {
    if (typeof settle !== 'boolean') {
        throw new Error('swipe: settle is true (wait for the deck to rest) or false, not ' + settle);
    }
    const state = await pointer(page);
    let t = Math.max(Date.now(), state.last + 1);
    // The positioning move before the press sends `button: 'none'`: Chromium ORs
    // a left-button-down modifier in from `button`, so a move that named 'left'
    // could arrive as the start of a drag even with `buttons: 0`.
    const send = (type, x, y, buttons, button = 'left') => {
        state.last = t;
        return state.cdp.send('Input.dispatchMouseEvent', {
            type, x, y, button, buttons, timestamp: t / 1000,
            ...(type === 'mouseMoved' ? {} : { clickCount: 1 }),
        });
    };
    await send('mouseMoved', from.x, from.y, 0, 'none');
    await send('mousePressed', from.x, from.y, 1);
    let at = from;
    for (let i = 1; i <= steps; i++) {
        t += stepDelay;
        at = { x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps };
        await send('mouseMoved', at.x, at.y, 1);
    }
    const letGo = async () => {
        t = Math.max(t + 1, state.last + 1);
        await send('mouseReleased', at.x, at.y, 0);
        if (settle) await waitForDeckToSettle(page);
    };
    if (release) await letGo();
    return { ...from, release: letGo };
}

async function swipe(page, dx, dy, { steps = 6, stepDelay = STEP_MS, settle = true, release = true } = {}) {
    const from = await page.evaluate(() => {
        const r = document.querySelector('.deck-stage').getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    return drag(page, from, dx, dy, { steps, stepDelay, settle, release });
}

// A drag that starts on a specific element rather than the middle of the stage
// — used to prove a swipe still works when it begins on the weight box, the
// reps dropdown or LOG.
async function swipeFrom(page, selector, dx, dy, { steps = 8, stepDelay = STEP_MS, settle = true } = {}) {
    const from = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, selector);
    if (!from) throw new Error('swipeFrom: no element for ' + selector);
    await drag(page, from, dx, dy, { steps, stepDelay, settle, release: true });
}

// Swipe up to open the card. This is the gesture the whole screen exists for:
// it calls openWeightBreakdown, which is what stamps `startedAt`. A card that
// is already open (any logged card is) is left alone, because re-revealing is
// deliberately a no-op that must not restart the clock.
async function revealCard(page) {
    if (await isRevealed(page)) return false;
    await swipe(page, 0, -180, { steps: 6 });
    return true;
}

const isRevealed = (page) =>
    page.evaluate((sel) => !!document.querySelector(sel + ' .card-open'), ACTIVE);

// Every `loggedAt` saved for one exercise, as one sorted string, across all
// saved workout histories. It reads every localStorage key ending in
// `gymWorkoutHistory` rather than one namespace, so it works for a case that
// runs under another namespace or mirrors the history to the cloud. A fresh ISO
// stamp is written on every successful log (logExercise in App.jsx), so a change
// here is proof of a save. It runs in the page: with `was` undefined it hands
// back the stamps, and given the stamps read before a tap it says whether they
// have changed, so logCard reads and polls with the same code.
function loggedStamps(exerciseId, was) {
    const stamps = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key.endsWith('gymWorkoutHistory')) continue;
        let hist;
        try { hist = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { continue; }
        for (const w of hist || []) {
            for (const e of (w && w.exercises) || []) {
                if (e && e.id === exerciseId && e.loggedAt) stamps.push(e.loggedAt);
            }
        }
    }
    const now = stamps.sort().join('|');
    return was === undefined ? now : now !== was;
}

const activeExerciseId = (page) =>
    page.evaluate((sel) => {
        const card = document.querySelector(sel + ' .card[data-exercise-id]');
        return card ? card.getAttribute('data-exercise-id') : null;
    }, ACTIVE);

// Tap LOG on the open card. The deck jumps to the earliest unlogged card
// afterwards, so the caller is somewhere new when this resolves. A tap does not
// hit-test, so one that an overlay covers lands on the overlay and does
// nothing; this therefore waits until the card's saved `loggedAt` changes, and
// throws if it never does. The log commits and saves in the click's own render,
// so that wait is short. PR logs hold on the logged review for their
// celebration (2 s) afterwards; by default this then waits for that
// auto-advance and for the deck to come to rest. Pass `waitForAutoAdvance:
// false` to inspect the logged card or the celebration itself. A LOG button
// that is missing or disabled returns false.
//
// Pass `expectRejected: true` for a press the app is meant to refuse (blank or
// invalid reps on an enabled button). The log is decided synchronously in the
// click, so one read of the stamps right after the tap is the whole condition
// and there is nothing to wait for. It returns false, and throws if the set
// was saved anyway. A refused tap changes nothing, so it also leaves no
// evidence that the tap landed; a caller that needs that proof asserts the
// card's own state, as case 149 does with the logged chip.
async function logCard(page, opts = {}) {
    if ('settle' in opts) throw new Error('logCard: settle is gone; pass waitForAutoAdvance: false instead');
    const { waitForAutoAdvance = true, expectRejected = false } = opts;
    const ready = await page.evaluate((sel) => {
        const btn = document.querySelector(sel + ' .log-btn');
        return !!btn && !btn.disabled;
    }, ACTIVE);
    if (!ready) return false;
    const id = await activeExerciseId(page);
    const before = await page.evaluate(loggedStamps, id);
    await tap(page, ACTIVE + ' .log-btn');
    if (expectRejected) {
        if (await page.evaluate(loggedStamps, id, before)) {
            throw new Error('logCard: ' + id + ' was saved, but the LOG press was expected to be rejected');
        }
        return false;
    }
    await waitFor(page, 'the LOG tap to save ' + id + ' (its loggedAt to change)',
        loggedStamps, id, before);
    if (waitForAutoAdvance) {
        await waitFor(page, 'the PR celebration to end', (sel) =>
            !document.querySelector(sel + ' .card.pr-celebrating'), ACTIVE);
        // The deck jumps to another unlogged card, or to the finish card when
        // none is left, so the active card must no longer be the logged one.
        await waitFor(page, 'the deck to move on from ' + id, (sel, loggedId) => {
            if (document.querySelector(sel + ' .card-finish')) return true;
            const card = document.querySelector(sel + ' .card[data-exercise-id]');
            return !!card && card.getAttribute('data-exercise-id') !== loggedId;
        }, ACTIVE, id);
        await waitForDeckToSettle(page);
    }
    return true;
}

// The name on the active card, from whichever face is showing.
const activeName = (page) =>
    page.evaluate((sel) => {
        const slot = document.querySelector(sel);
        if (!slot) return null;
        const el = slot.querySelector('.card-open-name') || slot.querySelector('.card-name');
        return el ? el.textContent.trim() : null;
    }, ACTIVE);

// "3 of 12", or "finish" on the last slot.
const deckPosition = (page) =>
    page.evaluate(() => {
        const el = document.querySelector('.deck-count');
        return el ? el.textContent.trim() : null;
    });

// The 1-based card number, or null on the finish card.
const deckIndex = async (page) => {
    const m = /^(\d+)/.exec((await deckPosition(page)) || '');
    return m ? parseInt(m[1], 10) : null;
};

const onFinishCard = (page) =>
    page.evaluate((sel) => !!document.querySelector(sel + ' .card-finish'), ACTIVE);

// One tap on a footer arrow, then a wait for the counter to change. The index
// commits in the tap's own render, so this does not wait for the rail
// animation; callers that go on to gesture or read styles wait for
// waitForDeckToSettle themselves.
//
// A focused weight or reps box puts `kb-open` on the page, which hides the
// footer (the arrows) to make room for the keyboard. A person closes the
// keyboard before reaching for an arrow, and the page sees that as a blur, so
// this blurs the field and waits for the footer to come back first.
async function stepOnce(page, forward) {
    await page.evaluate(() => {
        const el = document.activeElement;
        if (el && el.matches('input, textarea')) el.blur();
    });
    await waitFor(page, 'the keyboard layout to close so the deck arrows show',
        () => !document.documentElement.classList.contains('kb-open'));
    const before = await deckPosition(page);
    await tap(page, '.deck-arrow[aria-label="' + (forward ? 'Next' : 'Previous') + ' exercise"]');
    await waitFor(page, 'the deck to step ' + (forward ? 'forward' : 'back') + ' from "' + before + '"', (b) => {
        const el = document.querySelector('.deck-count');
        return !!el && el.textContent.trim() !== b;
    }, before);
}

// Step one card at a time with the footer arrows. Arriving waits for the rail
// to stop: the next step is usually a tap or a swipe on that card, and a real
// tap on a card still sliding in can land beside its target. Deliberately NOT a swipe:
// arrows are the one navigation that never skips, so a case can position
// itself without depending on gesture behaviour it might be testing.
async function stepTo(page, target, { max = 40 } = {}) {
    for (let guard = 0; guard < max; guard++) {
        const at = await deckIndex(page);
        if (at === target) {
            await waitForDeckToSettle(page);
            return true;
        }
        await stepOnce(page, at === null ? false : at < target);
    }
    throw new Error('stepTo: could not reach card ' + target);
}

// Choose the day, then wait for the deck to come to rest on the new roster.
// The toggle moved from the deck into Settings in Nov 2026; this is
// selectDayType plus that wait. The deck's reset to card one runs in the pill
// tap's own commit (a discrete event flushes its effects synchronously), so by
// the time Settings has closed only the deck's motion can be left.
async function selectDeckDay(page, type) {
    await selectDayType(page, type);
    await waitFor(page, 'the deck to be on screen', () => !!document.querySelector('.deck-stage'));
    await waitForDeckToSettle(page);
}

// Wait for the deck to come to rest: the rail back at its resting position and
// the active card back on it. A swipe or an arrow commits the index at once and
// then animates (RAIL_MS in SwipeDeck), so this is for a case that next reads
// the deck or starts another gesture from a still deck. A computed transform
// reports the in-flight value, so an identity transform means the motion is over.
const waitForDeckToSettle = (page) =>
    waitFor(page, 'the deck to come to rest', (sel) => {
        const still = (el) => !!el &&
            ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(getComputedStyle(el).transform);
        return still(document.querySelector('.deck-rail')) && still(document.querySelector(sel));
    }, ACTIVE);

// Switch tabs from the bottom bar: a real tap, then a wait for the button to
// turn active, which happens in the same render as the destination view (the
// views do not animate in). Each button once carried an icon glyph beside its
// label, so this matches on containment.
async function bottomNav(page, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await tap(page, '.bottom-nav-btn', { text: new RegExp(escaped) });
    await waitFor(page, 'the ' + label + ' tab to open', (l) =>
        Array.from(document.querySelectorAll('.bottom-nav-btn.active'))
            .some((b) => b.textContent.indexOf(l) !== -1), label);
}

// The start-time anchors the app is holding, keyed by exercise id. This is the
// half of the timing mechanism that lives outside the workout record.
const startAnchors = (page, ns = DEFAULT_NS) =>
    page.evaluate((n) => {
        const raw = localStorage.getItem(n + 'exerciseStartTimes');
        return raw ? JSON.parse(raw).times || {} : {};
    }, ns);

// Today's workout out of saved history, or null.
// Real page-clock instants of each pointer press and release, so a case can
// prove its back-to-back swipes really fell inside the app's 300 ms rail window
// rather than trusting the run to be fast. The drag's event timestamps are
// synthetic; Date.now() is the clock the app's own setTimeout runs on.
const RAIL_MS = 300; // SwipeDeck's rail transition, and the card-close delay
const recordGestures = (page) => page.evaluate(() => {
    window.__gestures = { down: [], up: [] };
    document.addEventListener('pointerdown', () => window.__gestures.down.push(Date.now()), true);
    document.addEventListener('pointerup', () => window.__gestures.up.push(Date.now()), true);
});
const gestures = (page) => page.evaluate(() => window.__gestures);
const resetGestures = (page) => page.evaluate(() => { window.__gestures.down = []; window.__gestures.up = []; });

const todayWorkout = (page, ns = DEFAULT_NS) =>
    page.evaluate((n) => {
        const hist = JSON.parse(localStorage.getItem(n + 'gymWorkoutHistory') || '[]');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return hist.find((w) => {
            const d = new Date(w.date);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === today.getTime();
        }) || null;
    }, ns);


// Walk the deck from card 1, calling `visit(i, total)` on each card (the index
// commits synchronously on an arrow click, so this waits for the render, not for
// the rail animation). It stops at the first card whose visit returns truthy and
// hands that value back; null means the walk ran off the end.
async function walkDeck(page, visit) {
    await stepTo(page, 1);
    const total = parseInt(((await deckPosition(page)) || '0 of 0').split(' ')[2], 10);
    for (let i = 1; i <= total; i++) {
        const found = await visit(i, total);
        if (found) return found;
        if (i < total) await stepOnce(page, true);
    }
    return null;
}

// Walk from card 1 to the first card satisfying `isIt` (a Node-side async
// predicate over the page), then wait for the rail to stop before handing back,
// for the reason stepTo gives. Throws `<caller>: no card <what> in this day`.
async function findCard(page, caller, what, isIt) {
    const found = await walkDeck(page, isIt);
    if (!found) throw new Error(caller + ': no card ' + what + ' in this day');
    await waitForDeckToSettle(page);
}

// Walk the whole deck and read each card's NAME.
//
// Names only, deliberately. Everything else on a card — the weight, the last
// session, the warmup breakdown — exists solely on the revealed face, and
// revealing all twelve would both cost seconds per call and stamp a timing
// anchor on every movement in the day. Use readDeckCard for one card's numbers.
async function readDeckNames(page) {
    const names = [];
    await walkDeck(page, async () => {
        names.push(await activeName(page));
        return false;
    });
    return names;
}

// Bring a named card to the front of the deck. Cases used to reach straight
// for `[data-exercise-id="..."]` because every card was on screen at once; the
// deck mounts three, so the card has to be navigated to first.
async function goToCard(page, name) {
    // Already here? Do nothing. Navigating away and back is NOT free: leaving a
    // card closes it, and reopening stamps a fresh start time — so a helper that
    // always walked from card 1 would silently restart the clock it was only
    // meant to look at.
    if ((await activeName(page)) === name) {
        await waitForDeckToSettle(page);
        return true;
    }
    await findCard(page, 'goToCard', 'named ' + name, async () => (await activeName(page)) === name);
    return true;
}

// Navigate to a named card, open it and log it — the deck's equivalent of
// finding a card in the old list and clicking its LOG button.
async function goToCardAndLog(page, name) {
    await goToCard(page, name);
    await revealCard(page);
    return logCard(page);
}

// Navigate to one named card, open it, and read the fields that only exist on
// the revealed face. This is the deck's answer to the old readCards(), which
// could see every card at once because they were all on screen.
async function readDeckCard(page, name, { reveal = true } = {}) {
    await findCard(page, 'readDeckCard', 'named ' + name, async () => (await activeName(page)) === name);
    if (reveal) await revealCard(page);
    return page.evaluate((sel) => {
        const slot = document.querySelector(sel);
        const input = slot.querySelector('input[type="number"], input[inputmode="decimal"]');
        const last = slot.querySelector('.card-last');
        const hero = slot.querySelector('.hero-weight');
        return {
            name: (slot.querySelector('.card-open-name') || slot.querySelector('.card-name'))
                .textContent.trim(),
            last: last ? last.textContent.trim() : '',
            weightValue: input ? input.value : '',
            weightPlaceholder: input ? input.placeholder : '',
            heroWeight: hero ? hero.textContent.replace(/[^0-9.]/g, '') : '',
            // Every weighted card carries a breakdown now; it is part of
            // the revealed face rather than behind its own button.
            hasWeightBreakdown: !!slot.querySelector('.breakdown'),
            breakdown: Array.from(slot.querySelectorAll('.breakdown-row'))
                .map((r) => r.innerText.split(String.fromCharCode(10)).join(' | ')),
            repsValue: (() => {
                const sel2 = slot.querySelector('[data-field="reps"]');
                return sel2 ? sel2.value : '';
            })(),
        };
    }, ACTIVE);
}

// Navigate to a card, open it, type a weight into it, and hand back the warmup
// rows that result. Several cases drive the breakdown from a chosen weight
// rather than from history, and on the deck all three steps are needed: the
// input does not exist until the card is revealed.
//
// The value is set through the native setter and an input event, because React
// ignores a plain `.value =` assignment — it tracks the previous value on the
// node and skips the change as a no-op.
async function setWeightAndOpen(page, name, weight) {
    await goToCard(page, name);
    await revealCard(page);
    const ok = await page.evaluate((sel, w) => {
        const input = document.querySelector(sel + ' input[type="number"]');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, w);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }, ACTIVE, String(weight));
    if (!ok) throw new Error('setWeightAndOpen: no weight input on ' + name);
    // No wait: React 18 commits an input event's state before dispatchEvent
    // returns, so the breakdown below already reflects the new weight.
    return page.evaluate((sel) =>
        Array.from(document.querySelectorAll(sel + ' .breakdown-row'))
            .map((r) => r.innerText.split(String.fromCharCode(10)).join(' | '))
            .join('  ~  '), ACTIVE);
}

// The same as goToCard, but keyed on the exercise id rather than the display
// name. Cases that log a whole day work in ids, because a display name can be
// renamed by the user and an id never is.
async function goToCardById(page, id) {
    if ((await activeExerciseId(page)) === id) {
        await waitForDeckToSettle(page);
        return true;
    }
    await findCard(page, 'goToCardById', 'with id ' + id, async () => (await activeExerciseId(page)) === id);
    return true;
}

// Navigate to a card by id, open it, and log it.
async function logCardById(page, id) {
    await goToCardById(page, id);
    await revealCard(page);
    return logCard(page);
}

// Submit the day. The button is on the FINISH card — the slot after the last
// exercise — so it is not in the DOM until the deck is carried there. That is
// deliberate: reaching Submit Day is now a statement that nothing is left.
async function submitDay(page) {
    for (let guard = 0; guard < 30; guard++) {
        if (await onFinishCard(page)) break;
        await stepOnce(page, true);
    }
    if (!(await onFinishCard(page))) throw new Error('submitDay: never reached the finish card');
    await waitForDeckToSettle(page);
    const finish = await page.evaluate((sel) => ({
        ready: Array.from(document.querySelectorAll(sel + ' .save-btn'))
            .some((b) => /Submit Day/i.test(b.textContent)),
        empty: /Nothing logged/i.test((document.querySelector(sel + ' .finish-title') || {}).textContent || ''),
    }), ACTIVE);
    if (!finish.ready) return false;
    // The submit runs in the tap's own handler: it saves the day and opens the
    // Day Breakdown. With nothing logged it raises an alert instead. The
    // caller's own dialog handler answers that alert, so this only observes the
    // event (answering it twice throws); the listener is attached before the
    // tap because the alert fires inside it.
    let alerted = null;
    let stopListening = () => {};
    if (finish.empty) {
        alerted = new Promise((resolve) => {
            page.once('dialog', resolve);
            stopListening = () => page.off('dialog', resolve);
        });
    }
    await tap(page, ACTIVE + ' .save-btn', { text: /Submit Day/i });
    if (finish.empty) {
        let timer;
        const timedOut = new Promise((resolve) => { timer = setTimeout(() => resolve(null), 5000); });
        const dialog = await Promise.race([alerted, timedOut]);
        clearTimeout(timer);
        stopListening();
        if (!dialog) throw new Error('submitDay: no alert after tapping Submit Day with nothing logged');
    } else {
        // The Day Breakdown itself, not just any modal: an unrelated overlay
        // that swallowed the tap would otherwise satisfy the wait.
        await waitFor(page, 'the Day Breakdown to open after Submit Day', () =>
            Array.from(document.querySelectorAll('.modal .modal-title'))
                .some((t) => /Day Breakdown\s*$/.test(t.textContent)));
    }
    return true;
}

module.exports = {
    ACTIVE, DEFAULT_NS,
    swipe, swipeFrom, revealCard, isRevealed, logCard,
    recordGestures, gestures, resetGestures, RAIL_MS, activeExerciseId,
    activeName, deckPosition, deckIndex, onFinishCard,
    stepOnce, stepTo, selectDeckDay, bottomNav, waitForDeckToSettle,
    startAnchors, todayWorkout, readDeckNames, readDeckCard, goToCard, goToCardAndLog, setWeightAndOpen, goToCardById, logCardById, submitDay,
};
