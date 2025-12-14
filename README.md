# Gym Tracker App

A minimalist workout tracking web app optimized for iPhone 15 Pro. Track your progress, celebrate PRs, and never lose your data. Features a dark theme that's easy on the eyes.

## Features

### Workout Tracking
- **Two-Day Routine**: Alternates automatically between Day 1 (Full Body) and Day 2 (Accessories + Core)
- **Auto Day Detection**: App knows what day it is based on the calendar (Dec 14, 2025 = Day 1, then alternates forever)
- **Weekly Tracker**: Displays current ISO week number (weeks start on Monday)
- **Sequential Day Counter**: Weekly view shows Day 1, Day 2, Day 3, etc. - total workouts completed
- **Instant Save**: LOG button immediately saves to Weekly tab - no page refresh needed
- **Smart Initialization**: First LOG creates the day entry with all exercises marked as NA
- **Live Updates**: Each LOG updates that specific exercise in the Weekly view
- **Previous Workout Data**: See your last weight/reps for each exercise
- **Visual Feedback**: Logged exercises show ✓ Logged and persist across page refreshes
- **Week 1 Defaults**: Pre-filled starting weights for your first week
- **Smart Placeholders**: When weight increases, reps default to 6 (realistic for heavier weight)

### Gamification & PRs
- **Day Breakdown**: "View Day Breakdown" button shows completed exercises count and all PRs hit
- **PR Tracking**: Automatically detects and highlights personal records for weight, reps, rounds, and time
- **Subtle PR Glow**: Hit 8+ reps and get a subtle golden glow around your screen
- **Weight Suggestions**: Shows "+1.25 lbs" when you hit 8+ reps last time
- **Smart Rep Defaults**: Reps default to 6 when increasing weight
- **Assault Bike**: Suggests +1 round when ready (default: 5 rounds)
- **StairMaster**: Suggests +15 seconds when ready
- **Minimal Noise**: Clean interface with only essential feedback

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

### Day 1 - Full Body
**Upper Body (11 exercises)**
- Chest Flies (165 lbs starting)
- Flat Chest Press Machine (135 lbs starting)
- Shoulder Press Machine (126.25 lbs starting)
- Preacher Curls (56.25 lbs starting)
- Cuffed Tricep Pushdown (36.25 lbs starting)
- Cuffed Cable Lateral Raises (27.5 lbs starting)
- Cuffed Overhead Tricep Extension (27.5 lbs starting)
- Upper Back Row Machine (190 lbs starting)
- Machine Kelso Shrugs (190 lbs starting)
- Frontal Plane Pulldowns (180 lbs starting)
- Hammer Strength Row Machine (117.5 lbs starting)

**Lower Body (4 exercises)**
- Leg Extensions (240 lbs starting)
- Seated Leg Curls (150 lbs starting)
- Hip Adduction Machine (120 lbs starting)
- Seated Calf Raise Machine (180 lbs starting)

**Cardio (1 exercise)**
- Assault Bike (30/30 intensity, tracked by rounds, default: 5 rounds, PR = +1 round)

### Day 2 - Accessories & Core
**Accessories (3 exercises)**
- Cable Wrist Curls (87.5 lbs starting)
- Ab Crunch Machine (140 lbs starting)
- Hanging Leg Raises (Body Weight)

**Cardio (1 exercise)**
- StairMaster (Level 7, tracked by time in MM:SS format, PR = +15 seconds)

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

1. **Start Workout**: App automatically shows today's routine (Day 1 or Day 2) and current week
2. **Enter Data**: Fill in weight and reps for each exercise
3. **LOG Exercise**: Tap LOG button after each exercise - saves immediately to Weekly tab
4. **Check Weekly Tab**: Your workout appears instantly with logged exercises and NA for remaining
5. **Continue Logging**: Return to Workout tab and log more exercises - each updates the Weekly entry
6. **View Breakdown**: When done, tap "View Day Breakdown" to see completed count and PRs hit
7. **Track Progress**: Use Progress tab to see weight/time progression graphs
8. **Backup Data**: Tap the ⚙️ gear icon and export your data monthly

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
- Week 1 defaults are pre-filled to help you get started quickly
- The app suggests "+1.25 lbs" when you hit 8+ reps - go for it!
- When weight increases, reps default to 6 (a realistic target for heavier weight)
- Subtle golden glow celebrates when you hit 8+ reps
- "View Day Breakdown" shows your PRs and completion progress
- You can switch between Day 1 and Day 2 manually if needed
- Weekly view shows sequential day numbers (Day 1, Day 2, Day 3...)
- Export your data before major iOS updates or Safari changes
- The monthly reminder helps prevent data loss
- StairMaster time format: enter as MM:SS (e.g., "12:45" for 12 minutes 45 seconds)
- Assault Bike defaults to 5 rounds placeholder
- Dark theme is easy on the eyes during early morning or late night workouts
