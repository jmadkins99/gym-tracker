# Gym Tracker App

A personal workout tracking web app. All data is kept in your browser's local storage, with no account or server involved.

## Days

The workout view has two day types you switch between with a toggle at the top. It picks a default based on the weekday: Monday, Wednesday, and Friday start on Lower, every other day starts on Upper.

- **Upper**: twelve weighted machine and cable exercises tracked by weight and reps.
- **Lower**: eight weighted machine and cable exercises tracked by weight and reps.

Earlier splits — Full Body / Cardio before August 2026, and the Torso/Limbs, Push/Pull/Legs, and Anterior/Posterior rotations before that — are still readable and editable in the Weekly tab. Body Weight Squats, Burpee Jump Tucks, Assault Bike, and Stairmaster are retired from logging but their history renders unchanged.

## Logging

- **Per-exercise LOG**: each exercise saves straight to the Weekly tab. The first LOG of a day creates the entry and marks everything else NA.
- **Last session shown**: each card shows your previous values, and the input fields pre-fill to them.
- **Weight Breakdown**: weighted exercises have a button that shows two warmup sets at roughly 70% and 90%. Plate-loaded machines get an exact per-side plate breakdown; pin-stacks get achievable pin and micro-plate weights.

## Progression

- **Weighted exercises (Simple PR Tracking)**: reps are logged on a 3-to-6 dropdown. Hit 6 (the top of the range) last session and the weight bumps up with the field highlighting green. Log 3 reps and the next session shows a gold "Rest Pause Set Recommended" hint at the same weight; after three 3-rep sessions in a row it escalates to a green "Trial of Strength" that targets 4 reps until you break the streak. Three identical sessions in a row (same weight and reps) show a gold "2 Sets Recommended" hint. An advanced plateau-buster mode exists but is off by default.
- **Day Breakdown**: "Submit Day" shows the completed-exercise count and PRs (weight or reps went up, with reps of at least 4). Cardio never counted toward PRs.

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
