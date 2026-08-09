// Daily accent rotation.
//
// The app's accent is a four-shade family that the whole UI hangs off: the LOG
// and Weight Breakdown buttons, the active day/nav pills, section titles, the
// gear, the Submit Day button. This file picks one palette per calendar day and
// publishes it as CSS custom properties on <html>; every consumer reads
// var(--accent) and friends, so nothing else needs to know a rotation exists.
//
// Plain script, not text/babel, and loaded in <head> before the stylesheet:
// Babel transforms its inputs asynchronously, so a palette applied from a .jsx
// file would land a frame or two after first paint and flash the default purple
// on every load. Setting the properties during head parsing avoids that —
// document.documentElement already exists at that point.
//
// Backgrounds are deliberately NOT part of the family. They stay the same
// near-black violet on every day, which is what keeps the app recognisable as
// itself rather than feeling like ten different apps.
(function () {
    'use strict';

    // Each palette holds the original purple's exact OKLCH lightness and chroma
    // — L 25.5/32.9/38.8/50.3%, C 0.061-0.083 — and rotates hue only. That is
    // what makes every entry read as equally dark and equally desaturated; hues
    // picked by eye at these lightnesses drift brighter and muddier apart from
    // each other. Violet (hue 300) is the original #3a2a5a to within a hair.
    //
    // `rgb` is the accent as a bare triple, for the one place that needs it
    // inside an rgba() — the header's shadow.
    var BANK = [
        { name: 'Crimson', deep: '#3b1511', accent: '#582023', hi: '#693131', muted: '#8b5250', rgb: '88, 32, 35' },
        { name: 'Green',   deep: '#002b18', accent: '#09411c', hi: '#1d502d', muted: '#40714e', rgb: '9, 65, 28' },
        { name: 'Sea',     deep: '#00292a', accent: '#013e3c', hi: '#02504d', muted: '#1e726f', rgb: '1, 62, 60' },
        { name: 'Teal',    deep: '#002832', accent: '#003d46', hi: '#004e5a', muted: '#216f7f', rgb: '0, 61, 70' },
        { name: 'Steel',   deep: '#00253e', accent: '#013a53', hi: '#034b69', muted: '#336b8a', rgb: '1, 58, 83' },
        { name: 'Blue',    deep: '#142140', accent: '#15355f', hi: '#26456f', muted: '#486590', rgb: '21, 53, 95' },
        { name: 'Indigo',  deep: '#211d3e', accent: '#2c2f5f', hi: '#3c3f6f', muted: '#5b5f8f', rgb: '44, 47, 95' },
        { name: 'Violet',  deep: '#2b1939', accent: '#3c2959', hi: '#4c3969', muted: '#6c5989', rgb: '60, 41, 89' },
        { name: 'Plum',    deep: '#331630', accent: '#49254e', hi: '#59355e', muted: '#7a557d', rgb: '73, 37, 78' },
        { name: 'Orchid',  deep: '#381526', accent: '#522140', hi: '#62314e', muted: '#84526d', rgb: '82, 33, 64' }
    ];

    // Days are numbered off the *local* calendar date, not Date.now()/86400000.
    // The latter counts UTC days, which would flip the color mid-evening rather
    // than at midnight.
    function dayIndex(date) {
        return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
    }

    function mulberry32(a) {
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            var t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // Deterministic shuffle of the whole bank, one per cycle of BANK.length days.
    // Shuffling a full permutation rather than picking at random is what
    // guarantees you see all ten before any repeat.
    function shuffle(cycle, n) {
        var idx = [], rnd = mulberry32(Math.imul(cycle, 2654435761) >>> 0), i, j, t;
        for (i = 0; i < n; i++) idx.push(i);
        for (i = n - 1; i > 0; i--) {
            j = Math.floor(rnd() * (i + 1));
            t = idx[i]; idx[i] = idx[j]; idx[j] = t;
        }
        return idx;
    }

    // A plain per-cycle shuffle still lets the last color of one cycle repeat as
    // the first of the next (~1 boundary in n). Swapping the first two entries
    // breaks that run. Only one level of lookback is needed to be exact: for
    // n > 2, swapping positions 0 and 1 can never change position n-1, so the
    // previous cycle's last entry is the same whether or not it was corrected.
    function orderForCycle(cycle, n) {
        var idx = shuffle(cycle, n), t;
        if (cycle > 0 && n > 2 && idx[0] === shuffle(cycle - 1, n)[n - 1]) {
            t = idx[0]; idx[0] = idx[1]; idx[1] = t;
        }
        return idx;
    }

    function paletteFor(date) {
        var n = BANK.length, day = dayIndex(date), cycle = Math.floor(day / n);
        return BANK[orderForCycle(cycle, n)[((day % n) + n) % n]];
    }

    function apply(palette) {
        var s = document.documentElement.style;
        s.setProperty('--accent', palette.accent);
        s.setProperty('--accent-hi', palette.hi);
        s.setProperty('--accent-muted', palette.muted);
        s.setProperty('--accent-deep', palette.deep);
        s.setProperty('--accent-rgb', palette.rgb);
    }

    apply(paletteFor(new Date()));

    // Exposed for the favicon tint in index.html, and so a console poke can
    // preview any day: window.accentColor.apply(window.accentColor.bank[3]).
    window.accentColor = { bank: BANK, paletteFor: paletteFor, apply: apply };
}());
