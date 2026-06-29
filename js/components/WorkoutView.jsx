        function WorkoutView({ workoutData, loggedExercises, handleInputChange, getPreviousWorkout, logExercise, completeDay, markDayAsNA, getCurrentExercises, currentWeek, userBodyweight, workoutHistory, expandedWeightBreakdown, setExpandedWeightBreakdown, activeDayType, setActiveDayType }) {
            const exercises = getCurrentExercises();
            const mainExercises = exercises.filter(e => e.category !== 'Cardio');
            const cardioExercises = exercises.filter(e => e.category === 'Cardio');

            const renderExercise = (exercise) => {
                const previous = getPreviousWorkout(exercise.id);
                const isLogged = loggedExercises[exercise.id];
                const data = workoutData[exercise.id] || {};
                const showPlateauBuster = ADVANCED_PR_TRACKING ? isPlateauBuster(exercise.id, workoutHistory) : false;
                const prWeightRecovery = ADVANCED_PR_TRACKING ? getPRWeightRecovery(exercise.id, workoutHistory) : null;
                const failedPlateauBusterRetry = ADVANCED_PR_TRACKING && !prWeightRecovery ? getFailedPlateauBusterRetry(exercise.id, workoutHistory) : null;
                const prAutoRegulation = ADVANCED_PR_TRACKING && !prWeightRecovery && !failedPlateauBusterRetry ? getPRAutoRegulation(exercise.id, workoutHistory) : null;
                const plateauBusterDecrement = ADVANCED_PR_TRACKING && showPlateauBuster && !prWeightRecovery ? getPlateauBusterDecrement(exercise.id, workoutHistory) : null;
                const simplePR = SIMPLE_PR_TRACKING ? getSimplePR(exercise.id, workoutHistory) : null;
                const stagnation = SIMPLE_PR_TRACKING && !simplePR ? getStagnationWarning(exercise.id, workoutHistory) : null;

                if (exercise.type === 'standard') {
                    console.log('[renderExercise]', exercise.name, {
                        showPlateauBuster,
                        prWeightRecovery,
                        failedPlateauBusterRetry,
                        prAutoRegulation,
                        plateauBusterDecrement,
                        previous
                    });
                }

                // Get default weight for Week 1
                const defaultWeight = currentWeek === 1 && !previous ? WEEK_1_DEFAULTS[exercise.id] : null;

                /* ============================================
                   ASSAULT BIKE DISPLAY (cardio day, logged last)
                   ============================================ */
                if (exercise.type === 'assault-bike') {
                    const assaultBikeLast = getAssaultBikeLast(workoutHistory);
                    const suggestedWatts = assaultBikeLast?.watts || '25';
                    const suggestedIntensity = assaultBikeLast?.intensity || '20/40';

                    // Intensity options: work from 20s up to 40s, rest is the
                    // remainder of a 60s interval (20/40 -> 40/20).
                    const intensityOptions = [];
                    for (let work = 20; work <= 40; work++) {
                        intensityOptions.push(`${work}/${60 - work}`);
                    }
                    const wattsOptions = ['25', '30', '35'];

                    return (
                        <div key={exercise.id} data-exercise-id={exercise.id} className={`exercise-card ${isLogged ? 'logged' : ''}`}>
                            <div className="exercise-header">
                                <div>
                                    <div className="exercise-name">
                                        {exercise.name}
                                    </div>
                                </div>
                                {previous && (
                                    <div className="previous-data">
                                        Last: {previous.intensity}{previous.watts ? ` @ ${previous.watts}W` : ''}
                                    </div>
                                )}
                            </div>
                            <div className="input-row">
                                <div className="input-group">
                                    <label className="input-label">Watts</label>
                                    <select
                                        className="input-field"
                                        data-field="watts"
                                        value={data.watts || suggestedWatts}
                                        onChange={(e) => handleInputChange(exercise.id, 'watts', e.target.value)}
                                        disabled={isLogged}
                                    >
                                        {wattsOptions.map(w => (
                                            <option key={w} value={w}>{w}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Intensity</label>
                                    <select
                                        className="input-field"
                                        data-field="intensity"
                                        value={data.intensity || suggestedIntensity}
                                        onChange={(e) => handleInputChange(exercise.id, 'intensity', e.target.value)}
                                        disabled={isLogged}
                                    >
                                        {intensityOptions.map(opt => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <button
                                className={`log-btn ${isLogged ? 'logged' : ''}`}
                                onClick={() => logExercise(exercise.id)}
                                disabled={isLogged}
                            >
                                {isLogged ? '✓ Logged' : 'LOG'}
                            </button>
                        </div>
                    );
                }
                /* END ASSAULT BIKE DISPLAY */

                /* STAIRMASTER DISPLAY */
                if (exercise.type === 'stairmaster') {
                    // Generate time options from 10:00 to 20:00 in 30-second increments
                    const timeOptions = [];
                    for (let minutes = 10; minutes <= 20; minutes++) {
                        for (let seconds = 0; seconds < 60; seconds += 30) {
                            if (minutes === 20 && seconds > 0) break; // Stop at 20:00
                            timeOptions.push(formatSecondsToTime(minutes * 60 + seconds));
                        }
                    }

                    const levelOptions = ['Level 7', 'Level 8', 'Level 9', 'Level 10'];

                    const stairmasterLast = getStairmasterLast(exercise.id, workoutHistory);
                    const suggestedTime = stairmasterLast?.time || '10:00';
                    const suggestedLevel = stairmasterLast?.level || 'Level 7';

                    return (
                        <div key={exercise.id} data-exercise-id={exercise.id} className={`exercise-card ${isLogged ? 'logged' : ''}`}>
                            <div className="exercise-header">
                                <div className="exercise-name">
                                    {exercise.name}
                                </div>
                                {previous && (
                                    <div className="previous-data">
                                        Last: {previous.level || 'Level 7'} - {previous.time}
                                    </div>
                                )}
                            </div>
                            <div className="input-row">
                                <div className="input-group">
                                    <label className="input-label">Level</label>
                                    <select
                                        className="input-field"
                                        data-field="level"
                                        value={data.level || suggestedLevel}
                                        onChange={(e) => handleInputChange(exercise.id, 'level', e.target.value)}
                                        disabled={isLogged}
                                    >
                                        {levelOptions.map(level => (
                                            <option key={level} value={level}>{level}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Time</label>
                                    <select
                                        className="input-field"
                                        data-field="time"
                                        value={data.time || suggestedTime}
                                        onChange={(e) => handleInputChange(exercise.id, 'time', e.target.value)}
                                        disabled={isLogged}
                                    >
                                        {timeOptions.map(time => (
                                            <option key={time} value={time}>{time}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <button
                                className={`log-btn ${isLogged ? 'logged' : ''}`}
                                onClick={() => logExercise(exercise.id)}
                                disabled={isLogged}
                            >
                                {isLogged ? '✓ Logged' : 'LOG'}
                            </button>
                        </div>
                    );
                }
                /* END STAIRMASTER DISPLAY */

                if (exercise.type === 'bodyweight') {
                    // Carry over last session's reps (no progression / no PR hint),
                    // or a first-session default when there's no history.
                    const bodyweightLast = getBodyweightLast(exercise.id, workoutHistory);
                    return (
                        <div key={exercise.id} data-exercise-id={exercise.id} className={`exercise-card ${isLogged ? 'logged' : ''}`}>
                            <div className="exercise-header">
                                <div className="exercise-name">{exercise.name}</div>
                                {previous && (
                                    <div className="previous-data">
                                        Last: {previous.reps} reps
                                    </div>
                                )}
                            </div>
                            <div className="input-row">
                                <div className="input-group">
                                    <label className="input-label">Weight</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        value="BW"
                                        disabled
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Reps</label>
                                    <select
                                        className="input-field"
                                        data-field="reps"
                                        value={data.reps !== undefined ? data.reps : (bodyweightLast?.reps || '')}
                                        onChange={(e) => handleInputChange(exercise.id, 'reps', e.target.value)}
                                        disabled={isLogged}
                                    >
                                        {(getBodyweightRepOptions(exercise.id) || []).map(r => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <button
                                className={`log-btn ${isLogged ? 'logged' : ''}`}
                                onClick={() => logExercise(exercise.id)}
                                disabled={isLogged}
                            >
                                {isLogged ? '✓ Logged' : 'LOG'}
                            </button>
                        </div>
                    );
                }

                // Standard exercise
                const isPlateLoaded = PLATE_LOADED_EXERCISES[exercise.id];
                const isPinStack = PIN_STACK_EXERCISES[exercise.id];
                const hasWeightBreakdown = isPlateLoaded || isPinStack;
                const isBreakdownExpanded = expandedWeightBreakdown === exercise.id;

                // Reps dropdown default (options are 4/5/6): after a weight bump
                // (hit 6 last time -> simplePR) reset to 4; otherwise carry over
                // last session's reps (clamped to 4-6); default 4 on a first session.
                const clampReps = (r) => {
                    const n = parseInt(r);
                    if (isNaN(n)) return null;
                    return String(Math.min(6, Math.max(4, n)));
                };
                const repsDefault = simplePR ? '4'
                    : (prWeightRecovery?.reps
                        || failedPlateauBusterRetry?.targetReps
                        || (prAutoRegulation ? '4'
                            : plateauBusterDecrement ? '6'
                            : (clampReps(previous?.reps) || '4')));

                return (
                    <div key={exercise.id} data-exercise-id={exercise.id} className={`exercise-card ${isLogged ? 'logged' : ''}`}>
                        <div className="exercise-header">
                            <div>
                                <div className="exercise-name">
                                    {exercise.name}
                                </div>
                                {previous && (
                                    <div className="previous-data" style={{ marginTop: '4px' }}>
                                        Last: {previous.weight}lbs × {previous.reps}
                                    </div>
                                )}
                            </div>
                            {hasWeightBreakdown && (
                                <button
                                    onClick={() => setExpandedWeightBreakdown(isBreakdownExpanded ? null : exercise.id)}
                                    style={{
                                        padding: '6px 12px',
                                        fontSize: '12px',
                                        fontWeight: '600',
                                        backgroundColor: '#3a2a5a',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {isBreakdownExpanded ? 'Hide' : 'Weight Breakdown'}
                                </button>
                            )}
                        </div>
                        {isBreakdownExpanded && (() => {
                            // Get current weight from input field (same logic as the input field's value)
                            // Fall back to the configured default weight even when this
                            // isn't Week 1, so the breakdown renders before the very first
                            // log of an exercise (otherwise currentWeight is 0 and the whole
                            // breakdown returns null below).
                            const displayedWeight = data.weight !== undefined ? data.weight : (simplePR?.weight || prWeightRecovery?.weight || failedPlateauBusterRetry?.weight || prAutoRegulation?.weight || plateauBusterDecrement?.weight || previous?.weight || defaultWeight || WEEK_1_DEFAULTS[exercise.id] || '');
                            const currentWeight = parseFloat(displayedWeight) || 0;

                            if (currentWeight === 0) return null;

                            // PIN-STACK EXERCISE
                            if (isPinStack) {
                                const breakdown = calculatePinStackBreakdown(currentWeight, exercise.id);

                                // Render a pin row, optionally with a plate breakdown when the
                                // set is in overflow mode (cable wrist curls above 97.5).
                                const renderPinSet = (label, set) => {
                                    if (!set.overflow) {
                                        return (
                                            <div style={{ fontWeight: '600' }}>
                                                {label}: {set.pinWeight} lbs
                                            </div>
                                        );
                                    }
                                    const sortedPlates = Object.entries(set.plates)
                                        .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
                                    return (
                                        <div>
                                            <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                                                {label}: {set.totalWeight} lbs
                                            </div>
                                            <div style={{ marginLeft: '12px' }}>
                                                Pin: {set.pinWeight} lbs
                                            </div>
                                            {sortedPlates.map(([weight, count]) => (
                                                <div key={weight} style={{ marginLeft: '12px' }}>
                                                    {weight}s - {count}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                };

                                // Top set is informative only when overflow is in play —
                                // otherwise the user already sees their working weight above.
                                const showTopSet = breakdown.topSet.overflow;

                                return (
                                    <div style={{
                                        backgroundColor: '#050510',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        marginBottom: '12px',
                                        fontSize: '13px',
                                        fontFamily: 'monospace'
                                    }}>
                                        <div style={{ marginBottom: '12px' }}>
                                            {renderPinSet('Warmup Set #1 (~70%)', breakdown.warmup1)}
                                        </div>
                                        <div style={{ marginBottom: showTopSet ? '12px' : '0' }}>
                                            {renderPinSet('Warmup Set #2 (~90%)', breakdown.warmup2)}
                                        </div>
                                        {showTopSet && (
                                            <div>
                                                {renderPinSet('Top Set', breakdown.topSet)}
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            // PLATE-LOADED EXERCISE
                            const breakdown = calculatePlateBreakdown(currentWeight, exercise.id);

                            if (!breakdown) return null;

                            const renderPlates = (plates) => {
                                // Sort plates in descending order: 45s > 25s > 10s > 5s > 2.5s > 1.25s
                                const sortedPlates = Object.entries(plates).sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
                                return sortedPlates.map(([weight, count]) => (
                                    <div key={weight} style={{ marginLeft: '12px' }}>
                                        {weight}s - {count}
                                    </div>
                                ));
                            };

                            // Calculate actual weight from plates
                            const getActualWeight = (plates) => {
                                return Object.entries(plates).reduce((total, [weight, count]) => {
                                    return total + (parseFloat(weight) * count);
                                }, 0);
                            };

                            const warmup1Actual = getActualWeight(breakdown.warmup1.plates);
                            const warmup2Actual = getActualWeight(breakdown.warmup2.plates);
                            const topSetActual = getActualWeight(breakdown.topSet.plates);

                            const warmup1Total = breakdown.isTwoSided ? warmup1Actual * 2 : warmup1Actual;
                            const warmup2Total = breakdown.isTwoSided ? warmup2Actual * 2 : warmup2Actual;
                            const topSetTotal = breakdown.isTwoSided ? topSetActual * 2 : topSetActual;

                            return (
                                <div style={{
                                    backgroundColor: '#050510',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    marginBottom: '12px',
                                    fontSize: '13px',
                                    fontFamily: 'monospace'
                                }}>
                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                                            Warmup Set #1 ({warmup1Total} lbs - ~70%):
                                        </div>
                                        {breakdown.isTwoSided && (
                                            <div style={{ marginLeft: '12px', fontStyle: 'italic', color: '#666' }}>
                                                Per side: {warmup1Actual} lbs
                                            </div>
                                        )}
                                        {renderPlates(breakdown.warmup1.plates)}
                                    </div>

                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                                            Warmup Set #2 ({warmup2Total} lbs - ~90%):
                                        </div>
                                        {breakdown.isTwoSided && (
                                            <div style={{ marginLeft: '12px', fontStyle: 'italic', color: '#666' }}>
                                                Per side: {warmup2Actual} lbs
                                            </div>
                                        )}
                                        {renderPlates(breakdown.warmup2.plates)}
                                    </div>

                                    <div>
                                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                                            Top Set ({topSetTotal} lbs):
                                        </div>
                                        {breakdown.isTwoSided && (
                                            <div style={{ marginLeft: '12px', fontStyle: 'italic', color: '#666' }}>
                                                Per side: {topSetActual} lbs
                                            </div>
                                        )}
                                        {renderPlates(breakdown.topSet.plates)}
                                    </div>
                                </div>
                            );
                        })()}
                        {prWeightRecovery ? (
                            <div style={{
                                color: '#4CAF50',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                marginBottom: '12px',
                                fontWeight: '600',
                                fontSize: '14px',
                                textAlign: 'center'
                            }}>
                                Trial of Strength
                            </div>
                        ) : (showPlateauBuster && !failedPlateauBusterRetry) ? (
                            <div style={{
                                color: '#ff9500',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                marginBottom: '12px',
                                fontWeight: '600',
                                fontSize: '14px',
                                textAlign: 'center'
                            }}>
                                Plateau Buster - Hit 2 Sets
                            </div>
                        ) : null}
                        {simplePR && (
                            <div style={{
                                color: '#4CAF50',
                                fontSize: '12px',
                                fontWeight: '600',
                                marginBottom: '8px',
                                marginTop: '4px'
                            }}>
                                +{simplePR.increment}lbs
                            </div>
                        )}
                        {!simplePR && prWeightRecovery && (
                            <div style={{
                                color: '#4CAF50',
                                fontSize: '12px',
                                fontWeight: '600',
                                marginBottom: '8px',
                                marginTop: '-4px'
                            }}>
                                PR Weight Detected
                            </div>
                        )}
                        {stagnation && (
                            <div style={{
                                color: '#ff9500',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                marginBottom: '12px',
                                fontWeight: '600',
                                fontSize: '14px',
                                textAlign: 'center'
                            }}>
                                2 Sets Recommended
                            </div>
                        )}
                        {!simplePR && prAutoRegulation && !prWeightRecovery && (
                            <div style={{
                                color: '#4CAF50',
                                fontSize: '12px',
                                fontWeight: '600',
                                marginBottom: '8px',
                                marginTop: '4px'
                            }}>
                                +{prAutoRegulation.increment}lbs
                            </div>
                        )}
                        {plateauBusterDecrement && !prWeightRecovery && !prAutoRegulation && !failedPlateauBusterRetry && (
                            <div style={{
                                color: '#ff9500',
                                fontSize: '12px',
                                fontWeight: '600',
                                marginBottom: '8px',
                                marginTop: '4px'
                            }}>
                                -{plateauBusterDecrement.increment}lbs
                            </div>
                        )}
                        {failedPlateauBusterRetry && !prWeightRecovery && !prAutoRegulation && (
                                <div style={{
                                    color: '#ff9500',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    marginBottom: '12px',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    textAlign: 'center'
                                }}>
                                Plateau Buster - Hit 1 Set of {failedPlateauBusterRetry.targetReps} Reps
                                </div>
                        )}
                        <div className="input-row">
                            <div className="input-group">
                                <label className="input-label">Weight (lbs)</label>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    className="input-field"
                                    value={data.weight !== undefined ? data.weight : (simplePR?.weight || prWeightRecovery?.weight || failedPlateauBusterRetry?.weight || prAutoRegulation?.weight || plateauBusterDecrement?.weight || previous?.weight || defaultWeight || WEEK_1_DEFAULTS[exercise.id] || '')}
                                    onChange={(e) => handleInputChange(exercise.id, 'weight', e.target.value)}
                                    placeholder={previous?.weight || WEEK_1_DEFAULTS[exercise.id] || ''}
                                    disabled={isLogged}
                                    style={simplePR || prWeightRecovery || prAutoRegulation ? {
                                        border: '2px solid #4CAF50'
                                    } : (showPlateauBuster || failedPlateauBusterRetry) ? {
                                        border: '2px solid #ff9500'
                                    } : {}}
                                />
                            </div>
                            <div className="input-group">
                                <label className="input-label">Reps</label>
                                <select
                                    className="input-field"
                                    data-field="reps"
                                    value={data.reps !== undefined ? data.reps : repsDefault}
                                    onChange={(e) => handleInputChange(exercise.id, 'reps', e.target.value)}
                                    disabled={isLogged}
                                    style={stagnation ? {
                                        border: '2px solid #ff9500'
                                    } : {}}
                                >
                                    {['4', '5', '6'].map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <button
                            className={`log-btn ${isLogged ? 'logged' : ''}`}
                            onClick={() => logExercise(exercise.id)}
                            disabled={isLogged}
                        >
                            {isLogged ? '✓ Logged' : 'LOG'}
                        </button>
                    </div>
                );
            };

            const dayTypeButton = (type, label) => (
                <button
                    data-day-type={type}
                    onClick={() => setActiveDayType(type)}
                    style={{
                        flex: 1,
                        padding: '12px',
                        fontSize: '14px',
                        fontWeight: '600',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.3s',
                        background: activeDayType === type ? '#3a2a5a' : '#1a1a2a',
                        border: activeDayType === type ? '1px solid #4a3a6a' : '1px solid #2a2a3a',
                        color: activeDayType === type ? '#b8b8d0' : '#8a8aa0'
                    }}
                >
                    {label}
                </button>
            );

            return (
                <>
                    <div data-day-type-toggle style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        {dayTypeButton('fullbody', 'Full Body')}
                        {dayTypeButton('cardio', 'Cardio')}
                    </div>

                    {mainExercises.map(renderExercise)}

                    {cardioExercises.length > 0 && <>
                        <div className="section-title">Cardio</div>
                        {cardioExercises.map(renderExercise)}
                    </>}

                    <button className="save-btn" onClick={completeDay}>
                        Submit Day and View Breakdown
                    </button>

                </>
            );
        }
