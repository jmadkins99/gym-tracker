# Gym Tracker App

A personal workout tracking web app. All data is kept in your browser's local storage, with no account or server involved.

## Days

The workout view has two day types you switch between with a toggle at the top. It picks a default based on the weekday: Monday, Wednesday, and Friday start on Posterior, every other day starts on Anterior — so the larger push day comes round four times a week.

- **Anterior**: twelve weighted machine and cable exercises tracked by weight and reps. Chest, shoulders, triceps, wrist flexors, abs and quads.
- **Posterior**: nine weighted machine and cable exercises tracked by weight and reps. Back, biceps, wrist extensors, erectors, adductors and calves.

The split is anatomical with a push/pull flavour rather than strict anatomy: the arms are grouped by function, so triceps sit on Anterior and biceps on Posterior.

Earlier splits — Upper/Lower from August 2026, Full Body / Cardio before that, and the Torso/Limbs, Push/Pull/Legs, and numeric-day Anterior/Posterior rotations before that — are still readable and editable in the Weekly tab. Note that those early-2026 Anterior/Posterior rotations were a different program from the current split, and the Weekly tab labels both with the same two words. Body Weight Squats, Burpee Jump Tucks, Assault Bike, and Stairmaster are retired from logging but their history renders unchanged.

## Logging

- **Per-exercise LOG**: each exercise saves straight to the Weekly tab. The first LOG of a day creates the entry and marks everything else NA.
- **Last session shown**: each card shows your previous values, and the input fields pre-fill to them.
- **Weight Breakdown**: every weighted exercise has a button that shows two warmup sets at roughly 70% and 90%. What it shows depends on how that machine is loaded, which you set yourself in Settings → Manage Exercises: each exercise has a dropdown offering **Pin-loaded**, **Plate-loaded on both sides**, and **Plate-loaded on one side**. Pin-loaded gives achievable pin and micro-plate weights; the plate options give an exact plate breakdown, with a per-side split on the two-sided setting. The choice is saved per exercise and rides along in backups. Machines start on whatever they were before the dropdown existed, so nothing changed on upgrade. Calf Raises keeps its 405 lb stack ceiling in code — above it the breakdown shows the pin at max plus loose plates for the excess. Setting a machine to two-sided also rounds its PR step up to the nearest weight that splits onto a real plate, since 1.25 lb would be 0.625 a side.

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
js/config.js            # Exercise defaults, load types, increments, pin-stack caps, day setup
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
tests/                  # Puppeteer end-to-end test cases (run via tests/run.sh, ~110s)
```
