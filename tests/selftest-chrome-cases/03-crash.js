// Made-up case for check-runner.sh (TEST_SLOT_CHROME=1).
// First attempt: crashes its slot's Chrome and must SEE it go away. If Chrome
// survives Browser.crash the case fails with SELFTEST-CRASH-FAILED, which the
// self-test reports as a failure of the check itself. Seeing it go away is
// logged as SELFTEST-CRASH-CONFIRMED, and the attempt exits 1 (the case "failed
// because its Chrome died").
// Retry: connects to the Chrome it was given, opens a page and records the
// endpoint in SELFTEST_MARKER-ws, so the self-test can check the retry ran on a
// live Chrome that is not the one that crashed.
const fs = require('fs');
const { launch } = require('../lib/browser');

const marker = process.env.SELFTEST_MARKER + '-crash';
const retrying = fs.existsSync(marker);
fs.appendFileSync(process.env.SELFTEST_MARKER + '-ws', (retrying ? '03-crash-retry ' : '03-crash ') + process.env.TEST_CHROME_WS + '\n');
fs.writeFileSync(marker, 'ran');

(async () => {
    const context = await launch();
    if (retrying) {
        try {
            const page = await context.newPage();
            await page.goto('about:blank');
            console.log('selftest crash case: the retry ran on a live Chrome');
        } finally {
            await context.close();
        }
        return;
    }
    const browser = context.browser();
    const gone = new Promise(resolve => browser.once('disconnected', () => resolve('gone')));
    const survived = new Promise(resolve => setTimeout(() => resolve('survived'), 30000));
    const cdp = await browser.target().createCDPSession();
    cdp.send('Browser.crash').catch(() => {});
    if (await Promise.race([gone, survived]) !== 'gone') {
        console.error('SELFTEST-CRASH-FAILED Chrome survived Browser.crash');
        process.exit(3);
    }
    console.error('SELFTEST-CRASH-CONFIRMED the slot Chrome crashed');
    process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
