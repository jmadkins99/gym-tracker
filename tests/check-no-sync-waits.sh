#!/usr/bin/env bash
# Ratchet for new test code. A line ADDED to tests/cases/*.js since the
# merge-base with origin/main must not contain
#   - a synthetic DOM .click() (skips hit-testing, so a tap an overlay blocks
#     still passes; use tap() from lib/browser.js, a real click), or
#   - a fixed sleep: sleep(, setTimeout( or waitForTimeout (they race and slow
#     the suite; use waitFor() from lib/browser.js, which polls).
# Lines already on main are left alone, so existing cases stay as they are
# until a later ticket migrates them.
#
# An awaited .click() outside any arrow function or evaluate() is a puppeteer
# click (page.click(), handle.click()), which is real, so it passes; a DOM
# click inside page.evaluate is not. Compares the working tree (uncommitted
# and untracked cases included). CACHE_BUST_BASE overrides the base ref, as in
# check-cache-bust.sh.
set -u
ROOT="$(git rev-parse --show-toplevel)" || exit 1
cd "$ROOT"
BASE_REF="${CACHE_BUST_BASE:-origin/main}"
if ! BASE="$(git merge-base HEAD "$BASE_REF" 2>/dev/null)"; then
    echo "no-sync-waits: no $BASE_REF to compare with (CI must fetch full history); FAIL"
    exit 1
fi

FAIL=0
report() { # <file> <line text>
    echo "no-sync-waits: added line in $1: $(echo "$2" | sed -E 's/^[[:space:]]+//')"
    FAIL=1
}

# True when the line is a banned one: a fixed sleep, or a .click() that is not
# an awaited puppeteer click.
bad_line() {
    echo "$1" | grep -qE 'sleep\(|setTimeout\(|waitForTimeout' && return 0
    echo "$1" | grep -qE '\.click\(\)' || return 1
    # Real click: awaited, and not inside an arrow function or evaluate().
    echo "$1" | grep -qE 'await ' && ! echo "$1" | grep -qE '=>|evaluate' && return 1
    return 0
}

# Added lines of tracked cases, with the file each belongs to.
file=""
while IFS= read -r row; do
    case "$row" in
        '+++ b/'*) file="${row#+++ b/}" ;;
        '+++'*|'---'*) ;;
        '+'*) bad_line "${row#+}" && report "${file:-?}" "${row#+}" ;;
    esac
done < <(git diff -U0 --no-color --no-renames "$BASE" -- 'tests/cases/*.js')

# Brand-new case files git does not track yet: every line is an added line.
while IFS= read -r file; do
    while IFS= read -r text; do
        bad_line "$text" && report "$file" "$text"
    done < "$file"
done < <(git ls-files --others --exclude-standard -- 'tests/cases/*.js')

[ "$FAIL" = 0 ] && echo "no-sync-waits: OK (no added DOM .click() or fixed sleep in tests/cases)"
exit $FAIL
