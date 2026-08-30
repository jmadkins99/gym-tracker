// Driving the swipe deck.
//
// The workout screen is one card at a time, moved by pointer gestures, so
// almost every case needs the same handful of verbs: reveal a card, swipe it,
// log it, ask where the deck is. Those live here rather than being copied into
// each case, because unlike `clickNav` they are not three lines — a swipe is a
// pointer sequence whose step count and settle time both matter, and eleven
// private copies would drift.
//
// THE ACTIVE SLOT. Three cards are mounted at once so the neighbours can peek
// in during a drag. `document.querySelector('.card-name')` therefore finds the
// PREVIOUS card once you have moved off the first one. Everything here scopes
// to `.deck-slot:not([aria-hidden="true"])`, and cases should use ACTIVE rather
// than reaching for a bare card selector.

const ACTIVE = '.deck-slot:not([aria-hidden="true"])';

// The suite serves each app from the server root, so the path matches neither
// /gym-tracker/ nor /public-gym-app/ and APP_NAMESPACE falls through to
// `gym-local:`. Cases 36 and 38 pin that on purpose — it is what keeps the
// tests off the real data and off Firebase.
const { DEFAULT_NS } = require('./state');

// Long enough for the rail transition (300ms) plus a render. Swipes commit the
// index immediately, so this is about the animation settling visually, not
// about the deck being ready.
const SETTLE = 520;

// A pointer drag across the card stage. `steps` and `stepDelay` control speed,
// which matters: the deck commits on distance OR velocity, so a fast short
// flick and a slow short drag are meant to behave differently.
async function swipe(page, dx, dy, { steps = 6, stepDelay = 0, settle = SETTLE, release = true } = {}) {
    const from = await page.evaluate(() => {
        const r = document.querySelector('.deck-stage').getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
        await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
        if (stepDelay) await new Promise((r) => setTimeout(r, stepDelay));
    }
    if (release) {
        await page.mouse.up();
        await new Promise((r) => setTimeout(r, settle));
    }
    return from;
}

// A drag that starts on a specific element rather than the middle of the stage
// — used to prove a swipe still works when it begins on the weight box, the
// reps dropdown or LOG.
async function swipeFrom(page, selector, dx, dy, { steps = 8, settle = SETTLE } = {}) {
    const from = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, selector);
    if (!from) throw new Error('swipeFrom: no element for ' + selector);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
        await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
    }
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, settle));
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

