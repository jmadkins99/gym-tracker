#!/usr/bin/env bash
# Cache-bust guardrail. index.html and weight/index.html load local assets with
# ?v=N query strings. An asset whose content changed since the merge-base with
# origin/main must have a different ?v= in each HTML file that loads it,
# otherwise a browser with a stale cache runs new HTML against an old script
# (PR #34 added PRPill.jsx without a bump: a ReferenceError on stale caches).
# A newly added asset, or a newly added tag, counts as bumped. Also failing:
#   - a changed asset whose tag has no ?v= at all, and
#   - a local src/href that points at a file that does not exist (a dangling
#     reference after a rename or delete; it would 404 on the live site).
# The tags are parsed as HTML attributes (single or double quotes, ./ prefixes,
# ../ segments), not matched by one fixed spelling.
#
# Not covered on purpose: a stale branch that bumped to the same number main
# also bumped. The ruleset only merges a branch that is up to date with main,
# and CI reruns this check after the update.
#
# Compares the working tree (uncommitted edits included) with the merge-base.
# On main itself the merge-base is HEAD, so a clean tree passes, which is what
# the merge push to main needs. CACHE_BUST_BASE overrides the base ref.
set -u
ROOT="$(git rev-parse --show-toplevel)" || exit 1
cd "$ROOT"
BASE_REF="${CACHE_BUST_BASE:-origin/main}"
if ! BASE="$(git merge-base HEAD "$BASE_REF" 2>/dev/null)"; then
    echo "cache-bust: no $BASE_REF to compare with (CI must fetch full history); FAIL"
    exit 1
fi
BASE="$BASE" node - <<'JS'
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE;
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const gitOrNull = (...a) => { try { return git(...a); } catch (_) { return null; } };

// [{ asset: repo-relative path, v: string|null }] for every local src/href.
function refs(html, dir) {
    const out = [];
    for (const tag of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
        for (const m of tag[0].matchAll(/\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
            const url = (m[1] ?? m[2]).trim();
            if (!url || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) continue; // remote, data:, anchor
            const [pathPart, query = ''] = url.split('#')[0].split('?');
            const v = (query.match(/(?:^|&)v=(\d+)(?:&|$)/) || [])[1] || null;
            out.push({ asset: path.posix.normalize(path.posix.join(dir, pathPart)), v });
        }
    }
    return out;
}

let fail = false;
const say = (msg) => { console.log('cache-bust: ' + msg); fail = true; };
const short = git('rev-parse', '--short', BASE).trim();
for (const html of ['index.html', 'weight/index.html']) {
    const dir = path.posix.dirname(html);
    const old = gitOrNull('show', `${BASE}:${html}`);
    if (old === null) continue; // new page: all new
    const oldRefs = refs(old, dir);
    for (const { asset, v } of refs(fs.readFileSync(html, 'utf8'), dir)) {
        if (!fs.existsSync(asset)) { say(`${html} loads ${asset}, which does not exist (dangling reference)`); continue; }
        const oldBlob = gitOrNull('rev-parse', '-q', '--verify', `${BASE}:${asset}`);
        if (oldBlob === null) continue; // new asset
        if (git('hash-object', asset).trim() === oldBlob.trim()) continue; // unchanged
        const prev = oldRefs.find((r) => r.asset === asset);
        if (!prev) continue; // new tag: counts as bumped
        if (v === null) say(`${asset} changed since ${short} but ${html} loads it with no ?v=; add one`);
        else if (prev.v === v) say(`${asset} changed since ${short} but ${html} still says ?v=${v}; bump it`);
    }
}
if (!fail) console.log('cache-bust: OK (every changed asset has a new ?v=)');
process.exit(fail ? 1 : 0);
JS
