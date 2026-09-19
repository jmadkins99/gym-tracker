        // The check-in screen: one card, full height, mirroring the gym-tracker
        // deck card so the two pages read as one app. There is nothing to swipe
        // through here — a day has exactly one weigh-in — so the card is the
        // whole screen rather than a rail of them.
        //
        // Two states. Before you log, the card is an input. After you log, it
        // shows the number you just typed above the week's standing, and at
        // midnight tomorrow's card opens on the input again. The reading
        // itself is not gone — the History chart plots it.
        //
        // Correcting a reading is not one of the two states. It was, through an
        // "edit today's entry" link that reopened the input, and that made this
        // card the second place a weight could be changed — History's week rows
        // already do it, for today like any other day. One card, one job: today
        // is either logged or it is not.
        const PR_CELEBRATION_MS = 2000;

        // A plan's weekly goal in running text: "170", but "172.5".
        function formatGoal(n) {
            const s = formatWeight(n);
            return s.endsWith('.0') ? s.slice(0, -2) : s;
        }

        function CheckInView({ log, todayKey, onCheckIn, celebrating, progress }) {
            const today = entryFor(log, todayKey);
            const [draft, setDraft] = React.useState('');
            const inputRef = React.useRef(null);

            // A day rollover while the tab sat open must not leave yesterday's
            // draft in the field.
            React.useEffect(() => {
                setDraft('');
            }, [todayKey]);

            const showInput = !today;

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
            //
            // Once the week's average is under its target, the target is no
            // longer the number worth beating — the average is. So "Weight to
            // beat" becomes that average, and because the plan's figure has
            // then left the headline, the line below names it: "1.6 pounds
            // over 170 goal".
            const MET_BAND = 0.05;
            const beaten = progress ? progress.gap < -MET_BAND : false;
            const target = progress ? {
                weight: beaten ? progress.actual : progress.planWeight,
                behind: progress.gap > MET_BAND,
                line: progress.gap > MET_BAND
                    ? formatWeight(progress.gap) + ' pounds away'
                    : (!beaten
                        ? 'Target met'
                        : formatWeight(-progress.gap) + ' pounds over ' +
                          formatGoal(progress.planWeight) + ' goal'),
            } : null;

            const headline = target
                ? { label: 'Weight to beat', value: target.weight,
                    tone: target.behind ? ' behind' : ' good', foot: target.line }
                : { label: 'Weekly average weight', value: weekAvg,
                    tone: rate !== null && rate < -0.05 ? ' good' : '', foot: rateLine };

            return (
                <div className="weigh-stage">
                    <div className={'card weigh-card' + (celebrating ? ' pr-celebrating' : '') + (today ? ' is-done' : '')}>
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

                                {/* The target block, before the reading rather
                                    than only after it. What the card is for at
                                    the moment it is opened is the number being
                                    walked onto the scale to beat, and holding
                                    that back until check-in meant the one
                                    screen that could have said it was the one
                                    screen that did not — the figure was a tap
                                    into History, or a memory, exactly when it
                                    was about to matter.

                                    Identical markup to the read-back state
                                    below, off the same `headline`, so the two
                                    cannot drift into two opinions about one
                                    week and the card does not reflow when the
                                    reading commits: the input sits where the
                                    hero will, and everything under the divider
                                    stays put.

                                    The gap is measured against the latest week
                                    that HAS readings — planProgress's `actual`
                                    — so before today's entry it reads from
                                    where the week currently stands, and typing
                                    a number nudges it. That is the honest
                                    reading of "how far off am I", not a
                                    placeholder waiting to be filled in.

                                    Skipped only when there is no number at all
                                    to state — a cleared plan and an empty log,
                                    which is a first-ever check-in on a page
                                    with nothing to beat and no week to average.
                                    A plan alone is enough: planProgress falls
                                    back to the plan's own start weight, so the
                                    target stands before the first reading
                                    does. */}
                                {headline.value !== null ? (
                                    <>
                                        <div className="weigh-divider" />
                                        <div className="weigh-trend">
                                            <div className="weigh-trend-label">{headline.label}</div>
                                            <div className="weigh-trend-value">{formatWeight(headline.value)}</div>
                                            <div className={'weigh-rate' + headline.tone}>
                                                {headline.foot}
                                            </div>
                                        </div>
                                    </>
                                ) : null}

                                <button className="save-btn weigh-submit" onClick={submit} disabled={!valid}>
                                    CHECK IN
                                </button>
                            </div>
                        ) : (
                            <div className="weigh-body">
                                {/* The hero is the reading just typed in. The
                                    week's standing is the block below it. */}
                                <div className="hero weigh-hero">
                                    <div className="hero-weight">
                                        {formatWeight(today.weight)}<span className="hero-unit">lbs</span>
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
                            </div>
                        )}
                    </div>
                </div>
            );
        }
