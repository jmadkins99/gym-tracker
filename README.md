# Gym Tracker App

A personal workout tracking web app. Data is kept in your browser's local storage, and signing in with Google from Settings syncs it across devices through Firestore.

## Days

The program is one **Full Body** day (since September 2026): nineteen weighted machine and cable exercises tracked by weight and reps, done six days a week. With only one day there is nothing to choose, so the workout view has no day toggle and no weekday schedule.

The program's days live in one list, `PROGRAM_DAYS` in `js/config.js`. A future split with several days brings the toggle back automatically, and the Settings list regroups by day. Switching split needs no migration code: history is keyed by exercise, so every "Last:" value and streak carries over. Past sessions keep the day they were logged under.

Earlier splits — Anterior/Posterior from August 2026, Upper/Lower before it, Full Body / Cardio before that, and the Torso/Limbs, Push/Pull/Legs, and numeric-day Anterior/Posterior rotations before that — are still readable and editable in the History tab. Note that those early-2026 Anterior/Posterior rotations were a different program from the August 2026 split, and the History tab labels both with the same two words. Likewise the June–August 2026 Full Body day and the current one are both labelled Full Body. Body Weight Squats, Burpee Jump Tucks, Assault Bike, and Stairmaster are retired from logging, as are Reverse Wrist Curls and Cable Wrist Curls since September 2026, but their history renders and edits unchanged.

## Logging

- **Per-exercise LOG**: each exercise saves straight to the History tab. The first LOG of a day creates the entry and marks everything else NA.
- **Last session shown**: each card shows your previous values, and the input fields pre-fill to them.
- **Weight Breakdown**: every weighted exercise has a button that shows two warmup sets at roughly 70% and 90%. What it shows depends on how that machine is loaded, which you set yourself in Settings → Manage Exercises: each exercise has a dropdown offering **Pin-loaded**, **Plate-loaded on both sides**, and **Plate-loaded on one side**. Pin-loaded gives achievable pin and micro-plate weights; the plate options give an exact plate breakdown, with a per-side split on the two-sided setting. The choice is saved per exercise and rides along in backups. Machines start on whatever they were before the dropdown existed, so nothing changed on upgrade. Four machines keep a stack ceiling in code — Lateral Raises at 100 lb, Shoulder Press at 250, Back Extensions at 260, Calf Raises at 405 — and above the ceiling the breakdown shows the pin at max plus loose plates for the excess. Ceilings are not part of the dropdown: a cap belongs to one specific machine rather than to a way of loading one, so it is not yours to edit, and it is ignored entirely unless that exercise is set to Pin-loaded. Setting a machine to two-sided also rounds its PR step up to the nearest weight that splits onto a real plate, since 1.25 lb would be 0.625 a side. The panel is one-way: it opens on the button and closes when you log that exercise or open another one's, with no Hide. That is because the tap also starts the exercise's clock — see Day Breakdown.

## Progression

