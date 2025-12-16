# Gym Tracker App

A minimalist workout tracking web app optimized for iPhone 15 Pro. Track your progress, log PRs, and never lose your data. Features a dark theme that's easy on the eyes.

## Features

### Workout Tracking
- **Two-Day Routine**: Alternates automatically between Full Body Day and Accessory Day
- **Auto Day Detection**: App knows what day it is based on the calendar (Dec 15, 2025 = Day 1, then alternates forever)
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
- **Monthly Backup Reminders**: App reminds you every 30 days to download a backup
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
- Upper Back Row Machine
- Machine Kelso Shrugs
- Frontal Plane Pulldowns
- Seated Row Machine

**Lower Body (4 exercises)**
- Leg Extensions
- Prone Leg Curls
- Hip Adduction Machine
- Seated Calf Raise Machine

**Cardio (1 exercise)**
- Assault Bike (30/30 intensity, tracked by rounds)

### Accessory Day
**Accessories (3 exercises)**
- Cable Wrist Curls
- Ab Crunch Machine
- Hanging Leg Raises (Body Weight)

**Cardio (1 exercise)**
- StairMaster (Selectable level 7-10, time dropdown 5:00-20:00 in 15-second increments)

## How to Use

### Deploying the App

**Option 1: GitHub Pages (Recommended)**
1. Go to: https://github.com/jmadkins99/gym-tracker/settings/pages
2. Source: Deploy from branch `main`
3. Click Save
4. Your app will be live at: `https://jmadkins99.github.io/gym-tracker/`

**Option 2: Netlify Drop**
1. Go to https://app.netlify.com/drop
2. Drag and drop `index.html`
3. Get instant live URL

**Option 3: Open Locally**
1. Open `index.html` in Safari on your iPhone
2. Tap Share → "Add to Home Screen"

### Using the App

1. **Start Workout**: App automatically shows today's routine (Full Body or Accessory Day) and current week
2. **See Last Workout**: Check the "Last: Xlbs × Y" text above each exercise for reference
3. **Enter Data**: Fill in weight and reps for each exercise - placeholders show your last workout values as hints
4. **LOG Exercise**: Tap LOG button after each exercise - saves immediately and button shows ✓ Logged
5. **Check Weekly Tab**: Your workout appears instantly with logged exercises and NA for remaining
6. **Continue Logging**: Return to Workout tab and log more exercises - each updates the Weekly entry
7. **Submit Day**: When done, tap "Submit Day and View Breakdown" to see exercises completed and PRs smashed
8. **Track Progress**: Use Progress tab to see weight/time progression graphs
9. **Backup Data**: Tap the ⚙️ gear icon and export your data monthly

## Important Data Safety Notes

⚠️ **Your workout data is stored in your browser's local storage**

**This means:**
- Data is private - never leaves your phone
- Works offline
- BUT: Data is tied to Safari on this specific iPhone
- If you clear Safari's browsing data, you lose everything
- Getting a new phone doesn't transfer data automatically

**To protect your data:**
- Download monthly backups using the Settings gear icon
- Save the JSON file to your iCloud Drive or Files app
- If you lose data, use Import to restore from backup
- NEVER use Reset Data unless you want to start completely fresh

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
- Export your data before major iOS updates or Safari changes
- The monthly reminder helps prevent data loss
- StairMaster has dropdown selectors: choose level (7-10) and time from 5:00 to 20:00 in 15-second increments
- You're in full control - no auto-suggestions, you decide what weight to lift
- Dark theme is easy on the eyes during early morning or late night workouts
