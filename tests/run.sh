#!/usr/bin/env bash
# Test runner. Installs deps if missing, then runs every test case file
# in cases/ sequentially. Prints [PASS]/[FAIL] for each and exits non-zero
# on any failure.

set -u
cd "$(dirname "$0")"

# Optional filter: `bash run.sh 42` runs just case 42, `bash run.sh personal-app`
# runs every personal-app case. Matched as a substring of the case name.
PATTERN="${1:-}"

# Install puppeteer-core etc. on first run.
if [ ! -d node_modules ]; then
    echo "Installing test dependencies..."
    npm install --silent --no-audit --no-fund
fi

FAIL=0
TOTAL=0
PASSED=0

if [ -n "$PATTERN" ]; then
    echo "Filter: only cases matching \"$PATTERN\""
    echo
fi

for test in cases/*.js; do
    name=$(basename "$test" .js)
    case "$name" in
        *"$PATTERN"*) ;;
        *) continue ;;
    esac
    TOTAL=$((TOTAL + 1))
    printf "▶ %s ... " "$name"
    if output=$(node "$test" 2>&1); then
        echo "PASS"
        PASSED=$((PASSED + 1))
    else
        echo "FAIL"
        echo "─── output ──────────────────────────────────"
        echo "$output" | sed 's/^/    /'
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
