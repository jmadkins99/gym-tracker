// Where the app lives on disk: the root of this repo, one level above tests/.
//
// This module also used to find the sibling public-gym-app checkout (under
// either spelling, `public-gym-app` or `public_gym_app`) for the
// `*-public-app-*` cases. Those cases moved into public-gym-app's own tests/
// in Oct 2026, so this suite no longer reads anything outside this repo and
// runs with nothing checked out beside it.

const path = require('path');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

module.exports = { PERSONAL_APP_ROOT };
