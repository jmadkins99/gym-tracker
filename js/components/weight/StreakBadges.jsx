        // The two badges, side by side, above the card's content.
        //
        // Both are deliberately about a RUN rather than a record. gym-tracker's
        // PR badge fires on a new best and that is right for a lift, where the
        // number only goes one way and there is no floor. Body weight has a
        // floor and chasing a lifetime low on it is the failure mode this page
        // is built to avoid, so neither badge here ever says "new low" — the
        // daily one rewards a reading that held or fell against the last one,
        // and the weekly one rewards an average that fell against last week's.
        // Break either and it resets to nothing; there is no all-time number
        // sitting there to be beaten.
        function StreakBadges({ dayStreak, weekStreak }) {
            if (!dayStreak && !weekStreak) return null;
            return (
                <div className="weigh-badges">
                    {dayStreak > 0 && (
                        <span className="streak-badge weigh-badge">
                            🔥 {dayStreak} day{dayStreak === 1 ? '' : 's'}
                        </span>
                    )}
                    {weekStreak > 0 && (
                        <span className="streak-badge weigh-badge">
                            📉 {weekStreak} wk{weekStreak === 1 ? '' : 's'}
                        </span>
                    )}
                </div>
            );
        }
