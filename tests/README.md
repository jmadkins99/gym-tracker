# Tests

Integration tests for `gym_app` and `../public_gym_app`. They drive both
apps in a headless Chrome browser, seed realistic state, and verify what
the user actually sees.

## Run the tests

```bash
cd tests
bash run.sh                # everything
bash run.sh 42             # just case 42
bash run.sh personal-app   # just the personal-app cases
TEST_JOBS=1 bash run.sh 42 # one at a time (see below)
```

Cases run **6 at a time**. The full suite takes about **2 minutes**;
sequentially it took about 8.5. Results are reported in filename order
however they finish, so two runs are diffable, and each case's output is
buffered and printed whole so a failure's diagnostics never interleave
with another case's.

`TEST_JOBS=n` changes the concurrency. Measured on a 16-core Windows box:
6 jobs took 121s, 10 took 107s, and 14 took 114s *and* failed a case with
`net::ERR_NO_BUFFER_SPACE` — socket exhaustion, not a test bug. The
default is deliberately below that ceiling rather than at it. `TEST_JOBS=1`
restores strictly sequential behaviour, which is what to reach for if a
failure looks timing-dependent and you want to rule concurrency out.

The argument is a substring match on the case name. A filtered run says
so in its header and footer, so it can't be mistaken for a full one.

First run installs the dependencies into `tests/node_modules`.
Subsequent runs skip the install and just execute.

A failing test dumps its full output indented under the test name so
you can read the assertion error and stack trace inline.

### Requirements

- **Chrome or Chromium.** `puppeteer-core` never downloads a browser of
  its own. `lib/browser.js` checks the usual system paths plus
  Playwright's cache at `/opt/pw-browsers/chromium`; set `CHROME_PATH`
  if yours is somewhere else.
- **The public app**, cloned as a sibling of this repo, for the
  `*-public-app-*` cases:
  `git clone git@github.com:jmadkins99/public-gym-app.git` next to
  `gym-tracker`. Without it those cases fail with "Could not find the
  public app"; the personal-app cases are unaffected, so
  `bash run.sh personal-app` is the useful run in that state.
- **No network at run time.** React, ReactDOM and `@babel/standalone`
  come from `tests/node_modules` — see below.

### Why tests/node_modules holds React

Both apps load React and Babel from `unpkg.com` in a plain `<script>`
tag. That is fine on a phone, but it makes the suite depend on a
third-party CDN, and sandboxed CI containers often block that egress —
in which case every browser case dies at `waitForApp` with nothing but
a selector timeout to explain it.

`lib/cdn.js` intercepts those three requests and answers them from
`node_modules`. `index.html` keeps its CDN tags, so production is
untouched and the suite is hermetic.

The versions in `package.json` must track what `index.html` asks for.
`react` is pinned to `^18` because React 19 dropped the UMD builds
entirely; `@babel/standalone` to `^7` because it has since moved to 8.x
while `index.html` still requests 7. Serving a version the live app
does not use would make the suite lie about what ships.

## Auto-run on push

A pre-push hook lives in `.githooks/`. Wire it up once:

```
git config core.hooksPath .githooks
```

Same in `../public_gym_app`. After that, every `git push` runs the suite
and aborts on failure. Bypass with `--no-verify`.

## Recommended workflow

```
1. Make a code change (config swap, bug fix, refactor, etc.)
2. cd tests && bash run.sh
3. All pass?
     → commit + push
   Anything fails?
     → read the failure output. Either fix the code (real regression)
       or update the test (intentional change in behavior).
4. After pushing, the same code is now on the live web app on your
   phone. Tests passing locally is your assurance it'll behave
   correctly there too.
```

This is the safety net we didn't have when the day-filter bug shipped
the first time. Every category of change you commonly make
(split swaps, exercise renames, day reassignments, plate-vs-pin
reclassifications) is now locked down by at least one test.

## What each test covers

Every case file opens with a `// What this test covers` header explaining
its invariant and, usually, the mutation that proves it real. Read that
first — it is what tells you whether a failure is a regression or an
intentional behaviour change. Rather than duplicate all of them here,
what follows is a map of the ones you are most likely to touch.

