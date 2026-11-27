#!/usr/bin/env bash
# Runner self-test: runs run.sh as a whole process against the made-up cases in
# selftest-cases/ (through TEST_CASES_DIR) and checks exit codes, the printed
# summary and the files in the last-run folder. Runs in CI's guardrails job
# next to the other check-*.sh scripts, and by hand: `bash check-runner.sh`.
#
# It never touches the real tests/.last-run/: TEST_OUT_DIR points the runner at
# a temp folder, and TEST_LOCK_FILE points the machine-wide lock into the same
# temp folder, so the self-test never contends with a real suite. The lock,
# interrupt and Chrome sections are at the end of this file. The cases in
# selftest-cases are plain node scripts and run without slot Chromes; the ones
# in selftest-chrome-cases need Chrome and puppeteer-core (the runner skips
# `npm install` for a custom cases folder, so install it first).

set -u
cd "$(dirname "$0")"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
FAILED=0

ok()   { echo "  ok   - $1"; }
fail() { echo "  FAIL - $1"; FAILED=1; }

# The environment every runner in this file gets, set in one place.
# TEST_LOCK_FILE: a lock of its own in $WORK (see the top of the file).
LOCK="$WORK/test.lock"
selftest_env() {   # selftest_env <label>: fills ENV_ARGS
    ENV_ARGS=(TEST_CASES_DIR=selftest-cases TEST_OUT_DIR="$WORK/out-$1"
        TEST_JOBS=2 TEST_CASE_TIMEOUT=30 SELFTEST_MARKER="$WORK/marker-$1"
        TEST_LOCK_FILE="$LOCK" TEST_LOCK_POLL=0.2)
}

# runner <label> [VAR=value ...] bash run.sh [args]
# Runs the command with the self-test env; output goes to $WORK/<label>.out and
# the exit code is left in $CODE. A VAR=value given here replaces the default.
CODE=0
runner() {
    local label="$1"; shift
    selftest_env "$label"
    env "${ENV_ARGS[@]}" "$@" > "$WORK/$label.out" 2>&1
    CODE=$?
}
# runner_bg <label> ...: same, in the background; the runner's pid is in $BG_PID.
# `exec` makes the background process the runner itself, so $BG_PID is the pid
# the runner records in the lock as its own $$.
BG_PID=0
runner_bg() {
    local label="$1"
    selftest_env "$label"
    ( exec env "${ENV_ARGS[@]}" "${@:2}" > "$WORK/$label.out" 2>&1 ) &
    BG_PID=$!
}
lock_pid() { sed -n 's/^pid=//p' "$LOCK/info" 2>/dev/null; }
has() { grep -q -- "$2" "$WORK/$1.out"; }   # has <label> <fixed text>
# wait_for <label> <fixed text>: polls a background run's output for up to 15s.
wait_for() { local n; for n in $(seq 1 75); do has "$1" "$2" && return 0; sleep 0.2; done; return 1; }
# wait_file <path>: polls up to 15s for a non-empty file.
wait_file() { local n; for n in $(seq 1 75); do [ -s "$1" ] && return 0; sleep 0.2; done; return 1; }
write_lock() { mkdir -p "$LOCK"; printf 'repo=%s\npid=%s\nstarted=%s\n' "$1" "$2" "$3" > "$LOCK/info"; }   # write_lock <repo> <pid> <epoch>

echo "mixed run: pass, fail and a flaky case"
runner mixed bash run.sh
[ "$CODE" = 1 ] && ok "exit 1 because 02-fail fails" || fail "expected exit 1, got $CODE"
O="$WORK/out-mixed"
grep -q "^FAILED" "$O/summary.txt" && grep -q "02-fail" "$O/summary.txt" && ok "summary lists the failed case" || fail "summary misses the failed case"
grep -q "^FLAKY" "$O/summary.txt" && grep -q "03-flaky" "$O/summary.txt" && ok "summary lists the flaky case as FLAKY" || fail "summary misses FLAKY 03-flaky"
has mixed "FLAKY" && ok "FLAKY is in the printed output too" || fail "FLAKY not printed"
[ -f "$O/01-pass.log" ] && [ -f "$O/02-fail.log" ] && [ -f "$O/03-flaky.log" ] && ok "one output file per case" || fail "missing per-case files in last-run folder"
[ "$(ls "$O" | grep -c '\.log$')" = 3 ] && ok "no extra per-case files" || fail "unexpected number of .log files"
grep -q "SELFTEST-FAIL-MARKER" "$O/02-fail.log" && ok "failed case's output is in its file" || fail "02-fail.log lacks the case's output"
grep -q "SELFTEST-FLAKY-MARKER" "$O/03-flaky.log" && ok "flaky case's first attempt is in its file" || fail "03-flaky.log lacks the first attempt"
grep -q "^PASSED" "$O/summary.txt" && grep -q "01-pass" "$O/summary.txt" && ok "summary lists the passed case" || fail "summary misses 01-pass"
grep -Eq "[0-9]+\.[0-9]s" "$O/summary.txt" && ok "summary has timings" || fail "summary has no timings"

