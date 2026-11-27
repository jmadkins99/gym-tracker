#!/usr/bin/env bash
# Cache-bust guardrail. index.html and weight/index.html load local assets with
# ?v=N query strings. An asset whose content changed since the merge-base with
# origin/main must have a different ?v= in each HTML file that loads it,
# otherwise a browser with a stale cache runs new HTML against an old script
# (PR #34 added PRPill.jsx without a bump: a ReferenceError on stale caches).
# A newly added asset, or a newly added tag, counts as bumped.
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

# Reads an HTML file on stdin; prints "<repo-relative asset path> <N>" for
# every local tag with ?v=N. $1 is the HTML file's directory.
list() {
    grep -oE '(src|href)="[^"]+\?v=[0-9]+"' |
    sed -E 's/^(src|href)="([^"?]+)\?v=([0-9]+)"$/\2 \3/' |
    while read -r rel n; do
        p="$rel"
        if [ "$1" != "." ]; then
            # Only one level of ../ is used (weight/ -> repo root).
            case "$rel" in
                ../*) p="${rel#../}" ;;
                *) p="$1/$rel" ;;
            esac
        fi
        echo "$p $n"
    done
}

FAIL=0
for html in index.html weight/index.html; do
    dir="$(dirname "$html")"
    git cat-file -e "$BASE:$html" 2>/dev/null || continue # new page: all new
    OLD="$(git show "$BASE:$html" | list "$dir")"
    while read -r asset n; do
        [ -f "$asset" ] || continue
        old_n="$(echo "$OLD" | awk -v a="$asset" '$1==a {print $2; exit}')"
        [ -z "$old_n" ] && continue # new tag: counts as bumped
        old_blob="$(git rev-parse -q --verify "$BASE:$asset" 2>/dev/null)" || continue # new asset
        [ "$(git hash-object "$asset")" = "$old_blob" ] && continue # unchanged
        if [ "$old_n" = "$n" ]; then
            echo "cache-bust: $asset changed since $(git rev-parse --short "$BASE") but $html still says ?v=$n; bump it"
            FAIL=1
        fi
    done < <(list "$dir" < "$html")
done
[ "$FAIL" = 0 ] && echo "cache-bust: OK (every changed asset has a new ?v=)"
exit $FAIL
