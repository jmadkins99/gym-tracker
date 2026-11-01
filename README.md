# Gym Tracker

A personal workout tracker for one fixed program. Live at
https://jmadkins99.github.io/gym-tracker/

Client counterpart: [public-gym-app](https://github.com/jmadkins99/public-gym-app).

## Features

- **Program**: one Full Body day of 19 weighted exercises, defined in
  `PROGRAM_DAYS` in `js/config.js`. Older splits stay readable in History.
- **Logging**: one card per exercise, pre-filled from last session; LOG saves
  each exercise, Submit Day closes the day.
- **Reps dropdown**: each exercise's rep range (default 4–6, editable in
  Settings → Manage Exercises), offered from one below min reps up to max reps.
  The bottom value is a failed set and never counts as a PR.
- **Progression**: hit max reps and the weight bumps by the exercise's PR
  increment (1.25, 2.5, 5 or 10 lb), or set it to 0 to hold an exercise where
  it is — max reps still counts as a PR, but the card keeps last session's
  weight and reps instead of suggesting the next weight up.
- **PRs**: flame streak pill, PR badges on logged cards, Submit Day and History.
- **Weight Breakdown**: warmup sets at ~70% and ~90%, per load type (pin-loaded,
  plates on both sides, plates on one side, Gympin). Opening it starts the
  exercise's timer.
- **Session timing**: per-exercise and total time, in Submit Day and History.
- **History**: past workouts by week, each day editable.
- **Weight page** (`/weight/`): daily weigh-ins, weekly averages, and a target
  plan with projections.
- **Daily accent color** from a bank of ten.

## Data

- Stored in the browser's `localStorage`.
- Optional Google sign-in (Settings) syncs to Firebase Firestore.
- Export/import a JSON backup from Settings.

## Tech stack

- React 18 and Babel standalone from a CDN, no build step.
- Firebase 10 (Auth + Firestore) for sign-in and sync.
- GitHub Pages, deployed by `.github/workflows/tests.yml` on each merge to
  `main`. A pull request can only merge once that workflow's tests pass.
- Puppeteer end-to-end tests in `tests/`.

## Development

Needs Python, Node and Chrome.

```bash
python -m http.server 8000   # then open http://localhost:8000/
cd tests && bash run.sh      # full test suite; installs its npm packages
```

Served from `localhost`, the app uses its own `gym-local:` storage, so it never
touches live data.
