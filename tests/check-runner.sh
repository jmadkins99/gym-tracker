#!/usr/bin/env bash
# Runner self-test: runs run.sh as a whole process against the made-up cases in
# selftest-cases/ (through TEST_CASES_DIR) and checks exit codes, the printed
# summary and the files in the last-run folder. Runs in CI's guardrails job
# next to the other check-*.sh scripts, and by hand: `bash check-runner.sh`.
#
# It never touches the real tests/.last-run/: TEST_OUT_DIR points the runner at
# a temp folder.
#
# SEAMS for later tickets (see also the notes in run.sh):
#   - machine-wide lock (#45): done. runner() points TEST_LOCK_FILE into $WORK,
#     so the self-test never contends with a real suite; the lock sections are
#     at the end of this file.
#   - one Chrome per slot (#46): done, in the last section. The cases in
#     selftest-cases are plain node scripts and run without slot Chromes; the
#     ones in selftest-chrome-cases need Chrome and puppeteer-core (the runner
#     skips `npm install` for a custom cases folder, so install it first).

set -u
cd "$(dirname "$0")"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
FAILED=0

ok()   { echo "  ok   - $1"; }
fail() { echo "  FAIL - $1"; FAILED=1; }
section() { echo "$1"; }

# runner <label> [VAR=value ...] bash run.sh [args]
# Runs the command with the self-test env; output goes to $WORK/<label>.out and
# the exit code is left in $CODE.
CODE=0
# TEST_LOCK_FILE points the runner's machine-wide lock into $WORK, so the
# self-test never contends with (or leaves anything in) the real lock.
LOCK="$WORK/test.lock"
runner() {
    local label="$1"; shift
    env TEST_CASES_DIR=selftest-cases TEST_OUT_DIR="$WORK/out-$label" \
        TEST_JOBS=2 TEST_CASE_TIMEOUT=30 SELFTEST_MARKER="$WORK/marker-$label" \
        TEST_LOCK_FILE="$LOCK" TEST_LOCK_POLL=0.2 \
        "$@" > "$WORK/$label.out" 2>&1
    CODE=$?
}
# runner_bg <label> ...: same, in the background; the runner's pid is in $BG_PID.
# `exec` makes the background process the runner itself, so $BG_PID is the pid
# the runner records in the lock as its own $$.
BG_PID=0
runner_bg() {
    local label="$1"
    ( exec env TEST_CASES_DIR=selftest-cases TEST_OUT_DIR="$WORK/out-$label" \
        TEST_JOBS=2 TEST_CASE_TIMEOUT=30 SELFTEST_MARKER="$WORK/marker-$label" \
        TEST_LOCK_FILE="$LOCK" TEST_LOCK_POLL=0.2 \
        "${@:2}" > "$WORK/$label.out" 2>&1 ) &
    BG_PID=$!
}
lock_pid() { sed -n 's/^pid=//p' "$LOCK" 2>/dev/null; }
has() { grep -q -- "$2" "$WORK/$1.out"; }   # has <label> <fixed text>

section "mixed run: pass, fail and a flaky case"
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

section "a second run replaces the last-run folder"
echo stale > "$O/stale-file"
runner mixed bash run.sh 01
[ "$CODE" = 0 ] && ok "pattern run of the passing case exits 0" || fail "expected exit 0, got $CODE"
[ ! -e "$O/stale-file" ] && [ ! -e "$O/02-fail.log" ] && [ -f "$O/01-pass.log" ] && ok "old files gone, new file present" || fail "last-run folder was not replaced"

section "flaky case alone: the run passes"
runner flaky bash run.sh 03
[ "$CODE" = 0 ] && ok "exit 0 when the only problem is a flake" || fail "expected exit 0, got $CODE"
has flaky "FLAKY" && ok "FLAKY printed" || fail "FLAKY not printed"
rm -f "$WORK/marker-flaky2"
runner flaky2 GITHUB_ACTIONS=true bash run.sh 03
has flaky2 "::warning" && ok "CI annotation printed under GITHUB_ACTIONS" || fail "no ::warning annotation"

section "TEST_CASES guard"
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

section "TEST_SHARD"
runner shard TEST_SHARD=1/2 bash run.sh
# Shard 1/2 of {01,02,03} is 01 and 03; 02-fail is on shard 2.
[ "$CODE" = 0 ] && ok "shard 1/2 runs 01 and 03 and exits 0" || fail "shard 1/2 exit $CODE"
runner badshard TEST_SHARD=3/2 bash run.sh
[ "$CODE" != 0 ] && ok "bad TEST_SHARD rejected" || fail "bad TEST_SHARD accepted"

# ── machine-wide lock (#45) ──────────────────────────────────────────────────
# The holders below are made up: a lock file naming a live process (a sleep) or
# one that has already exited. $LOCK is in $WORK (see runner()).
# wait_for <label> <fixed text>: polls a background run's output for up to 15s.
wait_for() { local n; for n in $(seq 1 75); do has "$1" "$2" && return 0; sleep 0.2; done; return 1; }
write_lock() { printf 'repo=%s\npid=%s\nstarted=%s\n' "$1" "$2" "$3" > "$LOCK"; }   # write_lock <repo> <pid> <epoch>

section "no lock is left behind after runs that passed or failed"
[ ! -e "$LOCK" ] && ok "no lock file after the earlier runs, including failing ones" || fail "lock file left behind"

