// Minimal static HTTP server. Used to serve the gym apps for browser tests.
// Each test launches its own server on a free port so concurrent tests
// don't collide.

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.jsx':  'application/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
};

function start({ root, port = 0 } = {}) {
    if (!root) throw new Error('start({root}) requires a root directory');

    const server = http.createServer((req, res) => {
        const urlPath = decodeURIComponent(req.url.split('?')[0]);
        let filePath = path.join(root, urlPath === '/' ? '/index.html' : urlPath);

        // Prevent path traversal outside root
        if (!filePath.startsWith(path.resolve(root))) {
            res.writeHead(403); res.end('forbidden'); return;
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404); res.end('not found'); return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
            res.end(data);
        });
    });

    return new Promise((resolve, reject) => {
        server.listen(port, '127.0.0.1', () => {
            const addr = server.address();
            resolve({
                url: `http://127.0.0.1:${addr.port}`,
                port: addr.port,
                stop: () => new Promise(r => server.close(r)),
            });
        });
        server.on('error', reject);
    });
}

module.exports = { start };