echo "a second run replaces the last-run folder"
echo stale > "$O/stale-file"
runner mixed bash run.sh 01
[ "$CODE" = 0 ] && ok "pattern run of the passing case exits 0" || fail "expected exit 0, got $CODE"
[ ! -e "$O/stale-file" ] && [ ! -e "$O/02-fail.log" ] && [ -f "$O/01-pass.log" ] && ok "old files gone, new file present" || fail "last-run folder was not replaced"

echo "TEST_OUT_DIR is only deleted if it looks like a last-run folder"
PREC="$WORK/precious"; mkdir -p "$PREC"; echo keep > "$PREC/important.txt"
runner precious TEST_OUT_DIR="$PREC" bash run.sh 01
{ [ "$CODE" != 0 ] && [ -f "$PREC/important.txt" ]; } && ok "a non-empty folder without the marker is refused and left alone" || fail "unmarked TEST_OUT_DIR was deleted or accepted (exit $CODE)"
{ has precious "Refusing" && ! has precious "Running"; } && ok "refused before any case started" || fail "no refusal message, or the run started"
EMPTYDIR="$WORK/empty-out"; mkdir -p "$EMPTYDIR"
runner emptyout TEST_OUT_DIR="$EMPTYDIR" bash run.sh 01
{ [ "$CODE" = 0 ] && [ -f "$EMPTYDIR/summary.txt" ]; } && ok "an empty folder is accepted" || fail "empty TEST_OUT_DIR refused (exit $CODE)"

echo "flaky case alone: the run passes"
runner flaky bash run.sh 03
[ "$CODE" = 0 ] && ok "exit 0 when the only problem is a flake" || fail "expected exit 0, got $CODE"
has flaky "FLAKY" && ok "FLAKY printed" || fail "FLAKY not printed"
runner flaky2 GITHUB_ACTIONS=true bash run.sh 03
has flaky2 "::warning" && ok "CI annotation printed under GITHUB_ACTIONS" || fail "no ::warning annotation"

echo "TEST_CASES guard"
runner empty TEST_CASES= bash run.sh
[ "$CODE" != 0 ] && ok "empty TEST_CASES exits non-zero" || fail "empty TEST_CASES exited 0"
has empty "TEST_CASES" && ok "empty TEST_CASES prints a message" || fail "no message for empty TEST_CASES"
{ [ ! -e "$WORK/out-empty" ] && ! has empty "Running"; } && ok "no case started (empty)" || fail "a run started despite empty TEST_CASES"
runner unknown TEST_CASES="01-pass no-such-case" bash run.sh
[ "$CODE" != 0 ] && ok "unknown case exits non-zero" || fail "unknown case exited 0"
has unknown "no-such-case" && ok "message names the unknown case" || fail "message does not name the case"
{ [ ! -e "$WORK/out-unknown" ] && ! has unknown "Running"; } && ok "no case started (unknown)" || fail "a run started despite unknown case"
runner listed TEST_CASES="01-pass" bash run.sh
[ "$CODE" = 0 ] && ok "valid TEST_CASES still works" || fail "valid TEST_CASES exit $CODE"

echo "TEST_SHARD"
runner shard TEST_SHARD=1/2 bash run.sh
# Shard 1/2 of {01,02,03} is 01 and 03; 02-fail is on shard 2.
[ "$CODE" = 0 ] && ok "shard 1/2 runs 01 and 03 and exits 0" || fail "shard 1/2 exit $CODE"
runner badshard TEST_SHARD=3/2 bash run.sh
[ "$CODE" != 0 ] && ok "bad TEST_SHARD rejected" || fail "bad TEST_SHARD accepted"

