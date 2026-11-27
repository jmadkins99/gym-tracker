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
#   - machine-wide lock (#45): the runner should take its lock file path from
#     an env var that runner() below points into $WORK, so the self-test never
#     contends with a real suite. Add the "waits and reports the holder" and
#     "stale lock is taken over" checks as new `section` blocks.
#   - one Chrome per slot (#46): add a second cases folder with two Chrome
#     cases that write and read storage, and check they don't see each other's
#     data. The cases here are plain node scripts, so this self-test needs no
#     Chrome (and the runner skips `npm install` for a custom cases folder).

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
runner() {
    local label="$1"; shift
    env TEST_CASES_DIR=selftest-cases TEST_OUT_DIR="$WORK/out-$label" \
        TEST_JOBS=2 TEST_CASE_TIMEOUT=30 SELFTEST_MARKER="$WORK/marker-$label" \
        "$@" > "$WORK/$label.out" 2>&1
    CODE=$?
}
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

echo
if [ "$FAILED" = 0 ]; then
    echo "runner self-test: all checks passed"
else
    echo "runner self-test: FAILED. Runner outputs follow."
    for f in "$WORK"/*.out; do echo "--- $f"; cat "$f"; done
fi
exit "$FAILED"
