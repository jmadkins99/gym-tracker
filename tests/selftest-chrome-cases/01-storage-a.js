// Made-up case for check-runner.sh (TEST_SLOT_CHROME=1). 01 and 02 run one
// after the other on the same slot's Chrome and the same origin (a fixed port,
// SELFTEST_PORT) and must not see each other's storage: each finds the
// storage empty, writes a value and leaves it behind when it closes. Each
// records the Chrome endpoint it ran on (TEST_CHROME_WS) in SELFTEST_MARKER-ws,
// so the self-test can check they really did share one Chrome.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { launch } = require('../lib/browser');

// 02-storage-b.js just requires this file, so the name comes from what node ran.
const NAME = path.basename(process.argv[1], '.js');
const port = Number(process.env.SELFTEST_PORT);
fs.appendFileSync(process.env.SELFTEST_MARKER + '-ws', NAME + ' ' + process.env.TEST_CHROME_WS + '\n');

(async () => {
    const server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>t</title>'); });
    await new Promise(r => server.listen(port, '127.0.0.1', r));
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.goto('http://127.0.0.1:' + port + '/');
        const before = await page.evaluate(() => localStorage.getItem('selftest-key'));
        if (before !== null) throw new Error(NAME + ' saw storage left by an earlier case: ' + before);
        await page.evaluate((n) => localStorage.setItem('selftest-key', n), NAME);
        console.log(NAME + ': storage was empty, wrote my own');
    } finally {
        await browser.close();
        server.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