// Tap LOG on the open card. The deck jumps to the earliest unlogged card
// afterwards, so the caller is somewhere new when this resolves.
async function logCard(page, { settle = 750 } = {}) {
    const clicked = await page.evaluate((sel) => {
        const btn = document.querySelector(sel + ' .log-btn');
        if (!btn || btn.disabled) return false;
        btn.click();
        return true;
    }, ACTIVE);
    await new Promise((r) => setTimeout(r, settle));
    return clicked;
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

// Step one card at a time with the footer arrows. Deliberately NOT a swipe:
// arrows are the one navigation that never skips, so a case can position
// itself without depending on gesture behaviour it might be testing.
async function stepTo(page, target, { max = 40 } = {}) {
    for (let guard = 0; guard < max; guard++) {
        const at = await deckIndex(page);
        if (at === target) return true;
        const forward = at === null ? false : at < target;
        await page.evaluate((f) => {
            const arrows = document.querySelectorAll('.deck-arrow');
            (f ? arrows[arrows.length - 1] : arrows[0]).click();
        }, forward);
        await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error('stepTo: could not reach card ' + target);
}

// Choose the day, then wait for the deck to rebuild around the new roster.
async function selectDeckDay(page, type) {
    await page.evaluate((t) => {
        const btn = document.querySelector('[data-day-type="' + t + '"]');
        if (btn) btn.click();
    }, type);
    await new Promise((r) => setTimeout(r, 400));
}

// Switch tabs from the bottom bar.
async function bottomNav(page, label) {
    await page.evaluate((l) => {
        const btn = Array.from(document.querySelectorAll('.bottom-nav-btn'))
            .find((b) => b.textContent.indexOf(l) !== -1);
        if (btn) btn.click();
    }, label);
    await new Promise((r) => setTimeout(r, 400));
}

// The start-time anchors the app is holding, keyed by exercise id. This is the
// half of the timing mechanism that lives outside the workout record.
const startAnchors = (page, ns = DEFAULT_NS) =>
    page.evaluate((n) => {
        const raw = localStorage.getItem(n + 'exerciseStartTimes');
        return raw ? JSON.parse(raw).times || {} : {};
    }, ns);

// Today's workout out of saved history, or null.
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


// Walk the whole deck and read each card's NAME. Cheap: the index commits
// synchronously on an arrow click, so this does not wait for the rail
// animation, only for the render.
//
// Names only, deliberately. Everything else on a card — the weight, the last
// session, the warmup breakdown — exists solely on the revealed face, and
// revealing all twelve would both cost seconds per call and stamp a timing
// anchor on every movement in the day. Use readDeckCard for one card's numbers.
async function readDeckNames(page) {
    await stepTo(page, 1);
    const total = parseInt(((await deckPosition(page)) || '0 of 0').split(' ')[2], 10);
    const names = [];
    for (let i = 1; i <= total; i++) {
        names.push(await activeName(page));
        if (i < total) {
            await page.evaluate(() => {
                const a = document.querySelectorAll('.deck-arrow');
                a[a.length - 1].click();
            });
            await new Promise((r) => setTimeout(r, 110));
        }
    }
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
    if ((await activeName(page)) === name) return true;
    await stepTo(page, 1);
    const total = parseInt(((await deckPosition(page)) || '0 of 0').split(' ')[2], 10);
    for (let i = 1; i <= total; i++) {
        if ((await activeName(page)) === name) return true;
        if (i < total) {
            await page.evaluate(() => {
                const a = document.querySelectorAll('.deck-arrow');
                a[a.length - 1].click();
            });
            await new Promise((r) => setTimeout(r, 230));
        }
    }
    throw new Error('goToCard: no card named ' + name + ' in this day');
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
    await stepTo(page, 1);
    const total = parseInt(((await deckPosition(page)) || '0 of 0').split(' ')[2], 10);
    for (let i = 1; i <= total; i++) {
        if ((await activeName(page)) === name) {
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
                        const sel2 = slot.querySelector('select[data-field="reps"]');
                        return sel2 ? sel2.value : '';
                    })(),
                };
            }, ACTIVE);
        }
        if (i < total) {
            await page.evaluate(() => {
                const a = document.querySelectorAll('.deck-arrow');
                a[a.length - 1].click();
            });
            await new Promise((r) => setTimeout(r, 230));
        }
    }
    throw new Error('readDeckCard: no card named ' + name + ' in this day');
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
    await new Promise((r) => setTimeout(r, 250));
    return page.evaluate((sel) =>
        Array.from(document.querySelectorAll(sel + ' .breakdown-row'))
            .map((r) => r.innerText.split(String.fromCharCode(10)).join(' | '))
            .join('  ~  '), ACTIVE);
}

// The same as goToCard, but keyed on the exercise id rather than the display
// name. Cases that log a whole day work in ids, because a display name can be
// renamed by the user and an id never is.
async function goToCardById(page, id) {
    const activeId = await page.evaluate((sel) => {
        const card = document.querySelector(sel + ' .card[data-exercise-id]');
        return card ? card.getAttribute('data-exercise-id') : null;
    }, ACTIVE);
    if (activeId === id) return true;
    await stepTo(page, 1);
    const total = parseInt(((await deckPosition(page)) || '0 of 0').split(' ')[2], 10);
    for (let i = 1; i <= total; i++) {
        const here = await page.evaluate((sel) => {
            const card = document.querySelector(sel + ' .card[data-exercise-id]');
            return card ? card.getAttribute('data-exercise-id') : null;
        }, ACTIVE);
        if (here === id) return true;
        if (i < total) {
            await page.evaluate(() => {
                const a = document.querySelectorAll('.deck-arrow');
                a[a.length - 1].click();
            });
            await new Promise((r) => setTimeout(r, 230));
        }
    }
    throw new Error('goToCardById: no card with id ' + id + ' in this day');
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
        await page.evaluate(() => {
            const a = document.querySelectorAll('.deck-arrow');
            a[a.length - 1].click();
        });
        await new Promise((r) => setTimeout(r, 150));
    }
    if (!(await onFinishCard(page))) throw new Error('submitDay: never reached the finish card');
    const clicked = await page.evaluate((sel) => {
        const btn = Array.from(document.querySelectorAll(sel + ' .save-btn'))
            .find((b) => /Submit Day/i.test(b.textContent));
        if (!btn) return false;
        btn.click();
        return true;
    }, ACTIVE);
    await new Promise((r) => setTimeout(r, 400));
    return clicked;
}

module.exports = {
    ACTIVE, SETTLE, DEFAULT_NS,
    swipe, swipeFrom, revealCard, isRevealed, logCard,
    activeName, deckPosition, deckIndex, onFinishCard,
    stepTo, selectDeckDay, bottomNav,
    startAnchors, todayWorkout, readDeckNames, readDeckCard, goToCard, goToCardAndLog, setWeightAndOpen, goToCardById, logCardById, submitDay,
};
