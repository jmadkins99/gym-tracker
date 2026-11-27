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

# Node (fixtures built from `new Date()`) and Chrome run in one zone, so they
# agree on the day. lib/browser.js pins the same zone; exporting it here covers
# every process the runner starts. Phoenix has no DST.
export TZ=America/Phoenix

# Where the cases live, and where this run's output goes. Both exist for the
# runner self-test (check-runner.sh), which points the runner at a folder of
# made-up cases and a temp output folder. Nobody else needs to set them.
CASES_DIR="${TEST_CASES_DIR:-cases}"
OUT_DIR="${TEST_OUT_DIR:-.last-run}"

# Optional filter: `bash run.sh 42` runs just case 42, `bash run.sh personal-app`
# runs every personal-app case. Matched as a substring of the case name.
#
# TEST_CASES, if set, is an exact list of case names (whitespace-separated)
# and replaces the filter. Plain `bash run.sh` is the full suite.
PATTERN="${1:-}"
ONLY="${TEST_CASES:-}"
# `${TEST_CASES+x}` is "x" when the variable is set, even to the empty string.
# That is the case the guard below refuses: a broken filter (an alias or a
# pipeline that produced nothing) must never quietly become a full run.
ONLY_SET="${TEST_CASES+x}"
JOBS="${TEST_JOBS:-6}"
CASE_TIMEOUT="${TEST_CASE_TIMEOUT:-120}"

# TEST_SHARD=i/n runs every n-th case starting at the i-th (1-based), so n
# machines can split the suite between them -- CI's matrix does this. Taken
# round-robin rather than in contiguous blocks because the cases are
# numbered by age, and a block of neighbours is a block of similar cost.
SHARD="${TEST_SHARD:-}"
if [ -n "$SHARD" ]; then
    SHARD_I="${SHARD%/*}"; SHARD_N="${SHARD#*/}"
    if ! [[ "$SHARD_I" =~ ^[0-9]+$ && "$SHARD_N" =~ ^[0-9]+$ ]] ||
       [ "$SHARD_I" -lt 1 ] || [ "$SHARD_I" -gt "$SHARD_N" ]; then
        echo "TEST_SHARD must look like 2/4 (shard 2 of 4), got: $SHARD"
        exit 1
    fi
fi

# TEST_CASES guard: refuse before anything runs. Set-but-empty, or naming a
# case that has no file in the cases folder, is an error, not "run everything".
if [ -n "$ONLY_SET" ]; then
    if [ -z "$(echo $ONLY)" ]; then
        echo "TEST_CASES is set but empty. Refusing to run: an empty list is almost certainly a broken filter, not a request for the full suite."
        echo "Unset it (or use bash run.sh <pattern>) to run cases."
        exit 1
    fi
    UNKNOWN=()
    for want in $ONLY; do
        [ -f "$CASES_DIR/$want.js" ] || UNKNOWN+=("$want")
    done
    if [ "${#UNKNOWN[@]}" -gt 0 ]; then
        echo "TEST_CASES names case(s) that do not exist in $CASES_DIR/: ${UNKNOWN[*]}"
        echo "Nothing was run."
        exit 1
    fi
fi

# Guardrails (check-cache-bust.sh, check-no-sync-waits.sh): a changed asset needs a new
# ?v= in the HTML that loads it. Runs on a full run, not on a
# filtered run, and not on a CI shard (CI has a job of its own for it, so four
# shards would not repeat it).
CACHE_FAIL=0
if [ -z "$PATTERN" ] && [ -z "$ONLY_SET" ] && [ -z "$SHARD" ] && [ -z "${TEST_CASES_DIR:-}" ]; then
    bash ./check-cache-bust.sh || CACHE_FAIL=1
    bash ./check-no-sync-waits.sh || CACHE_FAIL=1
    echo
fi

# Install puppeteer-core etc. on first run. Not for the self-test's made-up
# cases, which are plain node scripts.
if [ ! -d node_modules ] && [ -z "${TEST_CASES_DIR:-}" ]; then
    echo "Installing test dependencies..."
    npm install --silent --no-audit --no-fund
fi

