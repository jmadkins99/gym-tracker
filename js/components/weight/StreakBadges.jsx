        // The two badges, side by side, above the card's content.
        //
        // Both are deliberately about a RUN rather than a record. gym-tracker's
        // PR badge fires on a new best and that is right for a lift, where the
        // number only goes one way and there is no floor. Body weight has a
        // floor and chasing a lifetime low on it is the failure mode this page
        // is built to avoid, so neither badge here ever says "new low".
        //
        // The two measure different things on purpose. The daily one is pure
        // adherence — days in a row you stood on the scale, whatever it said —
        // because showing up is a choice and what the scale reads on a given
        // morning largely is not. The weekly one is the outcome: an average
        // that fell against last week's. Rewarding a daily DROP, which is what
        // the fire badge used to do, pays out for water loss and punishes a
        // refeed, and it goes dark for weeks during a regain — when the point
        // is to keep logging.
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