**The Anterior/Posterior split** (August 2026, replacing Upper/Lower):

| File | Covers |
|---|---|
| `50-…-anterior-posterior-roster.js` | The canonical roster, parsed straight out of `config.js`. Every id's day, both days' order, `category`/`day` agreement, dense `order`. No browser — run this one first, it takes under a second. |
| `42-…-anterior-posterior-split.js` | What a **fresh install** renders: 12 Anterior, 9 Posterior, toggle order, weekday default, retired day types gone. |
| `43-…-anterior-posterior-config-migration.js` | What a **saved config** becomes: a 19-id Full Body config reconciled onto the new layout, renames preserved, retired ids dropped, idempotent. |
| `54-…-v13-to-v14-day-reassignment.js` | That the **version bump** is what delivers it. The only case that catches a forgotten `EXERCISE_CONFIG_VERSION` bump — 42 and 43 both pass without it. |
| `51-…-weekday-default-map.js` | All seven weekdays map to the right day type, not just today's. |
| `52-…-legacy-day-labels.js` | Aug-2026 `day: 'upper'`/`'lower'` history keeps its own labels and rosters. History is never migrated. |
| `55-…-day-toggle-and-settings-order.js` | The toggle and the Settings grouping agree with the roster, and the reorder arrows stop at the day boundary. |
| `23` / `53` | Logging a full Anterior / Posterior day through the real UI. The pair is what stops the day stamp being hardcoded. |
| `44-…-weekly-view-eras.js` | Weekly and Edit render every era at once: current Anterior, a workout predating a day reassignment, legacy Upper, legacy Cardio, pre-split Full Body. |
| `40-…-config-version-reorder.js` | A code-side reorder reaches a saved config, and an in-app Settings reorder survives reload. |

**Jessi's app** — the `*-public-app-*` cases. Her program is a separate
codebase in the sibling repo with its own exercise ids and its own
migration chain; `41` and `33` are the ones that pin her split.

Everything else is per-feature: weight breakdowns and load-type
classification (`07`, `08`, `13`, `16`, `17`, `18`, `26`, `28`, `45`,
`46`), the user-chosen load type itself (`57`–`61`, see below), PR
streaks (`47`, `48`, `49`), cardio-era history (`21`, `22`, `24`),
storage and hydration (`34`, `35`, `36`, `38`), and the day-filter
regression that started all this (`02`, `03`).

**Load type** — pin stack vs plate-loaded on one or both sides — became a
per-exercise user setting in Aug 2026, chosen from a dropdown in Settings >
Manage Exercises and saved in `exerciseConfig` alongside the display name.
It replaced two id-keyed maps in `config.js`. The cases split by what they
can catch:

| Case | What only it catches |
|---|---|
| `58-…-load-type-changes-breakdown.js` | That the setting reaches the render at all. Everything else here passes if the value is stored but never read — **start here** when touching the breakdown. |
| `57-…-load-type-dropdown-persists.js` | The dropdown shows each exercise's own value, writes one exercise, and stamps the config version. |
| `59-…-load-type-survives-version-bump.js` | The `loadType` line in `migrateExerciseConfig`. `40`, `43` and `54` all stay green without it, then every user choice silently reverts on the next unrelated bump. |
| `60-…-load-type-survives-backup-restore.js` | The import path, which saves with no version and so always rebuilds — plus the `resolveLoadType` fallback that keeps a pre-v15 backup rendering before its first reload. The only case that drives the file input. |
| `61-…-two-sided-increment-bump.js` | That a two-sided machine's PR increment lands on a real plate (1.25 → 2.5), and that only 1.25 moves. |

Note that `16` is weaker than it looks now: with every exercise carrying a
`loadType`, "shows a breakdown button" is unconditionally true, so its
browser half only catches a card rendering no button at all. Its teeth are
the source-level check that every entry declares a legal type.

**Coach presets.** `63-…-ian-coach-code.js` and `64-…-ian-not-clawed-back.js`
cover Ian's program. `64` is the one that matters: three of the Jessi one-shots
identify her install by the *shape* of its config — categories of exactly
Anterior/Posterior — which is also what any other client on that split produces.
`migrateJessiToFullBody` would drop three of Ian's movements, rename two more,
and collapse his two days into one, on his **second** load rather than his
first. A `coachPreset` stamp written by the coach-code path is what holds it
off; `64` clears the one-shot flags and reloads three times to prove it. Removing
that guard reddens `64` alone.

