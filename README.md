# Gym Tracker App

A personal workout tracking web app. All data is kept in your browser's local storage, with no account or server involved.

## Days

The workout view has two day types you switch between with a toggle at the top. It picks a default based on the weekday: Monday, Wednesday, and Friday start on Posterior, every other day starts on Anterior — so the larger push day comes round four times a week.

- **Anterior**: twelve weighted machine and cable exercises tracked by weight and reps. Chest, shoulders, triceps, wrist flexors, abs and quads.
- **Posterior**: nine weighted machine and cable exercises tracked by weight and reps. Back, biceps, wrist extensors, erectors, adductors and calves.

The split is anatomical with a push/pull flavour rather than strict anatomy: the arms are grouped by function, so triceps sit on Anterior and biceps on Posterior.

Earlier splits — Upper/Lower from August 2026, Full Body / Cardio before that, and the Torso/Limbs, Push/Pull/Legs, and numeric-day Anterior/Posterior rotations before that — are still readable and editable in the History tab. Note that those early-2026 Anterior/Posterior rotations were a different program from the current split, and the History tab labels both with the same two words. Body Weight Squats, Burpee Jump Tucks, Assault Bike, and Stairmaster are retired from logging but their history renders unchanged.

## Logging

- **Per-exercise LOG**: each exercise saves straight to the History tab. The first LOG of a day creates the entry and marks everything else NA.
- **Last session shown**: each card shows your previous values, and the input fields pre-fill to them.
- **Weight Breakdown**: every weighted exercise has a button that shows two warmup sets at roughly 70% and 90%. What it shows depends on how that machine is loaded, which you set yourself in Settings → Manage Exercises: each exercise has a dropdown offering **Pin-loaded**, **Plate-loaded on both sides**, and **Plate-loaded on one side**. Pin-loaded gives achievable pin and micro-plate weights; the plate options give an exact plate breakdown, with a per-side split on the two-sided setting. The choice is saved per exercise and rides along in backups. Machines start on whatever they were before the dropdown existed, so nothing changed on upgrade. Calf Raises keeps its 405 lb stack ceiling in code — above it the breakdown shows the pin at max plus loose plates for the excess. Setting a machine to two-sided also rounds its PR step up to the nearest weight that splits onto a real plate, since 1.25 lb would be 0.625 a side. The panel is one-way: it opens on the button and closes when you log that exercise or open another one's, with no Hide. That is because the tap also starts the exercise's clock — see Day Breakdown.

## Progression

- **Weighted exercises (Simple PR Tracking)**: most reps are logged on a 3-to-6 dropdown; Reverse Wrist Curls and Cable Wrist Curls use 5-to-8. Hit the top of the exercise's range last session and the weight bumps up with the field highlighting green. Six identical sessions in a row (same weight and reps) show a gold "Plateau Detected" hint. Logging the bottom value carries no special meaning on its own — the rest-pause and Trial of Strength escalation that used to key off it was removed, so a run of bottom-value sessions now reaches the plateau check like any other weight/rep pair. An advanced plateau-buster mode exists but is off by default.
- **Streaks**: a green flame pill sits by the exercise name, counting consecutive improvements — the session you started from is the baseline, not a notch on the streak, so one better session after a flat stretch reads 1. It appears at one. A session extends the streak if the weight went up, or the weight held and the reps went up; it breaks on an identical session, a weight drop, or fewer reps at the same weight. A weight increase extends the streak whatever the reps do — hitting the top of the range bumps the weight and resets the dropdown to the exercise's start reps, so treating that as backsliding would cap every streak at two. Weighted exercises only, and the numeric streak counts submitted sessions, so it moves when you hit Submit Day rather than when you log. While a card is sitting in its pre-submit Logged state, that numeric pill is replaced by a "🔥 PR" pill if the just-logged set improved against the previous submitted session.
- **Day Breakdown**: "Submit Day" shows the completed-exercise count, PRs, and how long you were at the gym. A PR is exactly what the streak badge counts — the weight went up, or the weight held and the reps went up — so the two can never disagree. A weight drop is never a PR however many extra reps came with it, which matters because a plateau-buster recovery is a deliberate weight drop and used to be reported as a personal best. Cardio never counts.
- **Session timing**: the clock for a movement runs from the moment you open its Weight Breakdown — which you do at the machine, to see how to load it — to the moment you tap LOG. If the machine is taken and you go do something else, the clock restarts when you come back and open the panel again, so the time reported is the set rather than the wandering; the newest tap always wins. Nothing to start or stop by hand. "View More Details" in the breakdown lists every movement's time, and the session total runs from the first panel you opened to the last thing you logged, so submitting late from the car cannot inflate it. Log something without ever opening its panel and it is estimated from the previous log instead, less two minutes for walking over, and marked with an asterisk. No single movement may claim more than 30 minutes — past that the app reports NA rather than a number nobody should trust, which is what you see if you open a panel and wander off without logging it. Workouts logged before August 2026 carry no timestamps and show no timing block at all.

## Data

- A JSON backup downloads on every day submission.
- Export, import, and reset are available from the Settings gear.
- The History tab browses by week, counting up from your first workout. Each day is editable via the pencil button, and a ⏱️ beside it opens that session's timing — the same per-movement breakdown the Day Breakdown modal shows, still readable long after the day it was logged. Standard exercises that count toward "PRs Smashed" show the same green flame badge used on the workout card, labeled "PR".

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
  TimeDetailsModal.jsx  # Per-movement session timing, from the History tab
  DayBreakdownModal.jsx # Post-workout summary with PR count
  BackupReminderModal.jsx # Monthly backup reminder
tests/                  # Puppeteer end-to-end test cases (run via tests/run.sh, ~110s)
```
