# Gym Tracker App

A personalized workout tracking web app. 

## Features

### Workout Tracking
- **Upper-Lower-Upper-Rest Routine**: Alternates automatically between Upper - Lower - Upper - Rest
- **Weekly Tracker**: Displays current ISO week number (weeks start on Monday)
- **Sequential Day Counter**: Weekly view shows newest workouts first (Day 5, Day 4, Day 3...) for easy access
- **Instant Save**: LOG button immediately saves to Weekly tab - no page refresh needed
- **Smart Initialization**: First LOG creates the day entry with all other exercises marked as NA
- **Live Updates**: Each LOG updates that specific exercise in the Weekly view
- **Previous Workout Data**: See your last weight/reps for each exercise above the input fields
- **Input Hints**: Placeholder text shows values from your last workout (e.g., "50" for weight, "8" for reps)
- **Visual Feedback**: Logged exercises show ✓ Logged and persist across page refreshes
- **Manual Entry**: All inputs are blank by default - you choose what weight and reps to use
- **Weight Breakdown**: Click the "Weight Breakdown" button on any exercise to see warmup set recommendations
  - **Plate-Loaded Machines**: Shows 2 warmup sets (50%, 75%) with exact plate breakdown per side
  - **Pin-Stack Machines**: Shows 2 warmup sets (50%, 75%) rounded to achievable weights (5 lb increments + micro-plates)

### PR Tracking
- **Day Breakdown**: "Submit Day and View Breakdown" shows completed exercises count and PRs smashed
- **Simple PR Counter**: Compares your workout to the most recent previous workout of the same type
- **PR Detection**: Counts as a PR if weight OR reps increased for standard exercises
- **Multiple Exercise Types**: Tracks PRs for weight/reps, bodyweight reps, and assault bike wattage
- **Clean Interface**: Minimal distractions, maximum focus on your workout

### Auto-Regulation & Plateau Busting
- **Plateau Buster**: When you get less than 6 reps on a set or you don't progress in weight/reps, the app automatically reduces the weight next session (orange border)
  - Weight drops by the exercise's PR increment (e.g., 2.5 lbs for most compound movements)
  - Goal: Hit 8 reps with the reduced weight to prove you've recovered
  - If you hit 8+ reps: Triggers Trial of Strength next session
  - If you get 6-7 reps: Retry at same weight, aiming for +1 rep next session (no Trial of Strength)
- **Trial of Strength**: After successfully completing a plateau buster (8+ reps), return to your original PR weight
  - Green border indicates Trial of Strength active
  - Goal: Hit 6 reps at your previous PR weight to reclaim it
- **PR Auto-Regulation**: When you hit 8+ reps, weight automatically increases next session (green border)
  - No manual calculation needed - app suggests the progression

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
- Chart.js for progress visualization
- Local Storage API for data persistence
- Single HTML file - no build process needed
