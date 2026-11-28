// Made-up case for check-runner.sh: fails on its first attempt, passes on the
// retry. The marker file (SELFTEST_MARKER) is how it knows it already ran.
const fs = require('fs');
const marker = process.env.SELFTEST_MARKER;
if (!marker) { console.error('SELFTEST_MARKER not set'); process.exit(1); }
if (fs.existsSync(marker)) { console.log('selftest flaky case: second attempt passes'); process.exit(0); }
fs.writeFileSync(marker, 'ran');
console.error('SELFTEST-FLAKY-MARKER first attempt fails');
process.exit(1);
