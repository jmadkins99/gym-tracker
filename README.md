# Gym Tracker App

A personal workout tracking web app. All data is kept in your browser's local storage, with no account or server involved.

## Days

The workout view has two day types you switch between with a toggle at the top. It picks a default based on the weekday: Tuesday and Thursday start on Cardio, every other day starts on Full Body.

- **Full Body**: weighted machine and cable exercises tracked by weight and reps.
- **Cardio**: Body Weight Squats, Stairmaster, and Assault Bike.

## Logging

- **Per-exercise LOG**: each exercise saves straight to the Weekly tab. The first LOG of a day creates the entry and marks everything else NA.
- **Last session shown**: each card shows your previous values, and the input fields pre-fill to them.
- **Weight Breakdown**: weighted exercises have a button that shows two warmup sets at roughly 70% and 90%. Plate-loaded machines get an exact per-side plate breakdown; pin-stacks get achievable pin and micro-plate weights.

## Progression

- **Full Body (Simple PR Tracking)**: if you hit 6 reps (the top of the 4 to 6 range) last session, the weight bumps up and the field highlights green. Three identical sessions in a row show a gold "2 Sets Recommended" hint. An advanced plateau-buster mode exists but is off by default.
- **Cardio**: no PR suggestions. Every field carries over last session's value. First-session defaults are squats 50, Stairmaster Level 7 / 10:00, and Assault Bike 25W / 20/40.
- **Day Breakdown**: "Submit Day" shows the completed-exercise count and PRs (weight or reps went up, with reps of at least 4). Cardio does not count toward PRs.

## Data

- A JSON backup downloads on every day submission.
- Export, import, and reset are available from the Settings gear.
- The Weekly view browses history by week, counting up from your first workout, and each day is editable via the pencil button.

## Tech Stack

React 18 and Babel standalone loaded from a CDN, with localStorage for persistence. There is no build step.

## File Structure

```
index.html              # Entry point, loads all scripts
css/styles.css          # App styles
js/config.js            # Exercise defaults, increments, tracking-mode flags, day setup
js/utils.js             # Storage helpers, date/week utilities
js/migrations.js        # localStorage migration logic
js/plateauLogic.js      # PR tracking and per-exercise suggestion/carry-over helpers
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
