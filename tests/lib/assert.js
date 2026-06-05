// Tiny assertion helpers. Throw on failure — the test runner sees the
// non-zero exit code and reports the case as a [FAIL].

function eq(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
        throw new Error(`${msg || 'assertEq'}\n  expected: ${e}\n  actual:   ${a}`);
    }
}

function ok(cond, msg) {
    if (!cond) throw new Error(msg || 'assertOk: condition was falsy');
}

function contains(haystack, needle, msg) {
    if (!String(haystack).includes(needle)) {
        throw new Error(`${msg || 'assertContains'}\n  expected to contain: ${JSON.stringify(needle)}\n  actual: ${JSON.stringify(haystack)}`);
    }
}

module.exports = { eq, ok, contains };