# ── machine-wide lock ────────────────────────────────────────────────────────
# The holders below are made up: a lock naming a live process (a sleep) or one
# that has already exited. $LOCK is in $WORK (see selftest_env).

echo "no lock is left behind after runs that passed or failed"
[ ! -e "$LOCK" ] && ok "no lock after the earlier runs, including failing ones" || fail "lock left behind"

echo "the default lock path does not depend on TMPDIR"
if [ -n "${LOCALAPPDATA:-}" ] && command -v cygpath > /dev/null 2>&1; then
    WANT_LOCK="$(cygpath -u "$LOCALAPPDATA")/Temp/machine-test-run.lock"
else
    WANT_LOCK=/tmp/machine-test-run.lock
fi
if [ -e "$WANT_LOCK" ]; then
    echo "  skip - a real test run holds $WANT_LOCK right now"
else
    SLOWD="$WORK/slow-cases"; mkdir -p "$SLOWD"
    echo "setTimeout(() => {}, 15000);" > "$SLOWD/01-slow.js"
    mkdir -p "$WORK/tmpA"
    ( exec env -u TEST_LOCK_FILE TMPDIR="$WORK/tmpA" TEST_CASES_DIR="$SLOWD" TEST_OUT_DIR="$WORK/out-default-lock" TEST_JOBS=1 \
        bash run.sh > "$WORK/default-lock.out" 2>&1 ) &
    DL_PID=$!
    for n in $(seq 1 50); do [ -s "$WANT_LOCK/info" ] && break; sleep 0.2; done
    { [ -d "$WANT_LOCK" ] && grep -q "^pid=$DL_PID$" "$WANT_LOCK/info"; } && ok "lock is in the user's temp folder, not in the session's TMPDIR" || fail "lock not at $WANT_LOCK"
    ls "$WORK/tmpA" | grep -q "machine-test-run" && fail "lock was created under TMPDIR" || ok "nothing created under TMPDIR"
    kill -TERM "$DL_PID" 2>/dev/null; wait "$DL_PID" 2>/dev/null
    [ ! -e "$WANT_LOCK" ] && ok "default lock released" || { fail "default lock left behind"; rm -rf "$WANT_LOCK"; }
fi

echo "a run holds the lock while it runs; SIGTERM stops its cases, publishes what it has and releases the lock"
SLOW="$WORK/slow-cases2"; mkdir -p "$SLOW"
cat > "$SLOW/01-fast.js" <<'EOF'
console.log('SELFTEST-FAST-DONE');
EOF
cat > "$SLOW/02-slow.js" <<'EOF'
// Beats once every 100 ms into HEARTBEAT, so the self-test can tell that the
// case started and that it stopped.
const fs = require('fs');
console.log('SELFTEST-SLOW-STARTED');
setInterval(() => fs.appendFileSync(process.env.HEARTBEAT, '.'), 100);
EOF
HB="$WORK/heartbeat"
runner_bg holding TEST_CASES_DIR="$SLOW" HEARTBEAT="$HB" TEST_JOBS=1 bash run.sh
wait_file "$HB" && ok "the slow case started" || fail "the slow case never started"
if grep -q "^repo=$(basename "$(cd .. && pwd)")$" "$LOCK/info" && grep -q "^pid=$BG_PID$" "$LOCK/info" && grep -Eq "^started=[0-9]{9,}$" "$LOCK/info"; then
    ok "lock names the repo, the runner's own pid and the start time"
else
    fail "lock contents wrong (runner pid $BG_PID): $(cat "$LOCK/info" 2>/dev/null)"
fi
kill -TERM "$BG_PID" 2>/dev/null
wait "$BG_PID" 2>/dev/null
[ ! -e "$LOCK" ] && ok "lock removed after SIGTERM" || fail "lock left after SIGTERM"
SIZE1=$(wc -c < "$HB"); sleep 1; SIZE2=$(wc -c < "$HB")
[ "$SIZE1" = "$SIZE2" ] && ok "the in-flight case stopped beating: it was stopped with the run" || fail "the case kept running after SIGTERM ($SIZE1 -> $SIZE2)"
OI="$WORK/out-holding"
grep -q "INTERRUPTED" "$OI/summary.txt" 2>/dev/null && ok "summary is marked INTERRUPTED" || fail "no INTERRUPTED summary in the last-run folder"
{ grep -q "^RESULT: PASS" "$OI/01-fast.log" && grep -q "SELFTEST-FAST-DONE" "$OI/01-fast.log"; } 2>/dev/null && ok "the case that had finished is published with its output" || fail "01-fast.log missing or wrong after SIGTERM"
{ grep -q "^RESULT: INTERRUPTED" "$OI/02-slow.log" && grep -q "SELFTEST-SLOW-STARTED" "$OI/02-slow.log"; } 2>/dev/null && ok "the case that was running is published as interrupted, with its output so far" || fail "02-slow.log missing or wrong after SIGTERM"

