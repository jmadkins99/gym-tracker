# Gym Tracker App

A personalized workout tracking web app. 

## Features

### Workout Tracking
- **Anterior-Posterior Routine**: Manually select between Anterior and Posterior days
- **Weekly Tracker**: Displays current ISO week number (weeks start on Monday)
- **Sequential Day Counter**: Weekly view shows newest workouts first (Day 5, Day 4, Day 3...) for easy access
- **Instant Save**: LOG button immediately saves to Weekly tab - no page refresh needed
- **Smart Initialization**: First LOG creates the day entry with all other exercises marked as NA
- **Live Updates**: Each LOG updates that specific exercise in the Weekly view
- **Previous Workout Data**: See your last weight/reps for each exercise above the input fields
- **Input Hints**: Placeholder text shows values from your last workout (e.g., "50" for weight, "8" for reps)
- **Visual Feedback**: Logged exercises show checkmark and persist across page refreshes
- **Manual Entry**: All inputs are blank by default - you choose what weight and reps to use
- **Weight Breakdown**: Click the "Weight Breakdown" button on any exercise to see warmup set recommendations
  - **Plate-Loaded Machines**: Shows 2 warmup sets (50%, 75%) with exact plate breakdown per side
  - **Pin-Stack Machines**: Shows 2 warmup sets (50%, 75%) rounded to achievable weights (5 lb increments + micro-plates)

### PR Tracking (Two Modes)
- **Simple PR Tracking** (default): If you hit 6 reps (top of 4-6 range) last session, weight auto-increments and the weight box highlights green with target of 4 reps
- **Stagnation Detection**: If same weight and reps for 3 consecutive sessions, gold "2 Sets Recommended" indicator appears until the streak breaks
- **Advanced PR Tracking** (optional): Full plateau buster + PR auto-regulation system with weight recovery and trial of strength mechanics
- **Day Breakdown**: "Submit Day and View Breakdown" shows completed exercises count and PRs smashed
- **PR Detection**: Counts as a PR if weight OR reps increased (reps >= 4 threshold)

### Data Safety
- **Automatic Backup**: App downloads the backup .json file on every day submission
- **Export Data**: Download JSON backup file to your phone via Settings gear icon
- **Import Data**: Restore from backup if you switch devices or clear browser data
- **Reset Data**: Nuclear option in Settings with double confirmation to wipe everything
- **Local Storage**: All data stays on your device - completely private

### Progress Tracking
- **Weekly View**: Navigate through your workout history week by week
- **Sequential Day Numbers**: See Day 1, Day 2, Day 3, etc. (total workouts completed)

## Tech Stack

- React 18 (via CDN)
- Babel standalone for JSX transpilation
- Local Storage API for data persistence
- Modular file structure - no build process needed

## File Structure

```
index.html              # Entry point - loads all scripts
css/styles.css          # App styles
js/config.js            # Exercise defaults, weight increments, tracking mode flags
js/utils.js             # Storage helpers, date/week utilities
js/migrations.js        # localStorage migration logic
js/plateauLogic.js      # PR tracking, plateau buster, stagnation detection
js/components/
  App.jsx               # Main app component, state management, data persistence
  WorkoutView.jsx       # Active workout UI with exercise cards
  WeeklyView.jsx        # Historical workout browser
  SettingsModal.jsx     # Settings, exercise management, import/export
  EditWorkoutModal.jsx  # Edit historical workout data
  DayBreakdownModal.jsx # Post-workout summary with PR count
  BackupReminderModal.jsx # Monthly backup reminder
```
