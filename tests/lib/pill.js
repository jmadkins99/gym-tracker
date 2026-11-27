// How a case reads a PR pill the way a person or a screen reader meets it.
//
// The pill's text is split two ways, and a case should assert on the one it
// means: `visible` is what a sighted user reads (hidden-by-size text left
// out), `exposed` is what assistive tech reads (aria-hidden parts left out).
// A lone PR reads "PR" both ways; a streak shows "×N" but exposes "PR streak N".
//
// This source is injected into every page by launch() in browser.js, so a
// case calls `window.pillView(el)` inside page.evaluate without importing it.
// `flame` reports whether the drawn flame can actually be seen: the SVG has
// its flame path, that path's fill points at a gradient that exists in the
// document, the gradient has stops, and the SVG occupies a real box.
const PILL_JS = String.raw`
window.pillView = function (el) {
    const walk = (node, skip) => {
        if (node.nodeType === 3) return node.textContent;
        if (node.nodeType !== 1 || skip(node)) return '';
        return Array.from(node.childNodes).map((c) => walk(c, skip)).join('');
    };
    const tiny = (n) => { const r = n.getBoundingClientRect(); return r.width <= 2 && r.height <= 2; };
    const svg = el.querySelector('svg');
    let flame = null;
    if (svg) {
        const path = svg.querySelector('path');
        const m = path && /^url\(#(.+)\)$/.exec(path.getAttribute('fill') || '');
        const grad = m ? document.getElementById(m[1]) : null;
        const box = svg.getBoundingClientRect();
        flame = {
            hidden: svg.getAttribute('aria-hidden') === 'true',
            hasPath: !!path,
            gradientResolves: !!grad && grad.tagName.toLowerCase() === 'lineargradient'
                && grad.querySelectorAll('stop').length > 0,
            drawn: box.width > 0 && box.height > 0,
        };
    }
    return {
        visible: walk(el, (n) => n.tagName.toLowerCase() === 'svg' || tiny(n)).trim(),
        exposed: walk(el, (n) => n.getAttribute('aria-hidden') === 'true').trim(),
        role: el.getAttribute('role'),
        flame,
    };
};
// Every flame on the page at once: each one draws, and no two share a gradient id.
window.allFlames = function () {
    const svgs = Array.from(document.querySelectorAll('.pr-flame'));
    const ids = svgs.map((s) => s.querySelector('linearGradient') && s.querySelector('linearGradient').id);
    const views = svgs.map((s) => window.pillView(s.parentElement).flame);
    return {
        count: svgs.length,
        allDrawn: views.every((f) => f.hasPath && f.gradientResolves && f.drawn),
        uniqueIds: new Set(ids).size === ids.length && ids.every(Boolean),
    };
};
`;
module.exports = { PILL_JS };
