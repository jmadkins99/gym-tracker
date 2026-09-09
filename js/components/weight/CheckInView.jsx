        // The check-in screen: one card, full height, mirroring the gym-tracker
        // deck card so the two pages read as one app. There is nothing to swipe
        // through here — a day has exactly one weigh-in — so the card is the
        // whole screen rather than a rail of them.
        //
        // Two states. Before you log, the card is an input. After you log, it
        // shows the number you just typed above the week's average, and at
        // midnight the raw number goes: tomorrow's card opens on the average
        // rather than on yesterday's reading. The reading itself is not gone —
        // the History chart plots it — but this card is about where the week
        // sits, and a fat-fingered 187 for 178 can be corrected here on the day
        // rather than hunted down later.
        const PR_CELEBRATION_MS = 2000;

        function CheckInView({ log, todayKey, onCheckIn, celebrating, progress }) {
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

            const weeks = weeklyAverages(log);
            // The mean of this week's readings, not the EMA — the card and the
            // History ledger's top row are the same number by construction.
            const weekAvg = currentWeekAverage(log);
            const rate = weeklyAverageRate(log);
            const dayStreak = checkInStreak(log, todayKey);
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

            // Kept to one line: this sits directly under the headline number
            // and a wrapping sentence shoves the whole card around on the day
            // it appears, which is every day of the first fortnight.
            const rateLine = rate === null
                ? 'rate after a second week'
                : (rate < -0.05 ? '↓ ' : rate > 0.05 ? '↑ ' : '→ ') +
                  formatWeight(Math.abs(rate)) + ' lb / week';

            // With a plan running, the card is about the number being chased
            // rather than the one already reached: the week's target, and how
            // far off it this week's average currently sits. `gap` is that
            // distance, positive while there is still weight to come off, and
            // it is read off planProgress rather than recomputed so the card
            // and the plan dashboard cannot disagree about the same week.
            //
            // Without a plan there is nothing to beat, so the card falls back
            // to reporting where the week actually is.
            //
            // Three states, and the middle one exists because of the rounding
            // rather than in spite of it: the distance prints to a tenth, so
            // anything inside half a tenth of the target would otherwise read
            // "0.0 pounds away" — a sentence that says you have arrived while
            // insisting you have not. That band is the target met.
            const MET_BAND = 0.05;
            const target = progress ? {
                weight: progress.planWeight,
                behind: progress.gap > MET_BAND,
                line: progress.gap > MET_BAND
                    ? formatWeight(progress.gap) + ' pounds away'
                    : (progress.gap >= -MET_BAND
                        ? 'Target met'
                        : formatWeight(-progress.gap) + ' pounds over goal'),
            } : null;

            // The hero is the number the line below it is measured FROM: this
            // week's average, read off planProgress so it is literally the
            // figure the distance was computed against rather than a second
            // opinion about the same week. Without a plan it is the same
            // average by the other route.
            //
            // Not the reading just typed in, which is a single morning of water
            // and is not what the target is scored against. It stays reachable
            // through "Edit today's entry", which is the one place it is still
            // the right number to show.
            const heroWeight = progress ? progress.actual : weekAvg;

            const headline = target
                ? { label: 'Weight to beat', value: target.weight,
                    tone: target.behind ? ' behind' : ' good', foot: target.line }
                : { label: 'Weekly average weight', value: weekAvg,
                    tone: rate !== null && rate < -0.05 ? ' good' : '', foot: rateLine };

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
                                {/* Carries the raw reading, because the hero
                                    below is now the week's average and without
                                    this there is nothing on the card saying
                                    what was actually typed. Bare number, no
                                    unit: the chip is a receipt, not a stat. */}
                                <div className="logged-chip weigh-chip">
                                    ✓ Checked in @ {formatWeight(today.weight)}
                                </div>

                                <div className="hero weigh-hero">
                                    <div className="hero-weight">
                                        {formatWeight(heroWeight)}<span className="hero-unit">lbs</span>
                                    </div>
                                </div>
                                <div className="weigh-divider" />

                                <div className="weigh-trend">
                                    <div className="weigh-trend-label">{headline.label}</div>
                                    <div className="weigh-trend-value">{formatWeight(headline.value)}</div>
                                    <div className={'weigh-rate' + headline.tone}>
                                        {headline.foot}
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
