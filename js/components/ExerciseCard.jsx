        // One exercise, two faces.
        //
        // The front is a nameplate and nothing else — no weight, no last
        // session, no streak. That is the whole mechanism of this screen: the
        // numbers sit behind a gesture, so the gesture actually gets made. See
        // openWeightBreakdown in App.jsx for what the reveal is really doing.
        //
        // "Revealed" is derived from expandedWeightBreakdown rather than held
        // locally, so the one-way-open rule and the anchor reset come for free.

        // Colours that carry meaning. These stay fixed while --accent rotates
        // daily, because a hue that moves cannot encode anything.
        const HINT_GREEN = '#4CAF50';
        const HINT_ORANGE = '#ff9500';

        // Everything both faces need, derived once. The weight fallback chain
        // here is the single source for the hero number, the breakdown, and the
        // input value — upstream kept three copies of it, which is exactly how a
        // breakdown comes to disagree with the number printed above it.
        function computeCardModel(exercise, { previous, workoutHistory, currentWeek, data }) {
            const loadType = resolveLoadType(exercise);
            const showPlateauBuster = ADVANCED_PR_TRACKING ? isPlateauBuster(exercise.id, workoutHistory) : false;
            const prWeightRecovery = ADVANCED_PR_TRACKING ? getPRWeightRecovery(exercise.id, workoutHistory) : null;
            const failedPlateauBusterRetry = ADVANCED_PR_TRACKING && !prWeightRecovery ? getFailedPlateauBusterRetry(exercise.id, workoutHistory) : null;
            const prAutoRegulation = ADVANCED_PR_TRACKING && !prWeightRecovery && !failedPlateauBusterRetry ? getPRAutoRegulation(exercise.id, workoutHistory, loadType) : null;
            const plateauBusterDecrement = ADVANCED_PR_TRACKING && showPlateauBuster && !prWeightRecovery ? getPlateauBusterDecrement(exercise.id, workoutHistory, loadType) : null;
            const simplePR = SIMPLE_PR_TRACKING ? getSimplePR(exercise.id, workoutHistory, loadType) : null;
            const stagnation = SIMPLE_PR_TRACKING && !simplePR ? getStagnationWarning(exercise.id, workoutHistory) : null;
            const prStreak = PR_STREAK_TRACKING && exercise.type === 'standard'
                ? getPRStreak(exercise.id, workoutHistory) : null;

            const defaultWeight = currentWeek === 1 && !previous ? WEEK_1_DEFAULTS[exercise.id] : null;

            // Verbatim from the old input value chain, plus the WEEK_1 tail the
            // breakdown needed so it renders before an exercise has ever been
            // logged.
            const targetWeight = data.weight !== undefined ? data.weight
                : (simplePR?.weight || prWeightRecovery?.weight || failedPlateauBusterRetry?.weight
                    || prAutoRegulation?.weight || plateauBusterDecrement?.weight
                    || previous?.weight || defaultWeight || WEEK_1_DEFAULTS[exercise.id] || '');

            const repRange = getStandardRepRange(exercise.id);
            const repOptions = getStandardRepOptions(exercise.id);
            const repStart = getStandardRepStart(exercise.id);

            // After a weight bump reset to the exercise's start reps, otherwise
            // carry last session reps clamped into that exercise's range.
            const repsDefault = simplePR ? repStart
                : (prWeightRecovery?.reps
                    || failedPlateauBusterRetry?.targetReps
                    || (prAutoRegulation ? repStart
                        : plateauBusterDecrement ? String(repRange.max)
                        : (clampStandardReps(exercise.id, previous?.reps) || repStart)));

            return { loadType, simplePR, stagnation, prStreak, targetWeight, repsDefault, repOptions };
        }

        // The warmup table. Same arithmetic as before — calculatePinStackBreakdown
        // and calculatePlateBreakdown are untouched — but laid out as rows rather
        // than an indented monospace dump.
        function WeightBreakdown({ exercise, loadType, weight }) {
            const currentWeight = parseFloat(weight) || 0;
            if (currentWeight === 0) return null;

            // "45 x 2   25 x 1" -> "45 × 2, 25".
            //
            // Three separate things were making this harder to read than it
            // needed to be. A lowercase x where the rest of the app uses ×.
            // Three spaces as a separator, which is not a separator so much as
            // a gap you have to judge. And a "× 1" on every single plate, which
            // is a third of the characters in a typical line saying nothing —
            // one plate needs no count, it just needs naming.
            const plateList = (plates) => Object.entries(plates)
                .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
                .map(([w, count]) => (count > 1 ? w + ' × ' + count : String(w)))
                .join(', ');

            const row = (label, pct, value, sub) => (
                <div key={label} className="breakdown-row">
                    <div className="breakdown-label">
                        {label}
                        {pct ? <span className="breakdown-pct">{pct}</span> : null}
                    </div>
                    <div className="breakdown-value">
                        <div className="breakdown-weight">{value}</div>
                        {sub ? <div className="breakdown-plates">{sub}</div> : null}
                    </div>
                </div>
            );

            if (loadType === 'pin') {
                const breakdown = calculatePinStackBreakdown(currentWeight, exercise.id);
                const pinRow = (label, pct, set) => (!set || set.totalWeight <= 0) ? null : row(
                    label, pct,
                    (set.overflow ? set.totalWeight : set.pinWeight) + ' lbs',
                    set.overflow ? 'pin ' + set.pinWeight + '  ·  ' + plateList(set.plates) : null
                );
                return (
                    <div className="breakdown">
                        {pinRow('Warmup 1', '70%', breakdown.warmup1)}
                        {pinRow('Warmup 2', '90%', breakdown.warmup2)}
                        {/* The top set only says something once the stack has run
                            out and plates are involved; otherwise it is the number
                            already shown above it. */}
                        {breakdown.topSet.overflow ? pinRow('Top set', '', breakdown.topSet) : null}
                    </div>
                );
            }

            const breakdown = calculatePlateBreakdown(currentWeight, loadType);
            if (!breakdown) return null;

            const perSide = (plates) => Object.entries(plates)
                .reduce((total, [w, count]) => total + (parseFloat(w) * count), 0);
            const two = breakdown.isTwoSided;
            const plateRow = (label, pct, set) => {
                // Zero means no honest warmup exists at this weight — the ramp
                // would have to meet or pass the set above it — so the row is
                // left out rather than shown as 0 lbs.
                if (!set || set.totalWeight <= 0) return null;
                const side = perSide(set.plates);
                return row(
                    label, pct,
                    (two ? side * 2 : side) + ' lbs',
                    (two ? side + '/side  ·  ' : '') + plateList(set.plates)
                );
            };

            return (
                <div className="breakdown">
                    {plateRow('Warmup 1', '70%', breakdown.warmup1)}
                    {plateRow('Warmup 2', '90%', breakdown.warmup2)}
                    {plateRow('Top set', '', breakdown.topSet)}
                </div>
            );
        }

        // The editable fields, by type. `data-field` on every select and the
        // number/decimal pair on the weight input are load-bearing: logExercise
        // scrapes them straight out of the DOM, which is what lets an untouched
        // default still log.
        function CardInputs({ exercise, data, model, previous, isLogged, handleInputChange, workoutHistory }) {
            const change = (field, value) => handleInputChange(exercise.id, field, value);
            const { simplePR, stagnation, repsDefault, repOptions, targetWeight } = model;

            if (exercise.type === 'assault-bike') {
                const last = getAssaultBikeLast(workoutHistory);
                const intensityOptions = [];
                for (let work = 20; work <= 40; work++) intensityOptions.push(work + '/' + (60 - work));
                return (
                    <div className="input-row">
                        <div className="input-group">
                            <label className="input-label">Watts</label>
                            <select className="input-field" data-field="watts" disabled={isLogged}
                                    value={data.watts !== undefined ? data.watts : (last?.watts || '25')}
                                    onChange={(e) => change('watts', e.target.value)}>
                                {['25', '30', '35'].map(w => <option key={w} value={w}>{w}</option>)}
                            </select>
                        </div>
                        <div className="input-group">
                            <label className="input-label">Intensity</label>
                            <select className="input-field" data-field="intensity" disabled={isLogged}
                                    value={data.intensity !== undefined ? data.intensity : (last?.intensity || '20/40')}
                                    onChange={(e) => change('intensity', e.target.value)}>
                                {intensityOptions.map(i => <option key={i} value={i}>{i}</option>)}
                            </select>
                        </div>
                    </div>
                );
            }

            if (exercise.type === 'stairmaster') {
                const timeOptions = [];
                for (let minutes = 10; minutes <= 20; minutes++) {
                    for (let seconds = 0; seconds < 60; seconds += 10) {
                        if (minutes === 20 && seconds > 0) break;
                        timeOptions.push(formatSecondsToTime(minutes * 60 + seconds));
                    }
                }
                const suggestion = getStairmasterSuggestion(exercise.id, workoutHistory);
                return (
                    <div className="input-row">
                        <div className="input-group">
                            <label className="input-label">Level</label>
                            <select className="input-field" data-field="level" disabled={isLogged}
                                    value={data.level !== undefined ? data.level : (suggestion?.level || 'Level 7')}
                                    onChange={(e) => change('level', e.target.value)}>
                                {['Level 7', 'Level 8', 'Level 9', 'Level 10'].map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                        </div>
                        <div className="input-group">
                            <label className="input-label">Time</label>
                            <select className="input-field" data-field="time" disabled={isLogged}
                                    value={data.time !== undefined ? data.time : (suggestion?.time || '10:00')}
                                    onChange={(e) => change('time', e.target.value)}>
                                {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>
                );
            }

            if (exercise.type === 'bodyweight') {
                const last = getBodyweightLast(exercise.id, workoutHistory);
                const options = getBodyweightRepOptions(exercise.id);
                return (
                    <div className="input-row">
                        <div className="input-group">
                            <label className="input-label">Weight</label>
                            <input type="text" className="input-field" value="BW" disabled readOnly />
                        </div>
                        <div className="input-group">
                            <label className="input-label">Reps</label>
                            <select className="input-field" data-field="reps" disabled={isLogged}
                                    value={data.reps !== undefined ? data.reps : (last?.reps || options[0])}
                                    onChange={(e) => change('reps', e.target.value)}>
                                {options.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    </div>
                );
            }

            return (
                <div className="input-row">
                    <div className="input-group">
                        <label className="input-label">Weight (lbs)</label>
                        <input
                            type="number"
                            inputMode="decimal"
                            className="input-field"
                            value={targetWeight}
                            onChange={(e) => change('weight', e.target.value)}
                            placeholder={previous?.weight || WEEK_1_DEFAULTS[exercise.id] || ''}
                            disabled={isLogged}
                            style={simplePR ? { borderColor: HINT_GREEN } : {}}
                        />
                    </div>
                    <div className="input-group">
                        <label className="input-label">Reps</label>
                        <select
                            className="input-field"
                            data-field="reps"
                            value={data.reps !== undefined ? data.reps : repsDefault}
                            onChange={(e) => change('reps', e.target.value)}
                            disabled={isLogged}
                            style={stagnation ? { borderColor: HINT_ORANGE } : {}}
                        >
                            {repOptions.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                </div>
            );
        }

        function ExerciseCard({ exercise, previous, isLogged, isCelebrating, isRevealed, data, workoutHistory,
                                currentWeek, handleInputChange, onLog }) {
            // Fit the revealed contents to the card instead of scrolling them.
            //
            // A scrollable region inside a touch-action:none stage competes with
            // the horizontal swipe, and on iOS the scroller tends to win — so a
            // card tall enough to scroll was also a card that was awkward to
            // swipe off. A card you have to scroll is not one screen any more
            // either, which was the whole premise.
            //
            // Declared above the front-face return because hooks cannot be
            // called conditionally; on a nameplate the refs are simply null and
            // the effect does nothing.
            const fitBox = React.useRef(null);
            const fitInner = React.useRef(null);
            const [fit, setFit] = React.useState(1);

            React.useLayoutEffect(() => {
                const box = fitBox.current;
                const inner = fitInner.current;
                if (!box || !inner) return;
                const measure = () => {
                    // scrollHeight is the UNSCALED layout height — a CSS
                    // transform never feeds back into layout — so this reading
                    // is stable whatever scale is currently applied, and the
                    // measurement cannot chase its own tail.
                    const needed = inner.scrollHeight;
                    const avail = box.clientHeight;
                    if (!needed || !avail) return;
                    setFit((prev) => {
                        const raw = needed > avail ? avail / needed : 1;
                        // Floor it: past this the text is too small to read at
                        // arm's length, and something else has gone wrong.
                        const next = Math.round(Math.max(0.6, raw) * 1000) / 1000;
                        return Math.abs(prev - next) < 0.002 ? prev : next;
                    });
                };
                measure();
                const ro = new ResizeObserver(measure);
                ro.observe(box);
                ro.observe(inner);
                return () => ro.disconnect();
            });

            // Deliberately BEFORE computeCardModel. Three cards are mounted at
            // once now so the neighbours can peek in during a swipe, and the
            // model walks the whole workout history per exercise — work a
            // nameplate has no use for.
            //
            // ---- Front: a nameplate. Nothing numeric, deliberately. --------
            if (!isRevealed) {
                return (
                    <div data-exercise-id={exercise.id}
                         className={'card card-front' + (isLogged ? ' is-done' : '')}>
                        {/* No logged branch here: a logged card renders the
                            revealed face unconditionally, so this one is only
                            ever seen before a set is recorded. */}
                        <div className="card-name">{exercise.name}</div>
                        <div className="card-hint">
                            <div className="card-hint-arrow">↑</div>
                            swipe up to start
                        </div>
                    </div>
                );
            }

            // ---- Revealed: the numbers, and the only place LOG exists. -----
            const model = computeCardModel(exercise, { previous, workoutHistory, currentWeek, data });
            const { loadType, simplePR, stagnation, prStreak, targetWeight, repsDefault } = model;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const loggedWorkout = isLogged ? workoutHistory.find(w => {
                if (w.submitted) return false;
                const workoutDate = new Date(w.date);
                workoutDate.setHours(0, 0, 0, 0);
                return workoutDate.getTime() === today.getTime();
            }) : null;
            const loggedExercise = loggedWorkout?.exercises.find(e => e.id === exercise.id);
            const loggedPR = isLogged && isExercisePRInWorkout(loggedExercise, loggedWorkout, workoutHistory);

            const lastLine = !previous ? null
                : exercise.type === 'assault-bike' ? 'Last: ' + previous.intensity + ' @ ' + previous.watts + 'W'
                : exercise.type === 'stairmaster' ? 'Last: ' + (previous.level || 'Level 7') + ' · ' + previous.time
                : exercise.type === 'bodyweight' ? 'Last: ' + previous.reps + ' reps'
                : 'Last: ' + previous.weight + 'lbs × ' + previous.reps;

            return (
                <div data-exercise-id={exercise.id}
                     className={'card card-open' + (isLogged ? ' is-done' : '') + (isCelebrating ? ' pr-celebrating' : '')}>
                    <div className="card-open-head">
                        <div className="card-open-name">{exercise.name}</div>
                        {loggedPR ? (
                            <div className="streak-badge logged-pr-badge" data-logged-pr-badge>
                                🔥 PR
                            </div>
                        ) : null}
                        {isLogged ? <div className="logged-chip">logged</div> : null}
                        {!isLogged && prStreak ? (
                            <div className="streak-badge" data-streak={prStreak}>🔥 {prStreak}</div>
                        ) : null}
                    </div>

                    <div className="card-body" ref={fitBox}>
                      <div className="card-fit" ref={fitInner} style={{ transform: 'scale(' + fit + ')' }}>
                        {exercise.type === 'standard' ? (
                            <div className="hero">
                                <div className="hero-weight">
                                    {targetWeight || '—'}<span className="hero-unit">lbs</span>
                                </div>
                                <div className="hero-reps">
                                    × {data.reps !== undefined ? data.reps : repsDefault}
                                </div>
                                {simplePR ? <div className="hero-tag up">+{simplePR.increment} lbs</div> : null}
                                {stagnation ? <div className="hero-tag flat">Plateau detected</div> : null}
                            </div>
                        ) : null}

                        {lastLine ? <div className="card-last">{lastLine}</div> : null}

                        {exercise.type === 'standard' ? (
                            <WeightBreakdown exercise={exercise} loadType={loadType} weight={targetWeight} />
                        ) : null}

                        <CardInputs
                            exercise={exercise}
                            data={data}
                            model={model}
                            previous={previous}
                            isLogged={isLogged}
                            handleInputChange={handleInputChange}
                            workoutHistory={workoutHistory}
                        />
                      </div>
                    </div>

                    <button className={'log-btn' + (isLogged ? ' logged' : '')}
                            onClick={() => onLog(exercise.id)}
                            disabled={isLogged}>
                        {isLogged ? '✓ Logged' : 'LOG'}
                    </button>
                </div>
            );
        }
