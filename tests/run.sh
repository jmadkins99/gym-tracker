#!/usr/bin/env bash
# Test runner. Installs deps if missing, then runs every test case file in
# cases/ — several at a time — and prints PASS/FAIL for each. Exits non-zero
# on any failure.
#
# Cases run CONCURRENTLY. That is safe by construction, not by luck, and the
# suite was built for it long before it was switched on:
#
#   - Each case starts its own HTTP server on an OS-assigned free port
#     (lib/server.js passes port 0), so no two cases can contend for one.
#   - Each case launches its own Chrome, and puppeteer gives every launch a
#     fresh temp profile, so localStorage cannot leak between them. They are
#     also on different ports, hence different origins, so the isolation holds
#     twice over. See the note in lib/browser.js — that isolation must not be
#     "optimized" away with a shared userDataDir.
#   - No case writes to disk, and none depends on another having run first;
#     every case seeds its own state and tears down in a finally block.
#
# Concurrency is capped rather than unbounded: each case costs a Chrome
# (~200 MB) plus a node process, so 57 at once would thrash. Override with
# TEST_JOBS=n. TEST_JOBS=1 restores the old strictly-sequential behaviour,
# which is worth reaching for when a failure looks timing-dependent.

set -u
cd "$(dirname "$0")"

# Optional filter: `bash run.sh 42` runs just case 42, `bash run.sh personal-app`
# runs every personal-app case. Matched as a substring of the case name.
#
# TEST_CASES, if set, is an exact list of case names (whitespace-separated)
# and replaces the filter. The pre-push hook uses it to run only the cases a
# push touches (see lib/select.js).
#
# `bash run.sh --affected` runs only the cases the working tree's changes can
# touch -- committed or not, since the last verified commit -- chosen the same
# way the pre-push hook chooses (lib/select.js), and falls back to the full
# suite whenever that selection cannot vouch for a change. It is the everyday
# check before a commit. Plain `bash run.sh` stays the full suite on purpose:
# public-gym-app's pre-push hook calls it with no arguments and relies on
# getting every case, including its own 37, which read nothing in this repo
# and so are never "affected" by anything here.
AFFECTED=0
if [ "${1:-}" = "--affected" ]; then AFFECTED=1; shift; fi
PATTERN="${1:-}"
ONLY="${TEST_CASES:-}"
JOBS="${TEST_JOBS:-6}"

# Every case is run with lib/coverage.js preloaded, which records the repo
# files it reads into .coverage/<case>.json. That is the map the pre-push hook
# selects from; it is rebuilt here on every run and never edited by hand.
COVERAGE_DIR="$PWD/.coverage"
PRELOAD="$PWD/lib/coverage.js"

# The git tree the working directory would commit as, untracked files
# included, computed through a scratch index so the real one is not touched.
# A passing full or --affected run records it in .coverage/_verified, and the
# pre-push hook skips its own run when the commit being pushed is exactly this
# tree -- otherwise every change would be tested twice, once before the commit
# and again at the push, against identical files.
worktree_tree() {
    local tmp
    tmp="$(mktemp)" || return 1
    cp "$(git rev-parse --git-path index)" "$tmp" 2>/dev/null || true
    ( GIT_INDEX_FILE="$tmp" git add -A -- "$(git rev-parse --show-toplevel)" >/dev/null 2>&1 &&
      GIT_INDEX_FILE="$tmp" git write-tree ) || { rm -f "$tmp"; return 1; }
    rm -f "$tmp"
}
TREE_BEFORE=""
if [ -z "$PATTERN" ] && [ -z "$ONLY" ]; then
    TREE_BEFORE="$(worktree_tree 2>/dev/null || true)"
fi
VERIFIED_KIND=""   # what a pass would vouch for: ALL, or the base it diffed from

if [ "$AFFECTED" = "1" ] && [ -z "$PATTERN" ] && [ -z "$ONLY" ]; then
    BASE="$(cat "$COVERAGE_DIR/_base" 2>/dev/null || true)"
    if [ -z "$BASE" ] || ! git cat-file -e "$BASE^{commit}" 2>/dev/null; then
        echo "Affected: no verified base yet, so running the full suite."
    else
        # Both lists come out relative to the repo root, as select.js expects:
        # tracked changes (committed since BASE, staged, or not) plus new
        # files git does not know about yet.
        ROOT="$(git rev-parse --show-toplevel)"
        SELECTION="$( { git -C "$ROOT" diff --name-only --no-renames "$BASE" 2>/dev/null;
                        git -C "$ROOT" ls-files --others --exclude-standard 2>/dev/null; } |
                      node lib/select.js )"
        case "$SELECTION" in
            "ALL "*)
                echo "Affected: ${SELECTION#ALL }, so running the full suite." ;;
            "")
                echo "Affected: no case reads anything changed since $(git rev-parse --short "$BASE") -- nothing to run."
                [ -n "$TREE_BEFORE" ] && mkdir -p "$COVERAGE_DIR" &&
                    echo "$TREE_BEFORE $BASE" > "$COVERAGE_DIR/_verified"
                exit 0 ;;
            *)
                ONLY="$SELECTION"
                VERIFIED_KIND="$BASE" ;;
        esac
    fi
