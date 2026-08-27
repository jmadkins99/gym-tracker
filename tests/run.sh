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
PATTERN="${1:-}"
JOBS="${TEST_JOBS:-6}"

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
    case "$name" in
        *"$PATTERN"*) NAMES+=("$name"); FILES+=("$test") ;;
    esac
done

TOTAL=${#NAMES[@]}

if [ -n "$PATTERN" ]; then
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
        if node "${FILES[$i]}" > "$OUTDIR/$slot.log" 2>&1; then
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
        echo "─── output ──────────────────────────────────"
        sed 's/^/    /' "$OUTDIR/$slot.log" 2>/dev/null
        echo "─────────────────────────────────────────────"
        FAIL=1
    fi
done

echo
echo "================================================"
if [ -n "$PATTERN" ]; then
    echo "  $PASSED / $TOTAL passed  (filtered: \"$PATTERN\")"
else
    echo "  $PASSED / $TOTAL passed"
fi
echo "================================================"
exit $FAIL
