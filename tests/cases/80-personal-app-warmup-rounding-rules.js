// What this test covers
// ----------------------
// The two warmup rounding rules, exhaustively. No browser — this reads
// plateauLogic.js and drives the functions directly, so it runs in under a
// second and can afford to check several hundred weights instead of a handful.
//
// This REPLACES 28-personal-app-warmup-nearest10-rounding, which pinned a rule
// that no longer exists for either load type.
//
// The old rule rounded a warmup to the nearest 10 lb per side, halfway rounding
// down. On a two-sided machine that moved the total in 20 lb steps, so the
// percentage drifted a long way from its label — at 240 lb the "70%" warmup was
// 66.7% and the "90%" was 91.7% — and below about 60 lb the ramp collapsed
// entirely: at 60 lb two-sided the 90% warmup WAS the top set.
//
// Both load types now follow one idea: a warmup rounds to something you can set
// without thinking, and only the top set is exact.
//
//   PLATE-LOADED. Any number of 45s plus at most ONE each of 25, 10 and 5.
//   Stacking two of the same small plate is the fiddly part of loading a set
//   you do not care about, so 45+10+10 is never offered — 45+25 is, and it is
//   the same trip to the rack. Ties go to the load with fewer plates, which is
//   why a 65/side target becomes 70 rather than 60. That tie-break needs a
//   TOLERANCE rather than ===, because the target is a percentage of a decimal
//   weight and a real tie arrives as 109.99999999999999.
//
//   PIN-STACK. The stack moves in 5 lb steps, so every multiple of 10 is a real
//   pin position needing no plate at all. Rounding to the exact percentage
//   instead produced warmups like 141.25 lb: a micro-plate balanced on the pin.
//
// Micro-plates stay off warmups entirely under both rules. They exist to hit an
// exact working weight, which is the top set's job.
//
// The invariant worth more than any single number: A RAMP MUST ASCEND. Rounding
// to a coarse grid can push a warmup onto — or past — the set above it, and
// where no honest warmup exists the value is zero and the card leaves the row
// out rather than rendering 0 lbs.

const path = require('path');
const fs = require('fs');
const { eq, ok } = require('../lib/assert');

const PLATEAU_SRC = path.resolve(__dirname, '..', '..', 'js', 'plateauLogic.js');
const CONFIG_SRC = path.resolve(__dirname, '..', '..', 'js', 'config.js');

// Pull a top-level function out of the babel-script source and make it callable
// here. The file is a pile of globals with no exports, which is exactly what
// makes this possible.
function extract(source, name, deps = '') {
    const start = source.indexOf('function ' + name + '(');
    if (start === -1) throw new Error('could not find function ' + name);
    // Match to the closing brace at the same indentation the file uses.
    const end = source.indexOf('\n        }', start);
    if (end === -1) throw new Error('could not find the end of ' + name);
    const body = source.slice(start, end + '\n        }'.length);
    return new Function(deps + '\nreturn (' + body + ');')();
}

const src = fs.readFileSync(PLATEAU_SRC, 'utf8');
const configSrc = fs.readFileSync(CONFIG_SRC, 'utf8');

// PIN_STACK_CAPS is the one config value the pin breakdown reads.
const capsMatch = /const PIN_STACK_CAPS\s*=\s*(\{[\s\S]*?\});/.exec(configSrc);
ok(capsMatch, 'PIN_STACK_CAPS is still declared in config.js');
const capsDecl = 'const PIN_STACK_CAPS = ' + capsMatch[1] + ';';

const calculatePlateBreakdown = extract(src, 'calculatePlateBreakdown');
const calculatePinStackBreakdown = extract(src, 'calculatePinStackBreakdown', capsDecl);

const SMALLS = [25, 10, 5];

