// A slot's long-lived Chrome, started by run.sh: `node lib/slot-chrome.js <file>`.
// Launches a Chrome the same way every test Chrome is launched, writes its
// DevTools endpoint to <file> (that is how run.sh knows it is ready) and stays
// alive until the Chrome goes away. If Chrome dies this process exits, so
// run.sh sees one thing to check (is this pid alive?) and replaces the pair.
// Cases reach the Chrome through TEST_CHROME_WS; see launch() in browser.js.

const fs = require('fs');
const { launchChrome } = require('./browser');

const file = process.argv[2];
const profile = process.argv[3];   // optional userDataDir, so run.sh can delete it after the kill
if (!file) { console.error('usage: node slot-chrome.js <endpoint file>'); process.exit(2); }

(async () => {
    const browser = await launchChrome(profile);
    browser.on('disconnected', () => process.exit(1));
    for (const sig of ['SIGINT', 'SIGTERM']) {
        process.on(sig, () => browser.close().finally(() => process.exit(0)));
    }
    // Written last and in one step, so a reader never sees half an endpoint.
    fs.writeFileSync(file + '.tmp', browser.wsEndpoint());
    fs.renameSync(file + '.tmp', file);
})().catch((err) => { console.error(err); process.exit(1); });
