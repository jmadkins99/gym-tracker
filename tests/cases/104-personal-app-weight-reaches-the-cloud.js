// What this test covers
// ----------------------
// Multi-device sync for the WEIGHT page, added September 2026. The weight app
// shipped as localStorage-only; this pins the contract now that it goes through
// the same repo seam as the workout app.
//
// Four things, and the last two are the reason this case exists at all — they
// are the two places where "just point it at Firestore" would have been wrong:
//
//   1. The tree. One document per calendar day at users/{uid}/weightLog/{day}.
//      The day IS the id, unlike workouts, which have to invent an entryId
//      because their `date` gets rewritten on every log tap. That means a
//      correction rewrites the day it corrects and a deletion deletes it,
//      rather than accumulating a second document for the same morning.
//
//   2. The plan's three states. undefined is "never had one" and takes the
//      workbook default; null is "deliberately cleared" and must STAY cleared.
//      Firestore cannot store a null document, so the plan doc wraps the plan
//      instead of being it — if that wrapper is ever flattened away, a cleared
//      plan starts springing back to the default on every other device.
//
//   3. Reset survives the trip. Clear the log on one device and the OTHER
//      device must not quietly refill it from its own localStorage mirror. The
//      meta document is what separates "somebody reset this" from "cold cache
//      with nothing synced yet", and getting it wrong is invisible until two
//      devices exist — the reset appears to work, then undoes itself.
//
//   4. The seed flag goes up with the data. `weightHistorySeeded` is a
//      device-local sentinel; once an account syncs it has to become
//      account-wide, or a second device folds all ~900 workbook days back into
//      a log that was deliberately emptied.
//
// No network and no emulator, the same trick case 81 uses: createFirestoreRepo
// and migrateLocalWeightToFirestore read `firebase` off the global and are
// themselves global, so they can be handed a recording stub. This tests whether
// OUR code carries the data through, not whether Firestore works.
//
// Mutation checks: make loadWeight fall back to the mirror when the meta doc
// exists and section 3 fails; drop the `{ plan: ... }` wrapper and section 2
// fails; stop carrying weightSeeded in the import and section 4 fails; key the
// log documents on anything but `date` and section 1 fails.

const { start } = require('../lib/server');
const { launch, attachConsole, waitFor } = require('../lib/browser');
const { PERSONAL_APP_ROOT } = require('../lib/paths');
const { eq, ok } = require('../lib/assert');

const NS = 'gym-local:';
const UID = 'test-uid';
const LOG_BASE = 'users/' + UID + '/weightLog/';
const META_PATH = 'users/' + UID + '/settings/weightMeta';
const PLAN_PATH = 'users/' + UID + '/settings/weightPlan';

// Three days of a fixed past week, so nothing here depends on what today is.
const SEED_LOG = [
    { date: '2026-01-05', weight: 180.0, loggedAt: '2026-01-05T14:30:00.000Z' },
    { date: '2026-01-06', weight: 182.0, loggedAt: '2026-01-06T14:30:00.000Z' },
    { date: '2026-01-07', weight: 184.0, loggedAt: '2026-01-07T14:30:00.000Z' },
];

// A recording Firestore stub. Beyond case 81's it needs deletes (the weight log
// diffs days away) and merge-sets (the meta document is written by two
// different callers and neither may clobber the other's field).
const INSTALL_STUB = () => {
    window.__written = [];
    window.__deleted = [];
    window.__stored = new Map();
    const written = window.__written;
    const deleted = window.__deleted;
    const stored = window.__stored;

    const docsIn = (base) => Array.from(stored.entries())
        .filter(([p]) => p.indexOf(base + '/') === 0 && p.slice(base.length + 1).indexOf('/') === -1)
        .map(([p, d]) => ({ id: p.split('/').pop(), data: () => d }));

    const query = (base, field, dir) => ({
        orderBy: (f, d) => query(base, f, d),
        limit: () => query(base, field, dir),
        get: () => {
            let rows = docsIn(base);
            if (field) {
                rows = rows.slice().sort((a, b) => {
                    const av = a.data()[field], bv = b.data()[field];
                    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
                    return dir === 'desc' ? -cmp : cmp;
                });
            }
            return Promise.resolve({ docs: rows });
        },
    });

    const write = (p, data, opts) => {
        const next = (opts && opts.merge && stored.has(p))
            ? Object.assign({}, stored.get(p), data)
            : data;
        written.push({ path: p, data: next });
        stored.set(p, next);
    };
    const remove = (p) => { deleted.push(p); stored.delete(p); };

    const makeDoc = (p) => ({
        _path: p,
        collection: (sub) => makeCol(p + '/' + sub),
        set: (data, opts) => { write(p, data, opts); return Promise.resolve(); },
        delete: () => { remove(p); return Promise.resolve(); },
        get: () => Promise.resolve({
            exists: stored.has(p),
            id: p.split('/').pop(),
            data: () => stored.get(p),
        }),
    });
    const makeCol = (base) => Object.assign(query(base, null, null), {
        doc: (id) => makeDoc(base + '/' + id),
    });

    window.firebase = {
        firestore: () => ({
            collection: (name) => makeCol(name),
            batch: () => {
                const ops = [];
                return {
                    set: (ref, data) => ops.push(['set', ref._path, data]),
                    delete: (ref) => ops.push(['del', ref._path]),
                    commit: () => {
                        ops.forEach(([kind, p, d]) => (kind === 'del' ? remove(p) : write(p, d)));
                        return Promise.resolve();
                    },
                };
            },
        }),
    };
};

