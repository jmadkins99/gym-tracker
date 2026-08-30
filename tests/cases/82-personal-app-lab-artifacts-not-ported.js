// What this test covers
// ----------------------
// That none of gym-lab's isolation machinery ever lands in the real app.
//
// The swipe deck was built in `gym-lab`, a scratch copy that is deliberately
// cut off from real data. Three things make it safe to break, and every one of
// them would be a disaster here:
//
//   1. `FIREBASE_CONFIG = null` — the lab runs local-only so it can never touch
//      the real Firestore project. Ported, it SILENTLY DISABLES CLOUD SYNC.
//      Nothing errors, nothing warns; the app simply stops syncing and the loss
//      only surfaces on a new device, with the phone still showing everything.
//
//   2. `APP_NAMESPACE = 'gym-lab:'` as a flat constant — the lab pins its
//      namespace so it cannot be got wrong by how the server is pointed.
//      Ported, the real app READS AN EMPTY STORE and every workout appears to
//      be gone.
//
//   3. The red favicon, the "Gym Lab" title and header — cosmetic, but they are
//      how a lab tab is told apart from the live one at a glance.
//
// This is a guard rather than a behaviour test, and it exists because the port
// was a large copy between two nearly identical trees. It is source-level and
// takes no browser, so it costs nothing to keep forever.
//
// It also pins the POSITIVE side: the namespace must still be derived from the
// path, because that derivation is what gives the suite its own `gym-local:`
// store and what keeps Firebase uninitialised during tests (cases 36 and 38).

const path = require('path');
const fs = require('fs');
const { eq, ok } = require('../lib/assert');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

(async () => {
    // === 1. Firebase must still be configured =========================
    const firebaseConfig = read('js', 'firebaseConfig.js');
    eq(/const FIREBASE_CONFIG\s*=\s*null/.test(firebaseConfig), false,
        'FIREBASE_CONFIG is null — this is the lab\'s local-only switch. In gym-tracker ' +
        'it silently disables cloud sync: nothing errors, the phone keeps working, and ' +
        'the loss only appears on a new device');
    ok(/apiKey\s*:/.test(firebaseConfig) && /projectId\s*:/.test(firebaseConfig),
        'the real Firebase config is present');

    // === 2. The namespace must still be derived from the path =========
    const utils = read('js', 'utils.js');
    eq(/const APP_NAMESPACE\s*=\s*['"]gym-lab:['"]/.test(utils), false,
        'APP_NAMESPACE is pinned to the lab\'s namespace — the real app would read an ' +
        'empty store and every workout would look gone');
    eq(/const APP_NAMESPACE\s*=\s*['"][a-z-]+:['"]\s*;/.test(utils), false,
        'APP_NAMESPACE is a flat constant of some kind. It has to stay path-derived: ' +
        'that is what gives the test suite its own gym-local: store and what keeps ' +
        'Firebase uninitialised during tests');
    ok(/gym-tracker:/.test(utils), 'the gym-tracker namespace is still recognised');
    ok(/gym-local:/.test(utils),
        'and the gym-local: fallback survives — cases 36 and 38 depend on it');

    // === 3. No lab branding =========================================
    const indexHtml = read('index.html');
    eq(/Gym Lab/.test(indexHtml), false, 'index.html still calls itself Gym Lab');
    eq(/gym-lab/.test(indexHtml), false, 'index.html references gym-lab');

    const app = read('js', 'components', 'App.jsx');
    eq(/Gym Lab/.test(app), false, 'App.jsx renders a Gym Lab header');

    // The lab pins its favicon red so a lab tab cannot be mistaken for the live
    // one; the real app retints daily from accentColor.
    eq(/%23e0483a/.test(indexHtml), false,
        'the lab\'s pinned red favicon came across — the real app tints its mark from ' +
        'the day\'s accent');
    ok(/accentColor\.js/.test(indexHtml), 'and the rotating accent script is still loaded');

    // === 4. No lab file crept in ====================================
    for (const stray of ['gym-lab.md', 'LAB.md']) {
        eq(fs.existsSync(path.join(ROOT, stray)), false, `${stray} should not exist here`);
    }

    // === 5. The deck's own files ARE here ===========================
    // The other half of the same worry: a partial port that leaves the app
    // referencing a component that never arrived.
    for (const f of ['SwipeDeck.jsx', 'ExerciseCard.jsx']) {
        ok(fs.existsSync(path.join(ROOT, 'js', 'components', f)), `${f} was ported`);
        ok(indexHtml.indexOf(f) !== -1, `${f} is registered in index.html`);
    }
    eq(fs.existsSync(path.join(ROOT, 'js', 'components', 'WorkoutView.jsx')), false,
        'WorkoutView.jsx is gone — the deck replaced it, and leaving both would mean two ' +
        'workout screens with only the script order deciding which wins');
    eq(/WorkoutView\.jsx/.test(indexHtml), false,
        'and index.html no longer asks for it');

    // markDayAsNA was deleted deliberately: fully wired, no entry point.
    eq(/markDayAsNA/.test(app), false,
        'markDayAsNA is still in App.jsx — it was removed as unreachable dead code');

    console.log('PASS: no lab isolation artifacts reached gym-tracker, and the deck did.');
})();