**On Jessi's app** the same setting arrived a few days later, with two
differences worth knowing. The Weight Breakdown is no longer gated: it used
to be hidden behind an `exerciseConfig.gympinMode` flag that only she had, and
that flag, its `?gympin=on` URL toggle and its one-shot enabler are gone —
`09-…-breakdown-for-everyone.js` now guards the opposite property, including
that a stale `gympinMode: false` in a restored backup cannot suppress it.
(`09-…-gympin-gated.js` and `11-…-gympin-auto-enable.js` were deleted; the
`gympin` still in some filenames and `data-` attributes is vestigial.) And
because anyone can type their own exercise name, the name-based
`getWeightBreakdownConfig` survives as the **default** rather than the
authority — `62-…-load-type-changes-breakdown.js` is the public-app twin of
`58`, and covers both a movement the rules recognise and one they have never
seen.

## How to add a new test

1. Create `cases/06-something-meaningful.js`. Use an existing case as a
   template — the boilerplate is small (~50 lines).
2. Decide what invariant your test locks down. Write the description at
   the top of the file as a `// What this test covers` comment. The
   description matters as much as the code: when this test fails in
   six months, the comment is what tells you whether the failure is a
   regression or an intentional behavior change.
3. Construct the minimum state that exercises the behavior. Use the
   helpers in `lib/state.js` (`seedPersonalApp`, `seedPublicApp`,
   `workoutEntry`, etc.). If you need a new helper, add it there.
4. Use `lib/assert.js` (`eq`, `ok`, `contains`) for assertions. Each
   assertion takes a message string — write something specific so the
   failure output reads like a sentence ("default Weight (lbs) field
   should equal recent weight, not stale Day-1 PR bump").
5. Run it: `node cases/06-something-meaningful.js`. Iterate until green.
6. **Mutation-test it** (see below) to confirm it actually catches
   the regression it claims to.

### Mutation testing — confirm the test is real

A test that passes when the code is wrong is worse than no test, because
it gives false confidence. After writing a new test, deliberately break
the code it's supposed to protect and confirm the test fails. Then
revert the break.

Example from when test 02 was written: I added `if (w.day !== currentDay)
return false;` back into `getMinimalistPR` in the public app, ran the
test, watched it fail with `expected: "160"  actual: "222.5"` (exactly
the buggy behavior), then removed the bad line. That confirms the test
genuinely catches the bug.

If your test stays green when you sabotage the code, the test is
asserting the wrong thing.

## Directory layout

```
tests/
├── README.md          (you are here)
├── package.json       (just puppeteer-core)
├── run.sh             (the runner)
├── lib/
│   ├── assert.js      (eq / ok / contains)
│   ├── browser.js     (puppeteer launch + page helpers)
│   ├── server.js      (tiny static HTTP server)
│   └── state.js       (localStorage seed helpers + fake Jessi config)
├── cases/             (each file is one test; runs independently)
└── fixtures/          (reserved for JSON blobs — empty for now)
```

Each case file is a standalone Node script. `run.sh` calls them in
order and aggregates results, but you can also run one at a time:

```bash
node cases/02-public-app-default-matches-last.js
```

That's useful when iterating on a single test.

## Why no test framework?

Jest, Mocha, Vitest, etc. all work fine — but they add a dependency
graph, configuration files, and a runner abstraction. For a small set
of integration tests against a vanilla HTML app, plain Node scripts
with `process.exit(1)` on failure is simpler, easier to read, and has
zero magic. You can grep the code to know exactly what it does.

That call still holds at 57 cases. The prediction attached to it — that
parallelization would be the thing that forced a framework — turned out
to be wrong: `run.sh` runs cases concurrently in about 30 lines of bash,
because the suite was already built for it (own server on a free port,
own Chrome profile, no disk writes, no ordering between cases). Reach
for a framework when you want something a framework actually gives you,
like fixtures or sharding across machines.