(async () => {
    // === 1. PLATE-LOADED: never two of the same small plate ===========
    let checked = 0;
    for (let total = 20; total <= 500; total += 2.5) {
        for (const loadType of ['plate-two-sided', 'plate-one-sided']) {
            const b = calculatePlateBreakdown(total, loadType);
            checked++;
            for (const key of ['warmup1', 'warmup2']) {
                const set = b[key];
                if (set.totalWeight <= 0) continue;
                for (const [plate, count] of Object.entries(set.plates)) {
                    if (SMALLS.indexOf(parseFloat(plate)) !== -1) {
                        eq(count <= 1, true,
                            `${total} ${loadType} ${key} asks for ${count} × ${plate} — a warmup ` +
                            'may repeat 45s but never a small plate');
                    }
                    eq(parseFloat(plate) >= 5, true,
                        `${total} ${loadType} ${key} put a ${plate} micro-plate on a warmup`);
                }
            }
        }
    }
    ok(checked > 300, `checked ${checked} plate-loaded weight/loadType combinations`);

    // === 2. PLATE-LOADED: the specific tie the rule turns on ===========
    // A 65/side target sits equally between 45+10+5 (three plates) and 45+25
    // (two). Fewer plates wins. Driven one-sided so 70% of the total IS the
    // per-side figure.
    const perSideFor = (target) =>
        calculatePlateBreakdown(target / 0.7, 'plate-one-sided').warmup1.perSideWeight;

    eq(perSideFor(65), 70, 'a 65/side target rounds to 70 (45+25), not 60 (45+10+5) — ' +
        'the tie goes to fewer plates');
    eq(perSideFor(110), 115, 'a 110/side target rounds to 115 (45+45+25), not 105 ' +
        '(45+45+10+5). This one only works with a tolerance on the tie test: the real ' +
        'tie arrives as 109.99999999999999 and === never fires');
    eq(perSideFor(20), 15, '20/side is not loadable at all (it needs two 10s) so it ' +
        'rounds to 15');
    eq(perSideFor(85), 85, '85/side IS loadable (45+25+10+5) and is left alone');
    eq(perSideFor(90), 90, 'and so is 90 (45+45)');

    // === 3. PIN-STACK: every warmup is a round pin position ============
    for (let total = 10; total <= 500; total += 1.25) {
        const b = calculatePinStackBreakdown(total, 'chest-press');
        for (const key of ['warmup1', 'warmup2']) {
            const set = b[key];
            if (set.totalWeight <= 0) continue;
            eq(set.totalWeight % 10, 0,
                `${total} ${key} = ${set.totalWeight}, which is not a multiple of 10 — the ` +
                'stack moves in 5 lb steps, so a warmup should never need a micro-plate');
        }
    }

    // The case that motivated it.
    eq(calculatePinStackBreakdown(201.25, 'chest-press').warmup1.totalWeight, 140,
        '201.25 warms up at 140, not the old 141.25 with a micro-plate on the pin');
    eq(calculatePinStackBreakdown(201.25, 'chest-press').warmup2.totalWeight, 180,
        'and at 180, not 181.25');

    // === 4. The top set is NEVER rounded away ==========================
    eq(calculatePlateBreakdown(287.5, 'plate-two-sided').topSet.totalWeight, 287.5,
        'a plate-loaded top set is the exact working weight, micro-plates and all');
    eq(calculatePinStackBreakdown(201.25, 'chest-press').topSet.totalWeight, 201.25,
        'and a pin top set keeps its precise position — that one IS the working weight');

    // === 5. THE INVARIANT: a ramp ascends ==============================
    for (let total = 10; total <= 500; total += 2.5) {
        const cases = [
            ['plate-two-sided', calculatePlateBreakdown(total, 'plate-two-sided')],
            ['plate-one-sided', calculatePlateBreakdown(total, 'plate-one-sided')],
            ['pin', calculatePinStackBreakdown(total, 'chest-press')],
        ];
        for (const [label, b] of cases) {
            const w1 = b.warmup1.totalWeight;
            const w2 = b.warmup2.totalWeight;
            const top = b.topSet.totalWeight;
            if (w2 > 0) {
                eq(w2 < top, true,
                    `${total} ${label}: warmup2 ${w2} reaches the top set ${top}. Under the old ` +
                    'rule this happened for every plate-loaded weight below about 60 lb');
            }
            if (w1 > 0 && w2 > 0) {
                eq(w1 < w2, true, `${total} ${label}: warmup1 ${w1} reaches warmup2 ${w2}`);
            }
            eq(w1 >= 0 && w2 >= 0, true,
                `${total} ${label}: a negative warmup means the step-down ran off the bottom`);
        }
    }

    // === 6. The percentages actually track their labels now ===========
    // Not exact — they cannot be, on a grid — but far closer than the old rule
    // managed, which ranged from 60% to 75% for its "70%".
    for (const [total, loadType] of [
        [240, 'plate-two-sided'],
        [400, 'plate-two-sided'],
        [165, 'plate-one-sided'],
        [200, 'pin'],
        [287.5, 'pin'],
    ]) {
        const b = loadType === 'pin'
            ? calculatePinStackBreakdown(total, 'chest-press')
            : calculatePlateBreakdown(total, loadType);
        const p1 = (b.warmup1.totalWeight / total) * 100;
        const p2 = (b.warmup2.totalWeight / total) * 100;
        eq(p1 > 63 && p1 < 77, true,
            `${total} ${loadType}: warmup1 landed at ${p1.toFixed(1)}%, too far from 70%`);
        eq(p2 > 84 && p2 < 95, true,
            `${total} ${loadType}: warmup2 landed at ${p2.toFixed(1)}%, too far from 90%`);
    }

    console.log('PASS: warmups round to something loadable, only the top set is exact, and every ramp ascends.');
})();
