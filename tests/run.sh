#!/usr/bin/env bash
# Test runner. Installs deps if missing, then runs every test case file
# in cases/ sequentially. Prints [PASS]/[FAIL] for each and exits non-zero
# on any failure.

set -u
cd "$(dirname "$0")"

# Install puppeteer-core etc. on first run.
if [ ! -d node_modules ]; then
    echo "Installing test dependencies..."
    npm install --silent --no-audit --no-fund
fi

FAIL=0
TOTAL=0
PASSED=0

for test in cases/*.js; do
    TOTAL=$((TOTAL + 1))
    name=$(basename "$test" .js)
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
echo "  $PASSED / $TOTAL passed"
echo "================================================"
exit $FAIL
