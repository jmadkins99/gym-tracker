// Where the two apps live on disk.
//
// The public app's directory name is not stable across machines: the GitHub
// repo is `public-gym-app`, so a plain `git clone` produces hyphens, but the
// tests were originally written against a local checkout named
// `public_gym_app` with underscores. Hardcoding either spelling breaks the
// suite on the other, and the failure is confusing — 16 cases die on a missing
// directory before asserting anything about the app.
//
// So resolve whichever actually exists, and fail with a message that names both
// candidates rather than a bare ENOENT.

const fs = require('fs');
const path = require('path');

// tests/lib -> tests -> gym-tracker -> programming
const PARENT = path.resolve(__dirname, '..', '..', '..');

const PERSONAL_APP_ROOT = path.resolve(__dirname, '..', '..');

const PUBLIC_APP_CANDIDATES = ['public-gym-app', 'public_gym_app']
    .map(name => path.join(PARENT, name));

function resolvePublicApp() {
    for (const dir of PUBLIC_APP_CANDIDATES) {
        // Check for index.html, not just the directory: an empty leftover
        // folder should not win over a real checkout beside it.
        if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
    }
    throw new Error(
        'Could not find the public app. Looked for index.html in:\n' +
        PUBLIC_APP_CANDIDATES.map(d => '  ' + d).join('\n') +
        '\nClone it next to this repo: git clone git@github.com:jmadkins99/public-gym-app.git'
    );
}

module.exports = {
    PERSONAL_APP_ROOT,
    PUBLIC_APP_CANDIDATES,
    // Getter, not a value: the throw should happen when a test actually needs
    // the public app, not at require() time in a personal-app-only run.
    get PUBLIC_APP_ROOT() { return resolvePublicApp(); },
};
