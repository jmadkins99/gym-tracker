// Serves the three unpkg.com libraries from tests/node_modules instead of the
// network.
//
// Both apps load React, ReactDOM and @babel/standalone from unpkg in a plain
// <script> tag. That is fine in a browser on a phone, but it makes the test
// suite depend on outbound HTTPS to a third-party CDN — and in a sandboxed CI
// container that egress is often blocked outright, in which case every browser
// case dies at `waitForApp` with nothing but a selector timeout to explain it.
//
// So we intercept those three requests and answer them from disk. index.html
// keeps its CDN tags: production is untouched, and the suite becomes hermetic.
//
// The versions in package.json must track the versions index.html requests.
// react@^18 is pinned deliberately — React 19 dropped the UMD builds entirely,
// so react/umd/react.production.min.js would simply not exist. @babel/standalone
// is pinned to ^7 for the same reason in reverse: it has since moved to 8.x
// while index.html still asks for 7, and serving a version the live app does
// not use would make the suite lie about what ships.

const fs = require('fs');
const path = require('path');

const NODE_MODULES = path.join(__dirname, '..', 'node_modules');

// Keyed by URL pathname, so a version drift in index.html surfaces as a loud
// 502 rather than silently falling through to a blocked network request.
const CDN_MAP = {
    '/react@18/umd/react.production.min.js': 'react/umd/react.production.min.js',
    '/react-dom@18/umd/react-dom.production.min.js': 'react-dom/umd/react-dom.production.min.js',
    '/@babel/standalone@7/babel.min.js': '@babel/standalone/babel.min.js',
};

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
        if (url.hostname !== 'unpkg.com') return req.continue();

        const rel = CDN_MAP[url.pathname];
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
