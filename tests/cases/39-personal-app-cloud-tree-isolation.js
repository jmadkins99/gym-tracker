// What this test covers
// ----------------------
// Cloud data isolation from the public app. The personal app's Firestore repo
// must root at `users/{uid}`, never at the public app's `publicUsers/{uid}` —
// the same Firebase project serves both, and if they ever share a root, a
// coach signing into the public app with the personal account would let the
// public wizard overwrite the personal app's cloud config (this collision was
// caught in review the day the public sync shipped; this test keeps it dead).
//
// Until Oct 2026 this case checked both apps from here. The public-app tests
// then moved into public-gym-app, so each repo now pins its own root: this one
// here, the public app's in public-gym-app's case 39.
//
// The deeper guarantees (per-uid scoping, email allowlists) are enforced by
// Firestore security rules on Google's servers and are intentionally outside
// this suite (no Firebase creds here); the Firestore emulator is the tool if
// rules-level tests are ever wanted. This case pins the one collision class
// that lives in OUR code: the collection roots.
//
// Static source check on purpose — the Firestore paths are unreachable in
// tests (no creds), so asserting the source is the strongest check available.

const fs = require('fs');
const path = require('path');
const { ok } = require('../lib/assert');

const personalRepo = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'js', 'storageRepo.js'), 'utf8');

ok(personalRepo.includes(".collection('users')"),
    "personal storageRepo.js roots its cloud data at collection('users')");
ok(!personalRepo.includes('publicUsers'),
    'personal storageRepo.js must never reference the publicUsers tree');

console.log('PASS: the personal app keeps its cloud data under users, never publicUsers.');
