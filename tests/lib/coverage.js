// File-level coverage recorder. run.sh preloads it into every case with
// `node -r`, and it writes down which repo files that case read, so the
// pre-push hook can run only the cases a push could actually affect
// (lib/select.js).
//
// It hooks `fs` rather than the test server because cases read the app two
// ways: the browser pulls pages and scripts through lib/server.js, and a good
// third of the cases also read source straight off disk (js/config.js above
// all) to parse it or eval it. Both go through `fs`, so one hook sees both.
//
// Nobody edits the map by hand. Every case rewrites its own entry each time it
// runs, so the map follows what the code really loads rather than what someone
// remembered to write down. A case that fails has its entry deleted by run.sh,
// which makes it "unknown" and therefore always selected until it passes again.
//
// Only files inside this repo and outside tests/ are recorded. Test code and
// fixtures are handled by fixed rules in lib/select.js; files in the sibling
// public-gym-app can never be changed by a push to this repo.

const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

const TESTS_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(TESTS_DIR, '..');
const COVERAGE_DIR = path.join(TESTS_DIR, '.coverage');

const seen = new Set();

function note(p) {
    try {
        if (p instanceof URL) p = fileURLToPath(p);
        if (typeof p !== 'string') return; // fds, Buffers: nothing to name
        const abs = path.resolve(p);
        const rel = path.relative(REPO_ROOT, abs);
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return;
        const posix = rel.split(path.sep).join('/');
        if (posix === 'tests' || posix.startsWith('tests/')) return;
        seen.add(posix);
    } catch (_) {
        // Recording must never be the reason a case fails.
    }
}

function wrap(obj, name) {
    const orig = obj[name];
    if (typeof orig !== 'function') return;
    obj[name] = function (p, ...rest) {
        note(p);
        return orig.call(this, p, ...rest);
    };
}

// Reads, plus the existence checks: case 82 asserts that certain files do NOT
// exist, and recording the probe means adding one of them selects that case.
['readFileSync', 'readFile', 'existsSync', 'statSync', 'stat', 'accessSync', 'access',
 'readdirSync', 'readdir', 'createReadStream'].forEach((n) => wrap(fs, n));
['readFile', 'stat', 'access', 'readdir'].forEach((n) => wrap(fs.promises, n));

process.on('exit', () => {
    const script = process.argv[1];
    if (!script) return;
    const name = path.basename(script, '.js');
    try {
        fs.mkdirSync(COVERAGE_DIR, { recursive: true });
        fs.writeFileSync(path.join(COVERAGE_DIR, name + '.json'),
            JSON.stringify({ case: name, files: [...seen].sort() }, null, 2) + '\n');
    } catch (_) {}
});
