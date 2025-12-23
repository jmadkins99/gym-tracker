# Gym Tracker App

A personalized FBEOD workout tracking web app. 

## Features

### Workout Tracking
- **Two-Day Routine**: Alternates automatically between Full Body Day and Accessory Day
- **Weekly Tracker**: Displays current ISO week number (weeks start on Monday)
- **Sequential Day Counter**: Weekly view shows newest workouts first (Day 5, Day 4, Day 3...) for easy access
- **Instant Save**: LOG button immediately saves to Weekly tab - no page refresh needed
- **Smart Initialization**: First LOG creates the day entry with all exercises marked as NA
- **Live Updates**: Each LOG updates that specific exercise in the Weekly view
- **Previous Workout Data**: See your last weight/reps for each exercise above the input fields
- **Input Hints**: Placeholder text shows values from your last workout (e.g., "50" for weight, "8" for reps)
- **Visual Feedback**: Logged exercises show ✓ Logged and persist across page refreshes
- **Manual Entry**: All inputs are blank by default - you choose what weight and reps to use

### PR Tracking
- **Day Breakdown**: "Submit Day and View Breakdown" shows completed exercises count and PRs smashed
- **Simple PR Counter**: Compares your workout to the most recent previous workout of the same type
- **PR Detection**: Counts as a PR if weight OR reps increased for standard exercises
- **Multiple Exercise Types**: Tracks PRs for weight/reps, bodyweight reps, assault bike rounds, and stairmaster time
- **No Automation**: App tracks your PRs but doesn't tell you what to lift - you're in control
- **Clean Interface**: Minimal distractions, maximum focus on your workout

### Data Safety
- **Automatic Backup**: App downloads the backup .json file on every day submission
- **Export Data**: Download JSON backup file to your phone via Settings gear icon
- **Import Data**: Restore from backup if you switch devices or clear browser data
- **Reset Data**: Nuclear option in Settings with double confirmation to wipe everything
- **Local Storage**: All data stays on your device - completely private

### Progress Tracking
- **Weekly View**: Navigate through your workout history week by week
- **Sequential Day Numbers**: See Day 1, Day 2, Day 3, etc. (total workouts completed)
- **Progress Charts**: Visual graphs showing weight progression over time
- **Date-Based Charts**: X-axis shows dates, Y-axis shows weight/rounds/time
- **Per-Exercise Tracking**: Select any exercise to see its progression graph
- **Clean History**: Shows date only (no finish times)

## Your Routine

### Full Body Day
**Upper Body (12 exercises)**
- Chest Flies
- Incline Chest Press Machine
- Flat Chest Press Machine
- Shoulder Press Machine
- Preacher Curls
- Cuffed Tricep Pushdown
- Cuffed Cable Lateral Raises
- Cuffed Overhead Tricep Extension
- Frontal Plane Pulldowns
- Upper Back Row Machine
- Machine Kelso Shrugs
- Extreme Row Machine

**Lower Body (4 exercises)**
- Leg Extensions
- Precor Seated Leg Curls
- Hip Adduction Machine
- Seated Calf Raise Machine

### Accessory Day
**Accessories (3 exercises)**
- Cable Wrist Curls
- Ab Crunch Machine
- Hanging Leg Raises (Body Weight)

**Cardio (2 exercises)**
- Assault Bike (30/30 intensity, tracked by rounds)
- StairMaster (Selectable level 7-10, time dropdown 5:00-20:00 in 15-second increments)

## Tech Stack

- React 18 (via CDN)
- Chart.js for progress visualization
- Local Storage API for data persistence
- Single HTML file - no build process needed

## Tips

- LOG button saves immediately - your data is safe even if the page refreshes
- First LOG of the day creates the workout entry with all exercises (logged ones have data, rest show NA)
- Page refreshes won't lose your progress - logged exercises stay marked as ✓ Logged
- Input placeholders show your last workout values as hints (e.g., "50" for weight if you did 50lbs last time)
- "Last: Xlbs × Y" text stays visible above each exercise for easy reference
- "Submit Day and View Breakdown" shows exercises completed and PRs smashed
- You can switch between Full Body Day and Accessory Day manually if needed
- Weekly view shows newest workouts first with descending day numbers (Day 5, Day 4, Day 3...)
- PRs are counted when weight OR reps increase compared to your last workout of that type
- The monthly reminder helps prevent data loss
- StairMaster has dropdown selectors: choose level (7-10) and time from 5:00 to 20:00 in 15-second increments
- You're in full control - no auto-suggestions, you decide what weight to lift
