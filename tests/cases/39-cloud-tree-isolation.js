// What this test covers
// ----------------------
// Cloud data isolation between the two apps. The personal app's Firestore
// repo must root at `users/{uid}` and the public app's at `publicUsers/{uid}`
// — the same Firebase project serves both, and if they ever share a root, a
// coach signing into the public app with the personal account would let the
// public wizard overwrite the personal app's cloud config (this collision was
// caught in review the day the public sync shipped; this test keeps it dead).
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
const { publicAppSource } = require('../lib/paths');

const personalRepo = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'js', 'storageRepo.js'), 'utf8');
const publicApp = publicAppSource();

// Personal app: users/ root, and never the public tree.
ok(personalRepo.includes(".collection('users')"),
    "personal storageRepo.js roots its cloud data at collection('users')");
ok(!personalRepo.includes('publicUsers'),
    'personal storageRepo.js must never reference the publicUsers tree');

// Public app: publicUsers/ root, and never the personal tree.
ok(publicApp.includes(".collection('publicUsers')"),
    "the public app roots its cloud data at collection('publicUsers')");
ok(!publicApp.includes(".collection('users')"),
    "the public app must never reference the personal collection('users') tree");

console.log('PASS: personal and public apps use disjoint Firestore collection roots.');
