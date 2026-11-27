// Made-up case for check-runner.sh (TEST_SLOT_CHROME=1): crashes its slot's
// Chrome on the first attempt (so it fails), and passes on the retry. The
// self-test checks that the next case on the slot got a fresh Chrome and
// passed, and that this case ends up FLAKY, not FAIL.
const fs = require('fs');
const { launch } = require('../lib/browser');

const marker = process.env.SELFTEST_MARKER + '-crash';
if (fs.existsSync(marker)) { console.log('selftest crash case: retry passes'); process.exit(0); }
fs.writeFileSync(marker, 'ran');

(async () => {
    const context = await launch();
    const cdp = await context.browser().target().createCDPSession();
    console.error('SELFTEST-CRASH-MARKER crashing the slot Chrome');
    await cdp.send('Browser.crash');
    await new Promise(r => setTimeout(r, 10000));   // never reached: the connection drops
    process.exit(0);
})().catch((e) => { console.error('lost the Chrome:', e.message); process.exit(1); });
