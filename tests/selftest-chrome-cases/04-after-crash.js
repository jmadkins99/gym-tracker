// Made-up case for check-runner.sh (TEST_SLOT_CHROME=1): runs right after
// 03-crash on the same slot, so it needs the replacement Chrome to work. Records
// the endpoint it ran on, like the storage cases.
const fs = require('fs');
const { launch } = require('../lib/browser');

fs.appendFileSync(process.env.SELFTEST_MARKER + '-ws', '04-after-crash ' + process.env.TEST_CHROME_WS + '\n');
(async () => {
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.goto('about:blank');
        console.log('selftest after-crash case: the replacement Chrome works');
    } finally {
        await browser.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