echo "a held lock: the second run prints the holder once, waits, then runs"
sleep 60 & HOLDER=$!
write_lock kanban "$HOLDER" "$(( $(date +%s) - 90 ))"
runner_bg waiter bash run.sh 01
wait_for waiter "Waiting for it to finish" && ok "run announced that it is waiting" || fail "no waiting message"
has waiter "kanban (pid $HOLDER)" && ok "message names the holder's repo and pid" || fail "holder not named"
sleep 1
[ ! -e "$WORK/out-waiter" ] && ok "no case started (no output folder yet) while the lock is held" || fail "run started while the lock was held"
rm -rf "$LOCK"      # the holder lets go
wait "$BG_PID"; CODE=$?
{ [ "$CODE" = 0 ] && [ -f "$WORK/out-waiter/summary.txt" ]; } && ok "run went ahead once the lock was free" || fail "waiter did not run after release (exit $CODE)"
[ "$(grep -c "Waiting for it to finish" "$WORK/waiter.out")" = 1 ] && ok "holder was printed once" || fail "holder printed more than once"
[ ! -e "$LOCK" ] && ok "waiter released the lock when done" || fail "waiter left the lock"
kill "$HOLDER" 2>/dev/null

echo "a refused run does not wait for a held lock"
sleep 60 & HOLDER=$!
write_lock kanban "$HOLDER" "$(date +%s)"
runner refused TEST_CASES= bash run.sh
{ [ "$CODE" != 0 ] && ! has refused "Waiting"; } && ok "guard refuses at once, without waiting" || fail "refused run waited or exited 0"
[ "$(lock_pid)" = "$HOLDER" ] && ok "the holder's lock is untouched" || fail "refused run changed the lock"
kill "$HOLDER" 2>/dev/null; rm -rf "$LOCK"

echo "a stale lock is taken over"
sleep 0.1 & DEAD=$!; wait "$DEAD" 2>/dev/null
write_lock kanban "$DEAD" "$(( $(date +%s) - 3600 ))"
runner stale bash run.sh 01
{ [ "$CODE" = 0 ] && has stale "stale test lock" && ! has stale "Waiting"; } && ok "stale lock taken over without waiting" || fail "stale lock not taken over (exit $CODE)"
[ ! -e "$LOCK" ] && ok "no lock left after the takeover run" || fail "lock left after the takeover run"
mkdir -p "$LOCK"; printf 'garbage\n' > "$LOCK/info"
runner garbage bash run.sh 01
{ [ "$CODE" = 0 ] && [ ! -e "$LOCK" ]; } && ok "a lock with no readable pid counts as stale" || fail "garbage lock blocked the run (exit $CODE)"

echo "several runs racing for one stale lock never overlap"
SERIAL="$WORK/serial-cases"; mkdir -p "$SERIAL"
cat > "$SERIAL/01-serial.js" <<'EOF'
// Logs when it starts and ends. Two suites running at once would interleave.
const fs = require('fs');
fs.appendFileSync(process.env.SERIAL_LOG, 'start\n');
setTimeout(() => { fs.appendFileSync(process.env.SERIAL_LOG, 'end\n'); }, 600);
EOF
RACE_OK=1
for round in 1 2 3; do
    SLOG="$WORK/serial-log-$round"; : > "$SLOG"
    sleep 0.1 & DEAD=$!; wait "$DEAD" 2>/dev/null
    write_lock kanban "$DEAD" "$(( $(date +%s) - 3600 ))"
    PIDS=()
    for k in 1 2 3 4; do
        runner_bg "race-$round-$k" TEST_CASES_DIR="$SERIAL" SERIAL_LOG="$SLOG" TEST_JOBS=1 bash run.sh
        PIDS+=("$BG_PID")
    done
    for p in "${PIDS[@]}"; do wait "$p" 2>/dev/null; done
    [ "$(cat "$SLOG" | tr '\n' ' ')" = "start end start end start end start end " ] || RACE_OK=0
