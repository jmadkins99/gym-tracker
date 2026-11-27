// What this test covers
// ----------------------
// The harness itself: every page runs in America/Phoenix whatever the machine's
// zone is, setNow() pins the page's starting clock before any script runs
// (and keeps it across a reload), and tap() is a real, hit-tested click that
// an overlay can block. tap() also finds its target the ways cases need: by
// label (an exact string, or a RegExp with its flags honoured), by a plain
// Puppeteer selector, or as an ElementHandle; it waits for a target that
// appears late, and a miss names what it was looking for.

const { start } = require('../lib/server');
const { launch, setNow, tap } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq } = require('../lib/assert');

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        // 20:00 Monday in Phoenix is already Tuesday 03:00 in UTC.
        await setNow(page, '2026-11-23T20:00:00-07:00');
        await page.goto(server.url + '/index.html', { waitUntil: 'domcontentloaded' });
        const read = () => page.evaluate(() => {
            const d = new Date();
            return {
                zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                offset: d.getTimezoneOffset(),
                localDay: d.getDay(),
                localHour: d.getHours(),
                utcDay: d.getUTCDay(),
                dateNow: Math.abs(Date.now() - d.getTime()) < 1000,
                isDate: d instanceof Date && Object.prototype.toString.call(d) === '[object Date]',
            };
        });
        const got = await read();
        // The case's own process must agree with the page, or a fixture built
        // from Node's Date lands on another day than the app's (04:00 UTC).
        eq(new Date().getTimezoneOffset(), 420, 'the Node process runs in Phoenix time too');
        eq(Intl.DateTimeFormat().resolvedOptions().timeZone, 'America/Phoenix', 'Node reports Phoenix');
        eq(got.zone, 'America/Phoenix', 'pages run in Phoenix time');
        eq(got.offset, 420, 'Phoenix is UTC-7');
        eq([got.localDay, got.localHour, got.utcDay], [1, 20, 2], 'the clock says 8 p.m. Monday locally, Tuesday in UTC');
        eq([got.dateNow, got.isDate], [true, true], 'Date.now() agrees and the fake is still a Date');
        await page.reload({ waitUntil: 'domcontentloaded' });
        eq((await read()).localHour, 20, 'the pinned clock survives a reload');

        // tap(): a real click reaches a button, and an overlay on top blocks it.
        await page.setContent('<button id="b" style="position:absolute;left:10px;top:10px;width:80px;height:40px" ' +
            'onclick="window.hits=(window.hits||0)+1">go</button>');
        await tap(page, '#b');
        eq(await page.evaluate(() => window.hits), 1, 'tap() clicks the button');
        await page.evaluate(() => {
            const o = document.createElement('div');
            o.style.cssText = 'position:fixed;inset:0;background:transparent';
            document.body.appendChild(o);
        });
        await tap(page, '#b');
        eq(await page.evaluate(() => window.hits), 1, 'tap() is blocked by an overlay, as a thumb would be');

        // tap(page, selector, { text }): most cases find a button by its
        // label, so tap() can too. A string matches the trimmed text exactly,
        // a RegExp tests it, and the first match is tapped.
        await page.setContent(['Re-Edit', 'Edit', 'Save', 'Edit Plan'].map((t, i) =>
            `<button onclick="window.hit=${i}"> ${t} </button>`).join(''));
        await tap(page, 'button', { text: 'Edit' });
        eq(await page.evaluate(() => window.hit), 1, 'a string matches the whole trimmed label, not a part of it');
        await tap(page, 'button', { text: /Plan/ });
        eq(await page.evaluate(() => window.hit), 3, 'a RegExp tests the label');
        await tap(page, 'button', { text: /Edit/y });
        eq(await page.evaluate(() => window.hit), 1, 'a sticky RegExp keeps its meaning: anchored at the start');
        // Without text the selector is Puppeteer's, so its own syntax works.
        await tap(page, '::-p-text(Save)');
        eq(await page.evaluate(() => window.hit), 2, 'a Puppeteer selector still works when there is no text');
        // A button that appears later is waited for, not missed.
        await page.evaluate(() => setTimeout(() => { // allow-sync-wait: the late button under test
            document.body.insertAdjacentHTML('beforeend', '<button onclick="window.hit=9">Late</button>');
        }, 300));
        await tap(page, 'button', { text: 'Late' });
        eq(await page.evaluate(() => window.hit), 9, 'tap() waits for a matching button to appear');
        // A button only a case can pick out (the arrow in one named row) is
        // found with evaluateHandle and handed over as an ElementHandle.
        await tap(page, await page.evaluateHandle(() => document.querySelectorAll('button')[0]));
        eq(await page.evaluate(() => window.hit), 0, 'tap() takes an ElementHandle');
        let msg = '';
        try { await tap(page, 'button', { text: 'Nope', timeout: 200 }); } catch (err) { msg = err.message; }
        eq(/button with text "Nope"/.test(msg), true, 'a miss names the selector and the text: ' + msg);
        console.log('PASS: harness pins the time zone and clock, and tap() is a real click.');
    } finally {
        await browser.close();
        await server.stop();
    }
})().catch(err => {
    console.error('FAIL:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
