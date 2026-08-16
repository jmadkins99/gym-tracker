// Serves the apps' CDN libraries from tests/node_modules instead of the network.
//
// Both apps load React, ReactDOM and @babel/standalone from unpkg in a plain
// <script> tag, and the public app additionally pulls Chart.js from jsDelivr.
// That is fine in a browser on a phone, but it makes the test suite depend on
// outbound HTTPS to third-party CDNs — and in a sandboxed CI container that
// egress is often blocked outright, in which case every browser case dies at
// `waitForApp` with nothing but a selector timeout to explain it, or trips the
// `no console errors` assertion that most cases end with.
//
// So we intercept those requests and answer them from disk. Neither app's
// index.html changes: production is untouched, and the suite becomes hermetic.
//
// The versions in package.json must track the versions the apps request.
// react@^18 is pinned deliberately — React 19 dropped the UMD builds entirely,
// so react/umd/react.production.min.js would simply not exist. @babel/standalone
// is pinned to ^7 for the same reason in reverse: it has since moved to 8.x
// while index.html still asks for 7, and serving a version the live app does
// not use would make the suite lie about what ships.

const fs = require('fs');
const path = require('path');

const NODE_MODULES = path.join(__dirname, '..', 'node_modules');

// Keyed by "hostname + pathname", so a version drift in either app's
// index.html surfaces as a loud 502 rather than silently falling through to a
// network request that may or may not be reachable.
const CDN_MAP = {
    'unpkg.com/react@18/umd/react.production.min.js': 'react/umd/react.production.min.js',
    'unpkg.com/react-dom@18/umd/react-dom.production.min.js': 'react-dom/umd/react-dom.production.min.js',
    'unpkg.com/@babel/standalone@7/babel.min.js': '@babel/standalone/babel.min.js',
    // Public app only. The npm package ships no minified UMD build, so this
    // serves the unminified one — same library, same version, and the tests
    // care about behaviour rather than byte count.
    'cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js': 'chart.js/dist/chart.umd.js',
};

const CDN_HOSTS = new Set(['unpkg.com', 'cdn.jsdelivr.net']);

// Firebase's SDK host is deliberately NOT mapped. Both apps gate their SDK
// load on the namespace and make zero gstatic requests under 'gym-local:',
// which is what the tests run in — and cases 36/38 assert exactly that. A
// mapping here would hide a regression in that gating.

// Fail at setup time, not request time. An interception that never resolves
// hangs `waitUntil: 'networkidle0'` until timeout with no useful message.
function assertVendored() {
    const missing = Object.values(CDN_MAP).filter(
        rel => !fs.existsSync(path.join(NODE_MODULES, rel)));
    if (missing.length) {
        throw new Error(
            'Vendored CDN libraries are missing:\n  ' + missing.join('\n  ') +
            '\nRun: cd tests && npm install');
    }
}

async function installCdnShim(page) {
    assertVendored();
    await page.setRequestInterception(true);
    page.on('request', req => {
        let url;
        try { url = new URL(req.url()); } catch (_) { return req.continue(); }
        if (!CDN_HOSTS.has(url.hostname)) return req.continue();

        const rel = CDN_MAP[url.hostname + url.pathname];
        if (!rel) {
            // Loud, not silent: a 502 shows up as a console error that
            // attachConsole records, naming the URL we failed to map.
            return req.respond({
                status: 502,
                contentType: 'text/plain',
                body: 'unmapped CDN url: ' + req.url(),
            });
        }
        req.respond({
            status: 200,
            contentType: 'application/javascript',
            // react and react-dom are loaded with `crossorigin`, so their
            // requests are CORS-mode. Without this header Chrome rejects the
            // synthetic response and reports only a bare "Failed to load
            // resource". Set unconditionally — babel does not need it.
            headers: { 'Access-Control-Allow-Origin': '*' },
            body: fs.readFileSync(path.join(NODE_MODULES, rel)),
        });
    });
}

module.exports = { installCdnShim, CDN_MAP };