- **Weighted exercises (Simple PR Tracking)**: reps are logged on a 3-to-6 dropdown. Hit the top of the exercise's range last session and the weight bumps up with the field highlighting green. How far it bumps is each exercise's PR step, chosen from 1.25, 2.5, 5 or 10 lb in the pencil form in Settings → Manage Exercises and saved by its Save button; an exercise nobody has edited uses the step it shipped with. Six identical sessions in a row (same weight and reps) show a gold "Plateau Detected" hint. Logging the bottom value is a failed set: it never counts as a PR and never extends a streak, whatever weight it was carrying. Beyond that it carries no special meaning — the rest-pause and Trial of Strength escalation that used to key off it was removed, so a run of bottom-value sessions still reaches the plateau check like any other weight/rep pair, and a failed set is still the baseline the next session is measured against. An advanced plateau-buster mode exists but is off by default.
- **Streaks**: a gold-outlined flame pill sits by the exercise name, counting consecutive improvements — the session you started from is the baseline, not a notch on the streak, so one better session after a flat stretch reads 1. It appears at one. A session extends the streak if the weight went up, or the weight held and the reps went up; it breaks on an identical session, a weight drop, fewer reps at the same weight, or the bottom of the rep range, which is a failed set however much weight was on the machine. Short of that bottom value, a weight increase extends the streak whatever the reps do — hitting the top of the range bumps the weight and resets the dropdown to the exercise's start reps, so treating that as backsliding would cap every streak at two. Weighted exercises only, and the numeric streak counts submitted sessions, so it moves when you hit Submit Day rather than when you log. While a card is sitting in its pre-submit Logged state, that numeric pill is replaced by a PR pill if the just-logged set improved against the previous submitted session. That pill counts the run it just extended — "🔥 PR" for a lone improvement, "🔥 4" once the run is four long — which is the same wording History gives the row after you submit, and unlike the pre-log pill it includes the set you just logged. PR logs hold the card for two seconds with a gold aura, pulse, and shimmer before advancing.
- **Day Breakdown**: "Submit Day" shows the completed-exercise count, PRs, how long you were at the gym, and each logged exercise's time. A PR is exactly what the streak badge counts — the weight went up, or the weight held and the reps went up — so the two can never disagree. Rows that counted toward the PR total show a pill beside the exercise name, worded exactly as it is on the logged card and in History: "🔥 PR" for a lone improvement, "🔥 N" once the run is two or more. A weight drop is never a PR however many extra reps came with it, which matters because a plateau-buster recovery is a deliberate weight drop and used to be reported as a personal best. Neither is a set logged at the bottom of the rep range, since that is where the set failed rather than a number you trained for. Cardio never counts.
- **Session timing**: the clock for a movement runs from the moment you open its Weight Breakdown — which you do at the machine, to see how to load it — to the moment you tap LOG. If the machine is taken and you go do something else, the clock restarts when you come back and open the panel again, so the time reported is the set rather than the wandering; the newest tap always wins. Nothing to start or stop by hand. The session total runs from the first panel you opened to the last thing you logged, so submitting late from the car cannot inflate it. Log something without ever opening its panel and it is estimated from the previous log instead, less two minutes for walking over, and marked with an asterisk. No single movement may claim more than 30 minutes — past that the app reports NA rather than a number nobody should trust, which is what you see if you open a panel and wander off without logging it. Workouts logged before August 2026 carry no timestamps and show no timing block at all. A phone that reloads the tab between sets — screen off, patchy signal — comes back on the card that was open, on its day, still open and still timed from the original tap; a card you walked away from, or already logged, is not reopened.

## Data

- Signed in, Firestore is the backup; nothing downloads on day submission any more.
- Export, import, and reset are available from the Settings gear.
- The History tab browses by week, counting up from your first workout. Each day is editable via the pencil button, and a ⏱️ beside it opens that session's timing — the same per-movement breakdown the Day Breakdown modal shows, still readable long after the day it was logged. Standard exercises that count toward "PRs Smashed" show the same gold-outlined flame badge used on the workout card: "🔥 PR" for a lone improvement, "🔥 N" once the run is two or more, counted as of that day so an older row keeps the number it earned. It does not wait for Submit Day — today's in-progress entry is in this list too, so the badge appears as soon as the set is logged, and cannot change when the day is submitted because the baseline it compares against is always an older submitted session.

## Appearance

The accent color changes once a day. It is the family the whole UI hangs off — LOG and Weight Breakdown buttons, active day/nav pills, section titles, the gear, Submit Day — and it rotates through a bank of ten, keyed to the calendar date so it is stable all day and flips at local midnight.

Each palette holds the original purple's exact OKLCH lightness and chroma and rotates hue only, so every color reads as equally dark and equally desaturated. Backgrounds never change. Gold-outlined PRs, gold plateau hints, and the red NA button are fixed since they carry meaning.

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