section "a run holds the lock while it runs, and SIGTERM releases it"
SLOW="$WORK/slow-cases"; mkdir -p "$SLOW"
echo "setTimeout(() => console.log('slow done'), 15000);" > "$SLOW/01-slow.js"
runner_bg holding TEST_CASES_DIR="$SLOW" bash run.sh
for n in $(seq 1 50); do [ -s "$LOCK" ] && break; sleep 0.2; done
if grep -q "^repo=$(basename "$(cd .. && pwd)")$" "$LOCK" && grep -q "^pid=$BG_PID$" "$LOCK" && grep -Eq "^started=[0-9]{9,}$" "$LOCK"; then
    ok "lock names the repo, the runner's own pid and the start time"
else
    fail "lock contents wrong (runner pid $BG_PID): $(cat "$LOCK" 2>/dev/null)"
fi
kill -TERM "$BG_PID" 2>/dev/null
for n in $(seq 1 50); do [ ! -e "$LOCK" ] && break; sleep 0.2; done
[ ! -e "$LOCK" ] && ok "lock file removed after SIGTERM" || fail "lock file left after SIGTERM"
wait "$BG_PID" 2>/dev/null
sleep 1
has holding "No such file" && fail "in-flight case kept running after SIGTERM (it wrote to the deleted scratch folder)" || ok "in-flight cases were stopped with the run"

section "a held lock: the second run prints the holder once, waits, then runs"
sleep 60 & HOLDER=$!
write_lock kanban "$HOLDER" "$(( $(date +%s) - 90 ))"
runner_bg waiter bash run.sh 01
wait_for waiter "Waiting for it to finish" && ok "run announced that it is waiting" || fail "no waiting message"
has waiter "kanban (pid $HOLDER)" && ok "message names the holder's repo and pid" || fail "holder not named"
sleep 1
[ ! -e "$WORK/out-waiter" ] && ok "no case started (no output folder yet) while the lock is held" || fail "run started while the lock was held"
rm -f "$LOCK"      # the holder lets go
wait "$BG_PID"; CODE=$?
{ [ "$CODE" = 0 ] && [ -f "$WORK/out-waiter/summary.txt" ]; } && ok "run went ahead once the lock was free" || fail "waiter did not run after release (exit $CODE)"
[ "$(grep -c "Waiting for it to finish" "$WORK/waiter.out")" = 1 ] && ok "holder was printed once" || fail "holder printed more than once"
[ ! -e "$LOCK" ] && ok "waiter released the lock when done" || fail "waiter left the lock"
kill "$HOLDER" 2>/dev/null

section "a refused run does not wait for a held lock"
sleep 60 & HOLDER=$!
write_lock kanban "$HOLDER" "$(date +%s)"
runner refused TEST_CASES= bash run.sh
{ [ "$CODE" != 0 ] && ! has refused "Waiting"; } && ok "guard refuses at once, without waiting" || fail "refused run waited or exited 0"
[ "$(lock_pid)" = "$HOLDER" ] && ok "the holder's lock is untouched" || fail "refused run changed the lock"
kill "$HOLDER" 2>/dev/null; rm -f "$LOCK"

section "a stale lock is taken over"
sleep 0.1 & DEAD=$!; wait "$DEAD" 2>/dev/null
write_lock kanban "$DEAD" "$(( $(date +%s) - 3600 ))"
runner stale bash run.sh 01
{ [ "$CODE" = 0 ] && has stale "stale test lock" && ! has stale "Waiting"; } && ok "stale lock taken over without waiting" || fail "stale lock not taken over (exit $CODE)"
[ ! -e "$LOCK" ] && ok "no lock left after the takeover run" || fail "lock left after the takeover run"
printf 'garbage\n' > "$LOCK"
runner garbage bash run.sh 01
{ [ "$CODE" = 0 ] && [ ! -e "$LOCK" ]; } && ok "a lock file with no pid counts as stale" || fail "garbage lock blocked the run (exit $CODE)"

# ── one Chrome per slot (#46) ────────────────────────────────────────────────
# Real Chrome cases (selftest-chrome-cases/), so this part needs puppeteer-core
# (npm install in tests/) and a Chrome; CI's guardrails job has both. One slot
# (TEST_JOBS=1) puts every case on the same Chrome, in order:
#   01 and 02: same origin, same Chrome, must not see each other's storage
#   03: crashes the slot's Chrome on its first attempt
#   04: runs next on the slot, and needs the replacement Chrome
section "cases on one slot's Chrome: separate storage, and a killed Chrome is replaced"
PORT=$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})")
runner chrome TEST_CASES_DIR=selftest-chrome-cases TEST_SLOT_CHROME=1 TEST_JOBS=1 SELFTEST_PORT="$PORT" bash run.sh
[ "$CODE" = 0 ] && ok "run with a crashed Chrome exits 0" || fail "chrome run exit $CODE"
WS="$WORK/marker-chrome-ws"
W1=$(sed -n 's/^01-storage-a //p' "$WS"); W2=$(sed -n 's/^02-storage-b //p' "$WS"); W4=$(sed -n 's/^04-after-crash //p' "$WS")
{ [ -n "$W1" ] && [ "$W1" = "$W2" ]; } && ok "01 and 02 ran on the same slot Chrome" || fail "01 and 02 did not share a Chrome ($W1 / $W2)"
grep -q "storage was empty" "$WORK/out-chrome/01-storage-a.log" && grep -q "storage was empty" "$WORK/out-chrome/02-storage-b.log" \
    && ok "each case found the storage empty (the other's was in another context)" || fail "storage leaked between cases on one Chrome"
grep -q "^RESULT: PASS" "$WORK/out-chrome/02-storage-b.log" && ok "02 passed" || fail "02 did not pass"
grep -q "^FLAKY" "$WORK/out-chrome/summary.txt" && grep -q "03-crash" "$WORK/out-chrome/summary.txt" && ok "the case on the crashed Chrome failed once and was retried (FLAKY)" || fail "03-crash was not retried to a pass"
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
