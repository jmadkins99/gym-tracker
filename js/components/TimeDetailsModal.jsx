        // The per-movement rows of a session's timing, shared by the two places
        // that show them: the Day Breakdown that pops on Complete Day, and the
        // History tab's ⏱️ button, which is the only way to see them again once
        // the day has rolled over. One copy so the two cannot drift.
        //
        // `timing` is a getSessionTiming result and is never null here — both
        // callers guard on it, because a workout with no timestamps at all
        // (anything logged before August 2026) should render nothing rather
        // than an empty list.
        function TimingDetails({ timing }) {
            const hasEstimatedRow = timing.rows.some(r => r.estimated);

            return (
                <div data-timing-details style={{ marginBottom: '20px', fontSize: '14px' }}>
                    {timing.rows.map(row => (
                        <div
                            key={row.id}
                            data-timing-row={row.id}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: '12px',
                                padding: '6px 0',
                                borderBottom: '1px solid #2a2a3a'
                            }}
                        >
                            <span>{row.name}</span>
                            <span style={{ fontWeight: '600', whiteSpace: 'nowrap' }}>
                                {row.seconds === null
                                    ? 'NA'
                                    : formatSecondsToTime(row.seconds) + (row.estimated ? ' *' : '')}
                            </span>
                        </div>
                    ))}
                    {hasEstimatedRow && (
                        <div style={{ marginTop: '10px', color: '#888', fontSize: '12px' }}>
                            * estimated — Weight Breakdown was not opened for this movement,
                            so it is measured from the previous log
                        </div>
                    )}
                </div>
            );
        }

        // Timing for one workout out of history, opened from the ⏱️ beside a
        // History entry's pencil. Unlike the Day Breakdown this carries no
        // toggle: seeing the breakdown is the whole reason the button was
        // pressed, so it opens expanded.
        //
        // Nothing is read off today's date here — the workout is whichever one
        // was tapped. `foregroundAt` is passed through unchanged from App, and
        // is only ever consulted for a first movement that has no startedAt;
        // for a workout from a previous day getSessionTiming's own
        // `foregroundMs <= loggedMs` guard rejects it, so a stamp from today
        // cannot leak into an older session's arithmetic.
        function TimeDetailsModal({ workout, foregroundAt, onClose }) {
            const timing = getSessionTiming(workout, foregroundAt);
            if (!timing) return null;

            const date = new Date(workout.date);
            const formattedDate = date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            return (
                <div className="modal-overlay" onClick={onClose}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="modal-title">{getWorkoutDayLabel(workout)} Time Details</div>

                        <div style={{ marginBottom: '20px', color: '#888', fontSize: '14px' }}>
                            {formattedDate}
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '10px' }}>
                                Time at the Gym
                            </div>
                            <div data-timing-total style={{ fontSize: '32px', fontWeight: '700', color: 'var(--accent)' }}>
                                {formatDuration(timing.totalSeconds)}
                            </div>
                        </div>

                        <TimingDetails timing={timing} />

                        <button className="modal-btn primary" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>
            );
        }
