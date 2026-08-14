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

- **Weighted exercises (Simple PR Tracking)**: reps are logged on a 3-to-6 dropdown. Hit 6 (the top of the range) last session and the weight bumps up with the field highlighting green. Six identical sessions in a row (same weight and reps) show a gold "Plateau Detected" hint. Logging 3 reps carries no special meaning on its own — the rest-pause and Trial of Strength escalation that used to key off it was removed, so a run of 3-rep sessions now reaches the plateau check like any other weight/rep pair. An advanced plateau-buster mode exists but is off by default.
- **Streaks**: a green flame pill sits between the exercise name and the Weight Breakdown button, counting consecutive improvements — the session you started from is the baseline, not a notch on the streak, so one better session after a flat stretch reads 1. It appears at one. A session extends the streak if the weight went up, or the weight held and the reps went up; it breaks on an identical session, a weight drop, or fewer reps at the same weight. A weight increase extends the streak whatever the reps do — hitting 6 bumps the weight and resets the dropdown to 4, so treating that as backsliding would cap every streak at two. Weighted exercises only, and it counts submitted sessions, so it moves when you hit Submit Day rather than when you log.
- **Day Breakdown**: "Submit Day" shows the completed-exercise count and PRs (weight or reps went up, with reps of at least 4). Cardio never counted toward PRs.

## Data

- A JSON backup downloads on every day submission.
- Export, import, and reset are available from the Settings gear.
- The Weekly view browses history by week, counting up from your first workout, and each day is editable via the pencil button.

## Appearance

The accent color changes once a day. It is the family the whole UI hangs off — LOG and Weight Breakdown buttons, active day/nav pills, section titles, the gear, Submit Day — and it rotates through a bank of ten, keyed to the calendar date so it is stable all day and flips at local midnight.

Each palette holds the original purple's exact OKLCH lightness and chroma and rotates hue only, so every color reads as equally dark and equally desaturated. Backgrounds never change. Green PRs, gold hints and the red NA button are fixed, since they carry meaning.

The order is reshuffled every cycle rather than being a fixed carousel, with two invariants: all ten appear before any repeats, and the same color never lands two days running. On localhost the UI still rotates but the favicon stays white, so a dev tab is never confused with the live one.

## Tech Stack

React 18 and Babel standalone loaded from a CDN, with localStorage for persistence. There is no build step.

## File Structure

```
index.html              # Entry point, loads all scripts
css/styles.css          # App styles
js/accentColor.js       # Daily accent rotation; sets the --accent-* custom properties
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