fi
FULL=0
if [ -z "$PATTERN" ] && [ -z "$ONLY" ]; then FULL=1; VERIFIED_KIND="ALL"; fi

# Install puppeteer-core etc. on first run.
if [ ! -d node_modules ]; then
    echo "Installing test dependencies..."
    npm install --silent --no-audit --no-fund
fi

# Collect the cases to run, in filename order.
NAMES=()
FILES=()
for test in cases/*.js; do
    name=$(basename "$test" .js)
    if [ -n "$ONLY" ]; then
        case " $(echo $ONLY) " in
            *" $name "*) NAMES+=("$name"); FILES+=("$test") ;;
        esac
    else
        case "$name" in
            *"$PATTERN"*) NAMES+=("$name"); FILES+=("$test") ;;
        esac
    fi
done

TOTAL=${#NAMES[@]}

if [ "$AFFECTED" = "1" ] && [ -n "$ONLY" ]; then
    echo "Affected: only the cases that read something changed since $(git rev-parse --short "$BASE")"
elif [ -n "$ONLY" ]; then
    echo "Selected: only the cases listed in TEST_CASES"
elif [ -n "$PATTERN" ]; then
    echo "Filter: only cases matching \"$PATTERN\""
fi
if [ "$TOTAL" -eq 0 ]; then
    echo "No cases matched."
    exit 1
fi
echo "Running $TOTAL case(s), $JOBS at a time."
echo

# Each case writes its own output to its own file. Nothing is printed while
# cases are in flight: with several running at once, interleaved writes would
# shred the failure diagnostics, which are the entire value of a failure.
OUTDIR=$(mktemp -d)
trap 'rm -rf "$OUTDIR"' EXIT

for i in "${!NAMES[@]}"; do
    slot=$(printf '%04d' "$i")
    {
        if node -r "$PRELOAD" "${FILES[$i]}" > "$OUTDIR/$slot.log" 2>&1; then
            echo 0 > "$OUTDIR/$slot.code"
        else
            echo 1 > "$OUTDIR/$slot.code"
        fi
    } &
    # Cap in-flight jobs. `wait -n` returns as soon as any one finishes, so a
    # slow case never blocks the queue behind it.
    while [ "$(jobs -rp | wc -l)" -ge "$JOBS" ]; do
        wait -n
    done
done
wait

# Report in filename order regardless of the order they finished, so two runs
# of the same filter are diffable against each other.
FAIL=0
PASSED=0
for i in "${!NAMES[@]}"; do
    slot=$(printf '%04d' "$i")
    code=$(cat "$OUTDIR/$slot.code" 2>/dev/null || echo 1)
    printf "▶ %s ... " "${NAMES[$i]}"
    if [ "$code" = "0" ]; then
        echo "PASS"
        PASSED=$((PASSED + 1))
    else
        echo "FAIL"
        # A failed case may have stopped before loading everything it
        # normally reads, so its list cannot be trusted. Dropping it makes the
        # case unknown to lib/select.js, which then runs it on every push until
        # it passes again.
        rm -f "$COVERAGE_DIR/${NAMES[$i]}.json"
        echo "─── output ──────────────────────────────────"
        sed 's/^/    /' "$OUTDIR/$slot.log" 2>/dev/null
        echo "─────────────────────────────────────────────"
        FAIL=1
    fi
done

# A full run has just rewritten the entry of every case that exists, so any
# other entry belongs to a deleted or renamed case. It also makes the map
# accurate for the commit checked out, so that becomes the base the pre-push
# hook diffs from. (Uncommitted edits were run too; they will show up in the
# next push's diff anyway, which can only select more, never fewer.)
if [ "$FULL" = "1" ] && [ -d "$COVERAGE_DIR" ]; then
    for entry in "$COVERAGE_DIR"/*.json; do
        [ -e "$entry" ] || continue
        [ -f "cases/$(basename "$entry" .json).js" ] || rm -f "$entry"
    done
    git rev-parse HEAD > "$COVERAGE_DIR/_base" 2>/dev/null || rm -f "$COVERAGE_DIR/_base"
fi

# Record the tree this pass vouches for -- only if nothing changed under the
# run, since a file edited mid-run may have been tested in either state.
if [ "$FAIL" = "0" ] && [ -n "$VERIFIED_KIND" ] && [ -n "$TREE_BEFORE" ]; then
    if [ "$(worktree_tree 2>/dev/null || true)" = "$TREE_BEFORE" ]; then
        mkdir -p "$COVERAGE_DIR"
        echo "$TREE_BEFORE $VERIFIED_KIND" > "$COVERAGE_DIR/_verified"
    fi
fi

echo
echo "================================================"
if [ "$AFFECTED" = "1" ] && [ -n "$ONLY" ]; then
    echo "  $PASSED / $TOTAL passed  (affected cases only; the other $(( $(ls cases/*.js | wc -l) - TOTAL )) cannot see these changes)"
elif [ -n "$ONLY" ]; then
    echo "  $PASSED / $TOTAL passed  (selected cases only)"
elif [ -n "$PATTERN" ]; then
    echo "  $PASSED / $TOTAL passed  (filtered: \"$PATTERN\")"
else
    echo "  $PASSED / $TOTAL passed"
fi
echo "================================================"
exit $FAIL
