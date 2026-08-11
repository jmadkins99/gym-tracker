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
// itself rather than feeling like nine different apps.
(function () {
    'use strict';

    // Six shades on one lightness ramp — deep 25.5%, accent 32.9%, hi 38.8%,
    // soft 44.6%, muted 50.3%, pale 61.2% — each holding the original purple's
    // exact OKLCH lightness and chroma (C 0.061-0.083) and rotating hue only.
    // That is what makes every entry read as equally dark and equally
    // desaturated: hues picked by eye at these lightnesses drift brighter and
    // muddier apart from each other. It also means no palette is ever harder to
    // read than the purple was. Violet (hue 300) is the original #3a2a5a to
    // within a hair.
    //
    // The personal app references four of the six; the public app also uses
    // `soft` (a gradient hover) and `pale` (italic hint text). Both ship all six
    // so this module stays identical across the two repos and the banks cannot
    // drift apart.
    //
    // `rgb` is the accent as a bare triple, for the one place that needs it
    // inside an rgba() — the header's shadow.
    var BANK = [
        { name: 'Green',   deep: '#002b18', accent: '#09411c', hi: '#1d502d', soft: '#2f613d', muted: '#40714e', pale: '#61916e', rgb: '9, 65, 28' },
        { name: 'Sea',     deep: '#00292a', accent: '#013e3c', hi: '#02504d', soft: '#02615f', muted: '#1e726f', pale: '#489290', rgb: '1, 62, 60' },
        { name: 'Teal',    deep: '#002832', accent: '#003d46', hi: '#004e5a', soft: '#015f6e', muted: '#216f7f', pale: '#4a8f9f', rgb: '0, 61, 70' },
        { name: 'Steel',   deep: '#00253e', accent: '#013a53', hi: '#034b69', soft: '#1f5b7a', muted: '#336b8a', pale: '#568bab', rgb: '1, 58, 83' },
        { name: 'Blue',    deep: '#142140', accent: '#15355f', hi: '#26456f', soft: '#375580', muted: '#486590', pale: '#6885b0', rgb: '21, 53, 95' },
        { name: 'Indigo',  deep: '#211d3e', accent: '#2c2f5f', hi: '#3c3f6f', soft: '#4b4f7f', muted: '#5b5f8f', pale: '#7b7fb0', rgb: '44, 47, 95' },
        { name: 'Violet',  deep: '#2b1939', accent: '#3c2959', hi: '#4c3969', soft: '#5c4979', muted: '#6c5989', pale: '#8c79a9', rgb: '60, 41, 89' },
        { name: 'Plum',    deep: '#331630', accent: '#49254e', hi: '#59355e', soft: '#69446d', muted: '#7a557d', pale: '#9a759d', rgb: '73, 37, 78' },
        { name: 'Orchid',  deep: '#381526', accent: '#522140', hi: '#62314e', soft: '#73415e', muted: '#84526d', pale: '#a5728d', rgb: '82, 33, 64' }
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
    // guarantees you see all nine before any repeat.
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
        s.setProperty('--accent-soft', palette.soft);
        s.setProperty('--accent-muted', palette.muted);
        s.setProperty('--accent-pale', palette.pale);
        s.setProperty('--accent-deep', palette.deep);
        s.setProperty('--accent-rgb', palette.rgb);
    }

    apply(paletteFor(new Date()));

    // Exposed for the favicon tint in index.html, and so a console poke can
    // preview any day: window.accentColor.apply(window.accentColor.bank[3]).
    window.accentColor = { bank: BANK, paletteFor: paletteFor, apply: apply };
}());
