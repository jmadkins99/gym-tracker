// What this test covers
// ----------------------
// The header's Settings button is an outline gear drawn in the day's accent,
// on both the workout page and /weight (#31). On each page:
//
//   - there is exactly one .settings-btn, labelled aria-label="Settings" for
//     screen readers, with no visible text (the word "Settings" is gone);
//   - it holds one aria-hidden inline SVG, about 24 CSS px square, stroked and
//     not filled;
//   - the stroke is var(--accent-hi), checked against two different palettes
//     from the accent bank, so a hard-coded colour that happens to match one
//     day still fails on the other;
//   - clicking it still opens the Settings modal.
//
// The 59 CSS px tap size is case 152's job; it scans .settings-btn already.
//
// Mutation check: put the text "Settings" back in either button and the
// no-visible-text check names the page; give the gear a fixed stroke colour
// and the second palette's check fails; drop fill="none" and the outline
// check fails.

const { start } = require('../lib/server');
const { launch, attachConsole, waitForApp, waitFor, setNow } = require('../lib/browser');
const { seedPersonalApp } = require('../lib/state');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const NOW = '2026-11-23T10:00:00-07:00';

// Evaluated in the page: the button, its gear and the gear's resolved colours,
// with --accent-hi resolved to rgb() through a probe element so the two compare.
function readGear() {
    const btns = Array.from(document.querySelectorAll('.settings-btn'));
    if (btns.length !== 1) return { count: btns.length };
    const btn = btns[0];
    const svgs = btn.querySelectorAll('svg');
    const svg = svgs[0];
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent-hi)';
    document.body.appendChild(probe);
    const accentHi = getComputedStyle(probe).color;
    probe.remove();
    const shapes = svg ? Array.from(svg.querySelectorAll('path, circle')) : [];
    const r = svg ? svg.getBoundingClientRect() : null;
    return {
        count: 1,
        label: btn.getAttribute('aria-label'),
        text: btn.textContent.trim(),
        svgCount: svgs.length,
        hidden: svg ? svg.getAttribute('aria-hidden') : null,
        w: r ? r.width : 0,
        h: r ? r.height : 0,
        shapeCount: shapes.length,
        strokes: Array.from(new Set(shapes.map((s) => getComputedStyle(s).stroke))),
        fills: Array.from(new Set(shapes.map((s) => getComputedStyle(s).fill))),
        accentHi,
    };
}

async function checkPage(page, where) {
    const bank = await page.evaluate(() => window.accentColor.bank.map((p) => p.name));
    // Two palettes whose `hi` shades differ: Green and Orchid sit at opposite
    // ends of the hue wheel.
    for (const name of ['Green', 'Orchid']) {
        ok(bank.includes(name), where + ': the accent bank still has ' + name);
        await page.evaluate((n) => window.accentColor.apply(window.accentColor.bank.find((p) => p.name === n)), name);
        // .settings-btn eases its colour over 0.3s, so poll until the stroke
        // settles. On a timeout, fall through: the eq below names the colours.
        await waitFor(page, 'the gear to take the ' + name + ' accent', () => {
            const shape = document.querySelector('.settings-btn svg path');
            if (!shape) return false;
            const probe = document.createElement('span');
            probe.style.color = 'var(--accent-hi)';
            document.body.appendChild(probe);
            const want = getComputedStyle(probe).color;
            probe.remove();
            return getComputedStyle(shape).stroke === want;
        }).catch(() => {});
        const g = await page.evaluate(readGear);
        const at = where + ' (' + name + ')';
        eq(g.count, 1, at + ': one .settings-btn in the header');
        eq(g.label, 'Settings', at + ': the button is labelled "Settings" for screen readers');
        eq(g.text, '', at + ': the button shows no text, only the gear');
        eq(g.svgCount, 1, at + ': the button holds one SVG gear');
        eq(g.hidden, 'true', at + ': the gear is aria-hidden, so the label is what is read');
        ok(g.w >= 22 && g.w <= 26 && g.h >= 22 && g.h <= 26,
            at + ': the gear is about 24 CSS px (got ' + g.w.toFixed(1) + 'x' + g.h.toFixed(1) + ')');
        ok(g.shapeCount > 0, at + ': the gear has shapes to draw');
        eq(g.fills, ['none'], at + ': the gear is an outline, not filled');
        eq(g.strokes, [g.accentHi], at + ': the gear is stroked in var(--accent-hi)');
    }
    await page.click('.settings-btn');
    await waitFor(page, where + ' Settings modal', () => !!document.querySelector('.modal .modal-title'));
}

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        const errors = attachConsole(page);
        await setNow(page, NOW);
        await page.goto(server.url + '/index.html', { waitUntil: 'networkidle0' });
        await seedPersonalApp(page, {});
        await page.reload({ waitUntil: 'networkidle0' });
        await waitForApp(page);
        await checkPage(page, 'workout header');
        eq(errors, [], 'no console errors on the workout page');
        await page.close();

        const wpage = await browser.newPage();
        await wpage.setViewport({ width: 1280, height: 900 });
        const werrors = attachConsole(wpage);
        await setNow(wpage, NOW);
        await wpage.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        await waitFor(wpage, 'check-in', () => !!document.querySelector('.weigh-card'));
        await checkPage(wpage, 'weight header');
        eq(werrors, [], 'no console errors on the weight page');
        await wpage.close();

        console.log('PASS: both headers show an accent-stroked outline gear labelled Settings, and it opens Settings.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
