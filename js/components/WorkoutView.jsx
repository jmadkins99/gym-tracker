        function WorkoutView({ workoutData, loggedExercises, handleInputChange, getPreviousWorkout, logExercise, completeDay, markDayAsNA, getCurrentExercises, currentWeek, userBodyweight, workoutHistory, expandedWeightBreakdown, setExpandedWeightBreakdown }) {
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
                   ASSAULT BIKE DISPLAY - COMMENTED OUT
                   To switch back: uncomment this block and comment out stairmaster below
                   Also update DEFAULT_DAY_2_EXERCISES to use assault-bike instead of stairmaster
                   ============================================ */
                /*
                if (exercise.type === 'assault-bike') {
                    const assaultBikePR = getAssaultBikePR(workoutHistory);

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
                                        Last: {previous.watts} watts
                                    </div>
                                )}
                            </div>
                            {assaultBikePR && (
                                <div style={{
                                    color: '#4CAF50',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    marginBottom: '8px',
                                    marginTop: '-4px'
                                }}>
                                    +25 watts
                                </div>
                            )}
                            <div className="input-row">
                                <div className="input-group">
                                    <label className="input-label">Intensity</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        value="10/20"
                                        disabled
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Watts</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        className="input-field"
                                        value={data.watts || ''}
                                        onChange={(e) => handleInputChange(exercise.id, 'watts', e.target.value)}
                                        placeholder={assaultBikePR ? assaultBikePR.watts : (previous?.watts || '')}
                                        disabled={isLogged}
                                        style={assaultBikePR ? {
                                            border: '2px solid #4CAF50'
                                        } : {}}
                                    />
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
                */
                /* END ASSAULT BIKE DISPLAY */

                /* STAIRMASTER DISPLAY - To switch back to assault bike, comment out this block */
                if (exercise.type === 'stairmaster') {
                    // Generate time options from 5:00 to 20:00 in 15-second increments
                    const timeOptions = [];
                    for (let minutes = 5; minutes <= 20; minutes++) {
                        for (let seconds = 0; seconds < 60; seconds += 15) {
                            if (minutes === 20 && seconds > 0) break; // Stop at 20:00
                            timeOptions.push(formatSecondsToTime(minutes * 60 + seconds));
                        }
                    }

                    const stairmasterSuggestion = getStairmasterSuggestion(exercise.id, workoutHistory);
                    const suggestedTime = stairmasterSuggestion?.time || '5:00';
                    const showSuggestion = !stairmasterSuggestion?.isFirstSession;

                    return (
                        <div key={exercise.id} data-exercise-id={exercise.id} className={`exercise-card ${isLogged ? 'logged' : ''}`}>
                            <div className="exercise-header">
                                <div className="exercise-name">
                                    {exercise.name}
                                </div>
                                {previous && (
                                    <div className="previous-data">
                                        Last: Level 10 - {previous.time}
                                    </div>
                                )}
                            </div>
                            {showSuggestion && (
                                <div style={{
                                    color: '#4CAF50',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    marginBottom: '8px',
                                    marginTop: '-4px'
                                }}>
                                    +15 seconds
                                </div>
                            )}
                            <div className="input-row">
                                <div className="input-group">
                                    <label className="input-label">Level</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        value="Level 10"
                                        disabled
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Time</label>
                                    <select
                                        className="input-field"
                                        value={data.time || suggestedTime}
                                        onChange={(e) => handleInputChange(exercise.id, 'time', e.target.value)}
                                        disabled={isLogged}
                                        style={showSuggestion ? {
                                            border: '2px solid #4CAF50'
                                        } : {}}
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
                            <div className="input-row">
                                <div className="input-group">
                                    <label className="input-label">Weight</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        value="Body Weight"
                                        disabled
                                    />
                                </div>
                                <div className="input-group" style={{ position: 'relative' }}>
                                    {prWeightRecovery && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '-20px',
                                            left: '0',
                                            color: '#4CAF50',
                                            fontSize: '12px',
                                            fontWeight: '600'
                                        }}>
                                            PR Reps to Beat
                                        </div>
                                    )}
                                    <label className="input-label">Reps</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        className="input-field"
                                        value={data.reps || ''}
                                        onChange={(e) => handleInputChange(exercise.id, 'reps', e.target.value)}
                                        placeholder={prWeightRecovery?.reps || previous?.reps || ''}
                                        disabled={isLogged}
                                        style={prWeightRecovery ? {
                                            border: '2px solid #4CAF50'
                                        } : {}}
                                    />
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
                                    value={data.weight !== undefined ? data.weight : (simplePR?.weight || prWeightRecovery?.weight || failedPlateauBusterRetry?.weight || prAutoRegulation?.weight || plateauBusterDecrement?.weight || previous?.weight || '')}
                                    onChange={(e) => handleInputChange(exercise.id, 'weight', e.target.value)}
                                    placeholder={previous?.weight || ''}
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
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    className="input-field"
                                    value={data.reps || ''}
                                    onChange={(e) => handleInputChange(exercise.id, 'reps', e.target.value)}
                                    placeholder={simplePR ? '4' : (prWeightRecovery?.reps || (failedPlateauBusterRetry?.targetReps) || (prAutoRegulation ? '4' : (plateauBusterDecrement ? '6' : (showPlateauBuster && previous?.reps ? String(parseInt(previous.reps)) : (previous?.reps ? String(parseInt(previous.reps) + 1) : '')))))}
                                    disabled={isLogged}
                                    style={stagnation ? {
                                        border: '2px solid #ff9500'
                                    } : {}}
                                />
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

            return (
                <>
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
