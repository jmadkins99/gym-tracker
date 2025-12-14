# Gym Tracker App

A gamified workout tracking web app optimized for iPhone 15 Pro. Track your progress, celebrate PRs, and never lose your data.

## Features

### Workout Tracking
- **Two-Day Routine**: Alternates automatically between Day 1 (Full Body) and Day 2 (Accessories + Core)
- **Auto Day Detection**: App knows what day it is based on the calendar (Dec 14, 2025 = Day 1, then alternates forever)
- **Individual LOG Buttons**: Save each exercise as you complete it - no need to finish the whole workout
- **Previous Workout Data**: See your last weight/reps for each exercise
- **Visual Feedback**: Logged exercises turn green with checkmark

### Gamification & PRs
- **Trophy Celebration**: Hit 8+ reps and get confetti + trophy animation
- **PR Ready Badge**: Golden badge appears when you're ready for a personal record
- **PR Suggestions**: Auto-suggests +1.25 lbs when you hit 8+ reps last time
- **Golden Glow**: PR attempt inputs glow gold to hype you up

### Data Safety
- **Monthly Backup Reminders**: App reminds you every 30 days to download a backup
- **Export Data**: Download JSON backup file to your phone via Settings gear icon
- **Import Data**: Restore from backup if you switch devices or clear browser data
- **Local Storage**: All data stays on your device - completely private

### Progress Tracking
- **History View**: See every workout with date, time, and all exercises logged
- **Progress Charts**: Visual graphs showing weight and rep progression over time
- **Dual-Axis Charts**: See both weight and reps on the same chart

## Your Routine

### Day 1 - Full Body
**Upper Body (11 exercises)**
- Chest Flies
- Flat Chest Press Machine
- Shoulder Press Machine
- Preacher Curls
- Cuffed Tricep Pushdown
- Cuffed Cable Lateral Raises
- Cuffed Overhead Tricep Extension
- Upper Back Row Machine
- Machine Kelso Shrugs
- Frontal Plane Pulldowns
- Hammer Strength Row Machine

**Lower Body (4 exercises)**
- Leg Extensions
- Seated Leg Curls
- Hip Adduction Machine
- Seated Calf Raise Machine

**Cardio (1 exercise)**
- Assault Bike (30/30 intensity, tracked by rounds)

### Day 2 - Accessories & Core
**Accessories (3 exercises)**
- Cable Wrist Curls
- Ab Crunch Machine
- Hanging Leg Raises

**Cardio (1 exercise)**
- StairMaster

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

1. **Start Workout**: App automatically shows today's routine (Day 1 or Day 2)
2. **Enter Data**: Fill in weight and reps for each exercise
3. **LOG Exercise**: Tap the green LOG button after each exercise to save it
4. **Complete Day**: When done, tap "Complete Day" at the bottom
5. **Backup Data**: Tap the ⚙️ gear icon and export your data monthly

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

## Tech Stack

- React 18 (via CDN)
- Chart.js for progress visualization
- Local Storage API for data persistence
- Single HTML file - no build process needed

## Tips

- Don't skip LOG buttons - they save as you go in case something crashes
- The app suggests PR weights when you hit 8+ reps - go for it!
- You can switch between Day 1 and Day 2 manually if needed
- Export your data before major iOS updates or Safari changes
- The monthly reminder helps prevent data loss