done
[ "$RACE_OK" = 1 ] && ok "four runs per round, three rounds: each case ended before the next began" || fail "runs overlapped or one did not run: $(tr '\n' ' ' < "$SLOG")"
[ ! -e "$LOCK" ] && [ ! -e "$LOCK.guard" ] && ok "no lock or guard left behind" || fail "lock or guard left behind"

# ── one Chrome per slot ──────────────────────────────────────────────────────
# Real Chrome cases (selftest-chrome-cases/), so this part needs puppeteer-core
# (npm install in tests/) and a Chrome; CI's guardrails job has both. One slot
# (TEST_JOBS=1) puts every case on the same Chrome, in order:
#   01 and 02: same origin, same Chrome, must not see each other's storage
#   03: crashes the slot's Chrome on its first attempt, passes on the retry,
#       which must run on a live Chrome that is not the crashed one
#   04: runs next on the slot, and needs the replacement Chrome
echo "cases on one slot's Chrome: separate storage, and a killed Chrome is replaced"
runner chrome TEST_CASES_DIR=selftest-chrome-cases TEST_SLOT_CHROME=1 TEST_JOBS=1 bash run.sh
[ "$CODE" = 0 ] && ok "run with a crashed Chrome exits 0" || fail "chrome run exit $CODE"
WS="$WORK/marker-chrome-ws"
W1=$(sed -n 's/^01-storage-a //p' "$WS"); W2=$(sed -n 's/^02-storage-b //p' "$WS"); W3=$(sed -n 's/^03-crash //p' "$WS")
W3R=$(sed -n 's/^03-crash-retry //p' "$WS"); W4=$(sed -n 's/^04-after-crash //p' "$WS")
{ [ -n "$W1" ] && [ "$W1" = "$W2" ]; } && ok "01 and 02 ran on the same slot Chrome" || fail "01 and 02 did not share a Chrome ($W1 / $W2)"
grep -q "storage was empty" "$WORK/out-chrome/01-storage-a.log" && grep -q "storage was empty" "$WORK/out-chrome/02-storage-b.log" \
    && ok "each case found the storage empty (the other's was in another context)" || fail "storage leaked between cases on one Chrome"
grep -q "^RESULT: PASS" "$WORK/out-chrome/02-storage-b.log" && ok "02 passed" || fail "02 did not pass"
grep -q "SELFTEST-CRASH-FAILED" "$WORK/out-chrome/03-crash.log" && fail "Browser.crash did not take the Chrome down, so the crash check proved nothing"
grep -q "SELFTEST-CRASH-CONFIRMED" "$WORK/out-chrome/03-crash.log" && ok "03's Chrome really crashed" || fail "03 never confirmed the crash"
grep -q "^FLAKY" "$WORK/out-chrome/summary.txt" && grep -q "03-crash" "$WORK/out-chrome/summary.txt" && ok "the case on the crashed Chrome failed once and was retried (FLAKY)" || fail "03-crash was not retried to a pass"
grep -q "the retry ran on a live Chrome" "$WORK/out-chrome/03-crash.log" && ok "the retry connected to a Chrome and opened a page" || fail "03's retry did not run on a live Chrome"
{ [ -n "$W3" ] && [ -n "$W3R" ] && [ "$W3R" != "$W3" ]; } && ok "the retry got a fresh Chrome, not the crashed one" || fail "retry Chrome not fresh ($W3 / $W3R)"
{ [ -n "$W4" ] && [ "$W4" != "$W1" ]; } && ok "the slot got a fresh Chrome after the crash" || fail "04 did not run on a replacement Chrome ($W1 / $W4)"
grep -q "^RESULT: PASS" "$WORK/out-chrome/04-after-crash.log" && ok "the next case on the slot passed" || fail "04 did not pass after the crash"

echo
if [ "$FAILED" = 0 ]; then
    echo "runner self-test: all checks passed"
else
    echo "runner self-test: FAILED. Runner outputs follow."
    for f in "$WORK"/*.out; do echo "--- $f"; cat "$f"; done
fi
exit "$FAILED"
