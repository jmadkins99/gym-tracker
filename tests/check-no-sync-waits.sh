#!/usr/bin/env bash
# Ratchet for new test code. A line ADDED to tests/cases/*.js since the
# merge-base with origin/main must not be part of
#   - a synthetic DOM .click() inside a browser-context callback (the function
#     handed to page.evaluate, $eval, $$eval, evaluateHandle, waitForFunction
#     or evaluateOnNewDocument, whether written inline or named): it skips
#     hit-testing, so a tap an overlay blocks still passes; use tap() from
#     lib/browser.js, a real click, or ElementHandle.click() from Node, or
#   - a fixed sleep: a sleep(, setTimeout( or waitForTimeout( call (they race
#     and slow the suite; use waitFor() from lib/browser.js, which polls).
# Lines already on main are left alone, so existing cases stay as they are
# until a later ticket migrates them.
#
# Each changed case is parsed with Babel (tests/node_modules/@babel/standalone),
# so comments, strings and multi-line callbacks are read as code, not as text.
# A violation is reported only when the offending call overlaps an added line.
# Renamed cases are followed (-M) and CR at end of line is ignored, so renaming
# or re-line-ending an untouched case flags nothing. A git failure or a case
# that does not parse FAILS the check rather than passing it.
#
# To use setTimeout on purpose (simulating slow work the case then polls for),
# put `// allow-sync-wait: <reason>` on the call's line.
#
# Compares the working tree (uncommitted and untracked cases included).
# CACHE_BUST_BASE overrides the base ref, as in check-cache-bust.sh.
set -u
ROOT="$(git rev-parse --show-toplevel)" || exit 1
cd "$ROOT"
BASE_REF="${CACHE_BUST_BASE:-origin/main}"
if ! BASE="$(git merge-base HEAD "$BASE_REF" 2>/dev/null)"; then
    echo "no-sync-waits: no $BASE_REF to compare with (CI must fetch full history); FAIL"
    exit 1
fi
if [ ! -d tests/node_modules/@babel/standalone ]; then
    (cd tests && npm install --silent --no-audit --no-fund) >&2 ||
        { echo "no-sync-waits: could not install tests/node_modules; FAIL"; exit 1; }
fi
BASE="$BASE" node - <<'JS'
const { execFileSync } = require('child_process');
const fs = require('fs');
const B = require(process.cwd() + '/tests/node_modules/@babel/standalone');
const traverse = B.packages.traverse.default || B.packages.traverse;
const BASE = process.env.BASE;
const PATHSPEC = 'tests/cases/*.js';

function git(...args) {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });
}
function die(msg) { console.log('no-sync-waits: ' + msg + '; FAIL'); process.exit(1); }

// file -> Set of added line numbers (1-based).
const added = new Map();
try {
    const diff = git('diff', '-U0', '--no-color', '--no-ext-diff', '--no-textconv', '-M',
        '--ignore-cr-at-eol', BASE, '--', PATHSPEC);
    let file = null;
    for (const row of diff.split('\n')) {
        let m;
        if (row.startsWith('+++ ')) file = row === '+++ /dev/null' ? null : row.replace(/^\+\+\+ b\//, '');
        else if (file && (m = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/))) {
            const start = +m[1], n = m[2] === undefined ? 1 : +m[2];
            if (!added.has(file)) added.set(file, new Set());
            for (let i = 0; i < n; i++) added.get(file).add(start + i);
        }
    }
    // Brand-new case files git does not track yet: every line is an added line.
    for (const f of git('ls-files', '--others', '--exclude-standard', '--', PATHSPEC).split('\n').filter(Boolean)) {
        const n = fs.readFileSync(f, 'utf8').split('\n').length;
        added.set(f, new Set(Array.from({ length: n }, (_, i) => i + 1)));
    }
} catch (err) {
    die('git failed (' + String(err.message).split('\n')[0] + ')');
}

const BROWSER_CALLS = new Set(['evaluate', '$eval', '$$eval', 'evaluateHandle', 'waitForFunction', 'evaluateOnNewDocument']);
const SLEEPS = new Set(['sleep', 'setTimeout', 'waitForTimeout']);
const nameOf = (callee) => callee.type === 'Identifier' ? callee.name
    : (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') && !callee.computed &&
      callee.property.type === 'Identifier' ? callee.property.name : null;

// Findings [{ line, endLine, what }] for a source text.
function scan(src) {
    const ast = B.packages.parser.parse(src, {
        sourceType: 'script', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true,
    });
    const browserFns = new Set();
    const markFn = (p) => { if (p && p.node && /Function/.test(p.node.type)) browserFns.add(p.node); };
    traverse(ast, {
        CallExpression(path) {
            if (!BROWSER_CALLS.has(nameOf(path.node.callee))) return;
            for (const arg of path.get('arguments')) {
                if (arg.isIdentifier()) { // a named function: page.evaluate(measure, ...)
                    const b = path.scope.getBinding(arg.node.name);
                    if (!b) continue;
                    if (b.path.isFunctionDeclaration()) markFn(b.path);
                    else if (b.path.isVariableDeclarator()) markFn(b.path.get('init'));
                } else markFn(arg);
            }
        },
    });
    const allowed = new Set();
    for (const c of ast.comments || []) if (/allow-sync-wait:\s*\S/.test(c.value)) allowed.add(c.loc.start.line);
    const out = [];
    traverse(ast, {
        CallExpression(path) {
            const name = nameOf(path.node.callee);
            let what = null;
            if (SLEEPS.has(name)) what = 'fixed wait ' + name + '() (use waitFor)';
            else if (name === 'click' && path.node.arguments.length === 0 &&
                     path.findParent((p) => browserFns.has(p.node))) {
                what = 'DOM .click() inside a browser-context callback (use tap())';
            }
            if (!what) return;
            const { start, end } = path.node.loc;
            for (let l = start.line; l <= end.line; l++) if (allowed.has(l)) return;
            out.push({ line: start.line, endLine: end.line, what });
        },
    });
    return out;
}

let fail = false;
for (const [file, lines] of added) {
    if (!fs.existsSync(file)) continue;
    let found;
    try { found = scan(fs.readFileSync(file, 'utf8')); }
    catch (err) { console.log(`no-sync-waits: cannot parse ${file}: ${err.message}`); fail = true; continue; }
    for (const f of found) {
        let hit = false;
        for (let l = f.line; l <= f.endLine; l++) if (lines.has(l)) hit = true;
        if (hit) { console.log(`no-sync-waits: ${file}:${f.line}: ${f.what}`); fail = true; }
    }
}
if (!fail) console.log('no-sync-waits: OK (no added DOM .click() or fixed sleep in tests/cases)');
process.exit(fail ? 1 : 0);
JS
