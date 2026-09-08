        // The check-in screen: one card, full height, mirroring the gym-tracker
        // deck card so the two pages read as one app. There is nothing to swipe
        // through here — a day has exactly one weigh-in — so the card is the
        // whole screen rather than a rail of them.
        //
        // Two states, and the difference between them is the entire privacy
        // design of this page. Before you log, the card is an input. After you
        // log, it shows the number you just typed and nothing else raw, and at
        // midnight even that is gone: tomorrow's card has no route back to
        // today's reading. Today stays visible only so a fat-fingered 187 for
        // 178 can be corrected before it skews the trend.
        const PR_CELEBRATION_MS = 2000;

        function CheckInView({ log, todayKey, onCheckIn, celebrating }) {
            const today = entryFor(log, todayKey);
            const [draft, setDraft] = React.useState('');
            const [editing, setEditing] = React.useState(false);
            const inputRef = React.useRef(null);

            // A day rollover while the tab sat open must not leave yesterday's
            // draft in the field.
            React.useEffect(() => {
                setDraft('');
                setEditing(false);
            }, [todayKey]);

            const showInput = !today || editing;

            React.useEffect(() => {
                if (showInput && inputRef.current) inputRef.current.focus();
            }, [showInput]);

            const trend = currentTrend(log);
            const rate = weeklyRate(log);
            const weeks = weeklyAverages(log);
            const dayStreak = checkInStreak(log);
            const wkStreak = weekStreak(weeks);

            // Accepts a bare number with at most one decimal place. Rejecting
            // the rest at the keystroke is friendlier than validating on submit,
            // and inputMode=decimal is what gets a phone to offer a keypad
            // without type=number's spinner and locale headaches.
            const onDraftChange = (e) => {
                const v = e.target.value;
                if (v === '' || /^\d{0,3}(\.\d?)?$/.test(v)) setDraft(v);
            };

            const parsed = parseFloat(draft);
            const valid = draft !== '' && !isNaN(parsed) && parsed > 0;

            const submit = () => {
                if (!valid) return;
                onCheckIn(parsed);
                setDraft('');
                setEditing(false);
            };

            // Kept to one line: this sits directly under the trend value and a
            // wrapping sentence shoves the whole card around on the day it
            // appears, which is every day of the first week.
            const rateLine = rate === null
                ? 'rate after ~a week'
                : (rate < -0.05 ? '↓ ' : rate > 0.05 ? '↑ ' : '→ ') +
                  formatWeight(Math.abs(rate)) + ' lb / week';

            return (
                <div className="weigh-stage">
                    <div className={'card weigh-card' + (celebrating ? ' pr-celebrating' : '') + (today && !editing ? ' is-done' : '')}>
                        <StreakBadges dayStreak={dayStreak} weekStreak={wkStreak} />

                        {showInput ? (
                            <div className="weigh-body">
                                <div className="weigh-date">{formatDayLabel(todayKey)}</div>
                                <div className="weigh-prompt">
                                    {today ? 'Correct today’s reading' : 'Morning weigh-in'}
                                </div>

                                <div className="weigh-entry">
                                    {/* No placeholder: at this type size any
                                        glyph reads as a solid bar rather than a
                                        hint. The underline is the affordance. */}
                                    <input
                                        ref={inputRef}
                                        className="weigh-input"
                                        type="text"
                                        inputMode="decimal"
                                        value={draft}
                                        onChange={onDraftChange}
                                        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                                    />
                                    <span className="weigh-input-unit">lbs</span>
                                </div>

                                <button className="save-btn weigh-submit" onClick={submit} disabled={!valid}>
                                    {today ? 'SAVE CORRECTION' : 'CHECK IN'}
                                </button>
                                {today && (
                                    <button className="weigh-link" onClick={() => { setDraft(''); setEditing(false); }}>
                                        Cancel
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="weigh-body">
                                <div className="logged-chip weigh-chip">✓ Checked in</div>

                                <div className="hero weigh-hero">
                                    <div className="hero-weight">
                                        {formatWeight(today.weight)}<span className="hero-unit">lbs</span>
                                    </div>
                                </div>
                                {/* Says out loud that the number above is on a
                                    timer. Without this the disappearance reads
                                    as data loss rather than as the point. */}
                                <div className="weigh-ephemeral">today only — not shown again after tonight</div>

                                <div className="weigh-divider" />

                                <div className="weigh-trend">
                                    <div className="weigh-trend-label">Trend</div>
                                    <div className="weigh-trend-value">{formatWeight(trend)}</div>
                                    <div className={'weigh-rate' + (rate !== null && rate < -0.05 ? ' good' : '')}>
                                        {rateLine}
                                    </div>
                                </div>

                                <button className="weigh-link" onClick={() => { setDraft(formatWeight(today.weight)); setEditing(true); }}>
                                    Edit today’s entry
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            );
        }
