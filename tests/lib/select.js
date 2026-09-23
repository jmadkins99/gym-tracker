// Decides which cases a push has to run, from the list of files it changes.
//
//   git diff --name-only --no-renames A..B | node lib/select.js
//
// Prints either `ALL <reason>` on the first line, or the names of the cases to
// run, one per line (possibly none). The pre-push hook acts on that.
//
// The map it reads, tests/.coverage/, is written by lib/coverage.js during
// test runs and never by hand. Every rule below errs the same way: when the map
// cannot vouch for a change, run everything. A wrong answer here can only make
// a push slow, never let an untested change through.

const fs = require('fs');
const path = require('path');

const TESTS_DIR = path.resolve(__dirname, '..');
const CASES_DIR = path.join(TESTS_DIR, 'cases');
const COVERAGE_DIR = path.join(TESTS_DIR, '.coverage');

// No expiry. Time does not make the map stale; only a change to what a case
// reads can, and such a change has to either edit a file that case already
// reads (a new <script> tag is an edit to index.html) or add a file no case
// reads. The first selects the case, which reruns and rewrites its own entry;
// the second runs everything. So the map repairs itself on the very push that
// could have staled it -- provided the hook sees every commit, which is what
// the base commit in .coverage/_base is for (see .githooks/pre-push).

// Files no case can load, so changing them alone needs no tests. Kept to
// things that are provably inert; anything else unknown runs the full suite.
const INERT = [/\.md$/i, /^\.gitignore$/];

function all(reason) {
    process.stdout.write('ALL ' + reason + '\n');
    process.exit(0);
}

const changed = fs.readFileSync(0, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

const cases = fs.readdirSync(CASES_DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
const coverage = new Map();
for (const name of cases) {
    try {
        const entry = JSON.parse(fs.readFileSync(path.join(COVERAGE_DIR, name + '.json'), 'utf8'));
        coverage.set(name, new Set(entry.files));
    } catch (_) {
        // No entry: new, renamed, or failed last time. Unknown, so it runs.
    }
}

const selected = new Set(cases.filter((name) => !coverage.has(name)));

for (const file of changed) {
    const caseFile = /^tests\/cases\/([^/]+)\.js$/.exec(file);
    if (caseFile) {
        if (cases.includes(caseFile[1])) selected.add(caseFile[1]);
        continue; // a deleted case needs nothing run
    }
    if (file.startsWith('tests/')) {
        // tests/README.md is prose: no case or helper loads it, and it
        // changed in more than half the pushes that would otherwise have
        // forced a full run over the last 80 commits.
        if (/\.md$/i.test(file)) continue;
        all('test infrastructure changed (' + file + ')');
    }
    // Readers first, so a recorded read beats the inert list: case 82 probes
    // that LAB.md does not exist, and adding one must still select it.
    const readers = cases.filter((name) => coverage.get(name)?.has(file));
    if (readers.length === 0) {
        if (INERT.some((re) => re.test(file))) continue;
        all('no case is known to read ' + file);
    }
    readers.forEach((name) => selected.add(name));
}

process.stdout.write([...selected].sort().map((n) => n + '\n').join(''));