# Collect the cases to run, in filename order.
NAMES=()
FILES=()
for test in "$CASES_DIR"/*.js; do
    name=$(basename "$test" .js)
    if [ -n "$ONLY_SET" ]; then
        case " $(echo $ONLY) " in
            *" $name "*) NAMES+=("$name"); FILES+=("$test") ;;
        esac
    else
        case "$name" in
            *"$PATTERN"*) NAMES+=("$name"); FILES+=("$test") ;;
        esac
    fi
done

if [ -n "$SHARD" ]; then
    S_NAMES=(); S_FILES=()
    for i in "${!NAMES[@]}"; do
        if [ $(( i % SHARD_N + 1 )) -eq "$SHARD_I" ]; then
            S_NAMES+=("${NAMES[$i]}"); S_FILES+=("${FILES[$i]}")
        fi
    done
    NAMES=("${S_NAMES[@]}"); FILES=("${S_FILES[@]}")
fi

TOTAL=${#NAMES[@]}

if [ -n "$SHARD" ]; then
    echo "Shard $SHARD: every ${SHARD_N}th case, starting at #$SHARD_I"
fi
if [ -n "$ONLY_SET" ]; then
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
#
# Two folders. STATE is scratch (exit codes, timings, raw attempt logs) and is
# deleted on exit. OUT_DIR (tests/.last-run/, git-ignored) is the record that
# survives: replaced at the start of every run, one <case>.log per case run
# plus summary.txt, written at the end. A failure is read with `cat`, never by
# rerunning the suite.
STATE=$(mktemp -d)
trap 'rm -rf "$STATE"' EXIT
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# A case gets TEST_CASE_TIMEOUT seconds (default 120, about ten times the
# slowest case) and is then killed. Without a limit, one hung case -- a Chrome
# that never closes, a promise that never resolves -- hangs the whole run with
# no output at all, because nothing is printed until every case is done. The
# kill has to take the case's Chrome with it: its `finally { browser.close() }`
# never runs when the process is killed from outside, so a plain kill leaves a
# ~200 MB Chrome behind for every timeout. On Windows taskkill /T walks the
# tree for us; on Linux puppeteer puts Chrome in a process group of its own, so
# killing node's group would miss it, and the tree is walked by parent pid
# instead, stopping each parent first so it cannot spawn a child mid-walk.
kill_tree() {
    if [ -r "/proc/$1/winpid" ]; then
        taskkill //T //F //PID "$(cat "/proc/$1/winpid")" > /dev/null 2>&1
    else
        kill -STOP "$1" 2>/dev/null
        local kid
        for kid in $(pgrep -P "$1"); do kill_tree "$kid"; done
        kill -KILL "$1" 2>/dev/null
    fi
}

# Milliseconds since the epoch (bash 5's $EPOCHREALTIME is microseconds).
now_ms() { local t="${EPOCHREALTIME/./}"; echo $(( t / 1000 )); }

# run_case <index> <suffix>: runs one case into $STATE/<slot><suffix>.log and
# writes 0 (pass) or 1 (fail or timeout) to the matching .code file and its
# duration in ms to .ms.
#
# SEAM (#46, one Chrome per slot): this is where a case is started. The
# runner would pass the slot's Chrome endpoint to `node` through an env var
# here, and restart the slot's Chrome when a case reports it died.
run_case() {
    local slot pid start code t0
    slot=$(printf '%04d' "$1")
    t0=$(now_ms)
    node "${FILES[$1]}" > "$STATE/$slot$2.log" 2>&1 &
    pid=$!
    start=$SECONDS
    while kill -0 "$pid" 2>/dev/null; do
        if [ $(( SECONDS - start )) -ge "$CASE_TIMEOUT" ]; then
            kill_tree "$pid"
            wait "$pid" 2>/dev/null
            echo "TIMED OUT after ${CASE_TIMEOUT}s (TEST_CASE_TIMEOUT); killed it and its Chrome. Its output up to then is above." >> "$STATE/$slot$2.log"
            echo 1 > "$STATE/$slot$2.code"
            echo $(( $(now_ms) - t0 )) > "$STATE/$slot$2.ms"
            return
        fi
        sleep 0.5
    done
    wait "$pid"; code=$?
    [ "$code" = 0 ] && echo 0 > "$STATE/$slot$2.code" || echo 1 > "$STATE/$slot$2.code"
    echo $(( $(now_ms) - t0 )) > "$STATE/$slot$2.ms"
}

for i in "${!NAMES[@]}"; do
    run_case "$i" "" &
    # Cap in-flight jobs. `wait -n` returns as soon as any one finishes, so a
    # slow case never blocks the queue behind it.
    while [ "$(jobs -rp | wc -l)" -ge "$JOBS" ]; do
        wait -n
    done
done
wait

# Every failed case gets one more try, one at a time with nothing else
# running. Most flakes here come from load -- ERR_NO_BUFFER_SPACE, or a script
# that had not finished loading ("APP_NAMESPACE is not defined") while five
# other Chromes competed for the machine -- and a quiet machine removes that
# cause. A real bug fails the same way twice, and only a case that fails both
# times turns the run red. A pass on retry is still reported as one, with the
# first attempt's output, so a flake gets looked into rather than hidden.
RETRY=()
for i in "${!NAMES[@]}"; do
    [ "$(cat "$STATE/$(printf '%04d' "$i").code" 2>/dev/null)" = "0" ] || RETRY+=("$i")
done
if [ "${#RETRY[@]}" -gt 0 ]; then
    echo "Retrying ${#RETRY[@]} failed case(s) one at a time..."
    echo
    for i in "${RETRY[@]}"; do run_case "$i" .retry; done
fi

# Report in filename order regardless of the order they finished, so two runs
# of the same filter are diffable against each other. Each case's file in
# OUT_DIR holds its result line, its first attempt's output and, if it was
# retried, the retry's output. Cases that failed then passed are FLAKY.
secs() { awk -v ms="$1" 'BEGIN { printf "%.1fs", ms / 1000 }'; }

FAIL=0
PASSED=0
P_LIST=(); F_LIST=(); FLAKY_LIST=()
for i in "${!NAMES[@]}"; do
    slot=$(printf '%04d' "$i")
    name="${NAMES[$i]}"
    code=$(cat "$STATE/$slot.code" 2>/dev/null || echo 1)
    t1=$(secs "$(cat "$STATE/$slot.ms" 2>/dev/null || echo 0)")
    out="$OUT_DIR/$name.log"
    printf "▶ %s ... " "$name"
    if [ "$code" = "0" ]; then
        echo "PASS ($t1)"
        PASSED=$((PASSED + 1))
        P_LIST+=("$name  $t1")
        { echo "RESULT: PASS ($t1)"; cat "$STATE/$slot.log"; } > "$out"
    elif [ "$(cat "$STATE/$slot.retry.code" 2>/dev/null)" = "0" ]; then
        t2=$(secs "$(cat "$STATE/$slot.retry.ms" 2>/dev/null || echo 0)")
        echo "FLAKY: failed ($t1), passed on retry ($t2)"
        PASSED=$((PASSED + 1))
        FLAKY_LIST+=("$name  first attempt failed ($t1), retry passed ($t2)")
        {
            echo "RESULT: FLAKY (first attempt failed in $t1, retry passed in $t2)"
            echo "─── first attempt's output ──────────────────"
            cat "$STATE/$slot.log"
            echo "─── retry's output ──────────────────────────"
            cat "$STATE/$slot.retry.log"
        } > "$out"
        echo "─── first attempt's output ──────────────────"
        sed 's/^/    /' "$STATE/$slot.log" 2>/dev/null
        echo "─────────────────────────────────────────────"
        # A GitHub Actions annotation puts the flake on the run's summary page.
        if [ -n "${GITHUB_ACTIONS:-}" ]; then echo "::warning title=FLAKY test::$name failed once and passed on retry"; fi
    else
        t2=$(secs "$(cat "$STATE/$slot.retry.ms" 2>/dev/null || echo 0)")
        echo "FAIL ($t1, retry $t2)"
        F_LIST+=("$name  failed twice ($t1, retry $t2)")
        {
            echo "RESULT: FAIL (first attempt $t1, retry $t2)"
            echo "─── first attempt's output ──────────────────"
            cat "$STATE/$slot.log"
            echo "─── retry's output ──────────────────────────"
            cat "$STATE/$slot.retry.log"
        } > "$out"
        echo "─── first attempt's output ──────────────────"
        sed 's/^/    /' "$STATE/$slot.log" 2>/dev/null
        echo "─── retry's output ──────────────────────────"
        sed 's/^/    /' "$STATE/$slot.retry.log" 2>/dev/null
        echo "─────────────────────────────────────────────"
        FAIL=1
    fi
done

# summary.txt: the same text the run ends with. Failed and FLAKY come before
# the passed list because they are what a reader is after.
write_summary() {
    echo "================================================"
    if [ -n "$SHARD" ]; then
        echo "  $PASSED / $TOTAL passed  (shard $SHARD)"
    elif [ -n "$ONLY_SET" ]; then
        echo "  $PASSED / $TOTAL passed  (selected cases only)"
    elif [ -n "$PATTERN" ]; then
        echo "  $PASSED / $TOTAL passed  (filtered: \"$PATTERN\")"
    else
        echo "  $PASSED / $TOTAL passed"
    fi
    if [ "${#F_LIST[@]}" -gt 0 ]; then
        echo "FAILED (${#F_LIST[@]}):"; printf '  %s\n' "${F_LIST[@]}"
    fi
    if [ "${#FLAKY_LIST[@]}" -gt 0 ]; then
        echo "FLAKY (${#FLAKY_LIST[@]}), passed only on retry, look into these:"; printf '  %s\n' "${FLAKY_LIST[@]}"
    fi
    if [ "${#P_LIST[@]}" -gt 0 ]; then
        echo "PASSED (${#P_LIST[@]}):"; printf '  %s\n' "${P_LIST[@]}"
    fi
    if [ "$CACHE_FAIL" = "1" ]; then echo "guardrail check FAILED (see the top of this output)"; fi
    echo "Per-case output: $OUT_DIR/<case>.log (read it with cat)"
    echo "================================================"
}
write_summary > "$OUT_DIR/summary.txt"

echo
cat "$OUT_DIR/summary.txt"
exit $(( FAIL || CACHE_FAIL ))
