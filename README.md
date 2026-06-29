# Gym Tracker App

A personal workout tracking web app. All data lives in your browser's local storage — no account, no server.

## Days

Toggle between two day types at the top of the workout view. It defaults by weekday (Tue/Thu → Cardio, otherwise Full Body).

- **Full Body**: weighted machine/cable exercises tracked by weight × reps.
- **Cardio**: Body Weight Squats, Stairmaster, Assault Bike.

## Logging

- **Per-exercise LOG**: each exercise saves instantly to the Weekly tab; the first LOG of a day creates the entry with everything else marked NA.
- **Last session shown**: each card displays your previous values, and fields pre-fill to them.
- **Weight Breakdown**: button on weighted exercises shows two warmup sets (~70% / ~90%) — exact plate breakdown per side for plate-loaded machines, achievable pin/micro-plate weights for pin-stacks.

## Progression

- **Full Body (Simple PR Tracking)**: hit 6 reps (top of the 4–6 range) last session and the weight auto-increments with a green highlight. Three identical sessions in a row shows a gold "2 Sets Recommended" hint. (An advanced plateau-buster mode exists but is off by default.)
- **Cardio**: no PR suggestions — every field just carries over last session's value (first-session defaults: squats 50, Stairmaster Level 7 / 10:00, Assault Bike 25W / 20/40).
- **Day Breakdown**: "Submit Day" shows completed-exercise count and PRs (weight or reps up, reps ≥ 4). Cardio never counts as a PR.

## Data

- Auto-downloads a JSON backup on every day submission.
- Export / import / reset from the Settings gear.
- Weekly view browses history by week (counting up from your first workout) and is editable via the pencil button.

## Tech Stack

React 18 + Babel standalone (via CDN), localStorage for persistence. No build step.

## File Structure

```
index.html              # Entry point - loads all scripts
css/styles.css          # App styles
js/config.js            # Exercise defaults, increments, tracking-mode flags, day setup
js/utils.js             # Storage helpers, date/week utilities
js/migrations.js        # localStorage migration logic
js/plateauLogic.js      # PR tracking + per-exercise suggestion/carry-over helpers
js/components/
  App.jsx               # State management and data persistence
  WorkoutView.jsx       # Active workout UI with exercise cards
  WeeklyView.jsx        # Historical workout browser
  SettingsModal.jsx     # Settings, exercise management, import/export
  EditWorkoutModal.jsx  # Edit historical workout data
  DayBreakdownModal.jsx # Post-workout summary with PR count
  BackupReminderModal.jsx # Monthly backup reminder
tests/                  # Puppeteer end-to-end test cases (run via tests/run.sh)
```
