# Tests

Integration tests for `gym_app` and `../public_gym_app`. They drive both
apps in a headless Chrome browser, seed realistic state, and verify what
the user actually sees.

## Run the tests

```bash
cd tests
bash run.sh
```

First run installs `puppeteer-core` (the only dependency) into
`tests/node_modules`. Subsequent runs skip the install and just execute.

Expected output on a healthy codebase:

```
▶ 01-public-app-migration ... PASS
▶ 02-public-app-default-matches-last ... PASS
▶ 03-personal-app-default-matches-last ... PASS
▶ 04-weighted-dips-plate-loaded ... PASS
▶ 05-personal-app-split-positions ... PASS

================================================
  5 / 5 passed
================================================
```

A failing test dumps its full output indented under the test name so
you can read the assertion error and stack trace inline.

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

| File | Covers |
|---|---|
| `01-public-app-migration.js` | Jessi's `migrateJessiToTorsoLimbs` reshuffles her saved exerciseConfig into the canonical Torso/Limbs layout when bumped. |
| `02-public-app-default-matches-last.js` | The day-filter regression on Jessi's app — default weight tracks the most-recent session for an exercise, not stale data from a prior split era on the same `day` slot. |
| `03-personal-app-default-matches-last.js` | Same regression on the personal app. |
| `04-weighted-dips-plate-loaded.js` | Weighted Dips is classified as plate-loaded, not pin-stack: the Weight Breakdown popover shows per-plate counts, not just two warmup percentages. |
| `05-personal-app-split-positions.js` | The canonical Torso/Limbs exercise order on the personal app. Catches accidental reordering or day reassignments. |

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

The day this directory has 30+ tests and you need parallelization or
fancy reporting, swap to a framework. Until then, keep it boring.
