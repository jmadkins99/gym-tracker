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

// The public app's full source, index.html plus every module under js/,
// concatenated.
//
// Several cases assert against the app's SOURCE rather than its behaviour —
// the Firestore collection roots (case 39) and the current Jessi split
// revision (41, 56) are both unreachable at runtime in a test. Those cases
// used to read index.html, which worked while the app was a single 7.7k-line
// file. The Aug 2026 split moved that code into js/*.js and js/components/*.jsx
// and broke all three at once, and the failure mode was worse than a break:
// case 39's negative assertions ("must never reference the personal tree")
// pass vacuously against a file the code has left.
//
// So read the whole tree, not one file. A constant moving between modules is
// then invisible to these checks, which is the right sensitivity — they care
// that the app says something, not which file says it.
function publicAppSource() {
    const root = resolvePublicApp();
    const out = [fs.readFileSync(path.join(root, 'index.html'), 'utf8')];
    const walk = (dir) => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/[.]jsx?$/.test(entry.name)) out.push(fs.readFileSync(full, 'utf8'));
        }
    };
    walk(path.join(root, 'js'));
    return out.join('\n');
}

module.exports = {
    PERSONAL_APP_ROOT,
    PUBLIC_APP_CANDIDATES,
    publicAppSource,
    // Getter, not a value: the throw should happen when a test actually needs
    // the public app, not at require() time in a personal-app-only run.
    get PUBLIC_APP_ROOT() { return resolvePublicApp(); },
};
