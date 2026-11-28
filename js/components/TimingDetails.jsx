        // The per-movement rows of a session's timing in the Day Breakdown that
        // pops on Complete Day. (History shows the same figures on each row of
        // its cards; see HistoryDeck.) Day Breakdown passes PR ids to annotate
        // the rows it just counted, plus `prStreaksById` for how long each of
        // those runs is. The badge then reads the way it does in History and on
        // the logged card: "PR" for a lone PR, "PR ×N" once the run is two or
        // more.
        //
        // `timing` is a getSessionTiming result and is never null here — the
        // caller guards on it, because a workout with no timestamps at all
        // (anything logged before August 2026) should render nothing rather
        // than an empty list.
        function TimingDetails({ timing, prExerciseIds = [], prStreaksById = {} }) {
            const hasEstimatedRow = timing.rows.some(r => r.estimated);
            const prSet = new Set(prExerciseIds);

            return (
                <div data-timing-details style={{ marginBottom: '20px', fontSize: '14px' }}>
                    {timing.rows.map(row => {
                        const isPR = prSet.has(row.id);
                        const prStreak = prStreaksById[row.id] || 0;
                        return (
                            <div
                                key={row.id}
                                data-timing-row={row.id}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '6px 0',
                                    borderBottom: '1px solid #2a2a3a'
                                }}
                            >
                            <span style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                                <span>{row.name}</span>
                                {isPR ? (
                                    <PRPill as="span" streak={prStreak} className="streak-badge day-breakdown-pr-badge" data-day-breakdown-pr-badge
                                            data-streak={prStreak > 1 ? prStreak : undefined} />
                                ) : null}
                            </span>
                            <span style={{ fontWeight: '600', whiteSpace: 'nowrap' }}>
                                {row.seconds === null
                                    ? 'NA'
                                    : formatSecondsToTime(row.seconds) + (row.estimated || row.placeholder ? ' *' : '')}
                            </span>
                            </div>
                        );
                    })}
                    {hasEstimatedRow && (
                        <div style={{ marginTop: '10px', color: '#888', fontSize: '12px' }}>
                            * estimated — Weight Breakdown was not opened for this movement,
                            so it is measured from the previous log
                        </div>
                    )}
                </div>
            );
        }