(async () => {
    const server = await start({ root: PERSONAL_APP_ROOT });
    const browser = await launch();
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844 });
        const errors = attachConsole(page);

        await page.goto(server.url + '/weight/index.html', { waitUntil: 'networkidle0' });
        await page.evaluate((ns, log) => {
            localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
            // The workbook seed would fold 918 days in on top of the fixture.
            localStorage.setItem(ns + 'weightHistorySeeded', 'true');
            localStorage.setItem(ns + 'gymWeightPlan', 'null');
        }, NS, SEED_LOG);
        await page.reload({ waitUntil: 'networkidle0' });
        await waitFor(page, 'the check-in card to render',
            () => !!document.querySelector('.weigh-card'));

        // Firebase must still be asleep on localhost — the page now loads the
        // SDK bootstrap, and the whole local-mode contract rests on it staying
        // quiet there. If this ever fails, every other weight case is running
        // against a different repo than it thinks.
        const local = await page.evaluate(() => ({
            ready: window.FIREBASE_READY,
            mode: window.repo && window.repo.mode,
            sdkLoaded: typeof window.firebase !== 'undefined',
        }));
        eq(local.ready, false, 'localhost does not initialise Firebase');
        eq(local.mode, 'local', 'and the page runs on the localStorage repo');
        eq(local.sdkLoaded, false, 'the SDK is never even downloaded in local mode');

        // === 1. One document per day, keyed by the day ==================
        const wrote = await page.evaluate((install, log) => {
            eval('(' + install + ')()');
            const repo = createFirestoreRepo({ uid: 'test-uid' });
            repo.saveWeightLog(log);
            return {
                paths: window.__written.map((w) => w.path),
                sample: window.__written[0].data,
            };
        }, INSTALL_STUB.toString(), SEED_LOG);

        eq(wrote.paths, SEED_LOG.map((e) => LOG_BASE + e.date),
           'each reading lands at users/{uid}/weightLog/{day}, the day as its id');
        eq(wrote.sample.weight, 180.0, 'with the reading itself');
        eq(wrote.sample.loggedAt, SEED_LOG[0].loggedAt, 'and when the scale was stood on');

        // === 2. A correction rewrites its day; a deletion deletes it ====
        const diffed = await page.evaluate(() => {
            window.__written.length = 0;
            window.__deleted.length = 0;
            const repo = createFirestoreRepo({ uid: 'test-uid' });
            // Same repo instance would already know the log; a fresh one has to
            // read it first, which is also the real second-device sequence.
            return repo.loadWeight().then(() => {
                repo.saveWeightLog([
                    { date: '2026-01-05', weight: 180.0, loggedAt: '2026-01-05T14:30:00.000Z' },
                    { date: '2026-01-06', weight: 179.0, loggedAt: '2026-01-06T14:30:00.000Z',
                      editedAt: '2026-02-01T10:00:00.000Z' },
                ]);
                return { written: window.__written.map((w) => w.path),
                         deleted: window.__deleted.slice() };
            });
        });

        eq(diffed.written, [LOG_BASE + '2026-01-06'],
           'only the corrected day is rewritten — an unchanged day costs no write');
        eq(diffed.deleted, [LOG_BASE + '2026-01-07'],
           'and the dropped day is deleted, not left behind as a ghost reading');

        // === 3. The plan's three states =================================
        const planStates = await page.evaluate(() => {
            const label = (v) => (v === undefined ? 'undefined' : v === null ? 'null' : typeof v);
            const repo = createFirestoreRepo({ uid: 'test-uid' });
            // Meta has to exist first, or loadWeight treats the account as
            // never-synced and falls back to the mirror. That fallback is
            // section 4's subject; here it would just mask the plan.
            repo.markWeightSeeded();
            return repo.loadWeight().then((none) => {
                repo.saveWeightPlan(null);
                return repo.loadWeight().then((cleared) => {
                    repo.saveWeightPlan({ name: 'Cut plan', goalWeight: 170 });
                    return repo.loadWeight().then((set) => ({
                        none: label(none.weightPlan),
                        cleared: label(cleared.weightPlan),
                        set: label(set.weightPlan),
                        name: set.weightPlan && set.weightPlan.name,
                        seeded: none.weightSeeded,
                    }));
                });
            });
        });

        eq(planStates.none, 'undefined', 'no plan document means "never had a plan"');
        eq(planStates.cleared, 'null',
           'a cleared plan reads back as null, not as the workbook default');
        eq(planStates.set, 'object', 'and a saved plan reads back as itself');
        eq(planStates.name, 'Cut plan', 'with its fields intact');
        eq(planStates.seeded, true, 'markWeightSeeded is what the account remembers');

        // === 4. A reset on another device is not undone by this one =====
        const afterReset = await page.evaluate((ns, log) => {
            const repo = createFirestoreRepo({ uid: 'test-uid' });
            return repo.loadWeight().then(() => {
                repo.saveWeightLog([]);              // the reset, on device A
                // Device B still holds the old log in its mirror. Put it back
                // by hand: saveWeightLog just cleared it through the mirror,
                // and a second device would never have seen that write.
                localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
                const second = createFirestoreRepo({ uid: 'test-uid' });
                return second.loadWeight().then((loaded) => ({
                    entries: (loaded.weightLog || []).length,
                    seeded: loaded.weightSeeded,
                    mirror: JSON.parse(localStorage.getItem(ns + 'gymWeightLog') || '[]').length,
                }));
            });
        }, NS, SEED_LOG);

        eq(afterReset.entries, 0,
           'the emptied cloud log wins — the local mirror does not refill it');
        eq(afterReset.seeded, true,
           'and the account still remembers the seed, so the 918 workbook days stay gone');
        eq(afterReset.mirror, 0, 'the mirror is brought back in line with the cloud');

        // === 5. First sign-in carries the log AND the seed flag up ======
        const imported = await page.evaluate((install, ns, log) => {
            eval('(' + install + ')()');
            localStorage.setItem(ns + 'gymWeightLog', JSON.stringify(log));
            localStorage.setItem(ns + 'weightHistorySeeded', 'true');
            return Promise.resolve(migrateLocalWeightToFirestore({ uid: 'test-uid' })).then(() => {
                const meta = window.__stored.get('users/test-uid/settings/weightMeta') || {};
                return {
                    days: window.__written
                        .filter((w) => w.path.indexOf('/weightLog/') !== -1)
                        .map((w) => w.path.split('/').pop()),
                    importedFrom: !!meta.importedFromLocalAt,
                    seededAt: !!meta.seededAt,
                    count: meta.importedCount,
                };
            });
        }, INSTALL_STUB.toString(), NS, SEED_LOG);

        eq(imported.days, SEED_LOG.map((e) => e.date), 'the import uploads every local day');
        eq(imported.count, 3, 'and records how many it took');
        eq(imported.importedFrom, true, 'the meta document marks the import done');
        eq(imported.seededAt, true,
           'and carries the device-local seed sentinel up to the account');

        // A second run must be a no-op — the marker is what makes the import
        // safe to retry after a failure halfway through.
        const again = await page.evaluate(() => {
            window.__written.length = 0;
            return Promise.resolve(migrateLocalWeightToFirestore({ uid: 'test-uid' }))
                .then(() => window.__written.length);
        });
        eq(again, 0, 'a second sign-in imports nothing');

        // === 6. The page still works on top of all that =================
        await page.reload({ waitUntil: 'networkidle0' });
        await waitFor(page, 'the check-in card to render after reload',
            () => !!document.querySelector('.weigh-card'));
        const reloaded = await page.evaluate((ns) =>
            JSON.parse(localStorage.getItem(ns + 'gymWeightLog') || '[]').map((e) => e.date), NS);
        eq(reloaded, SEED_LOG.map((e) => e.date),
           'and a signed-out reload still loads the log from localStorage');

        ok(true, 'weight sync contract holds');
        eq(errors, [], 'no console errors');
        console.log('PASS');
    } finally {
        await browser.close();
        await server.stop();
    }
})();
