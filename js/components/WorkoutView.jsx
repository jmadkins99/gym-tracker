        function WorkoutView({ currentDay, setCurrentDay, workoutData, loggedExercises, handleInputChange, getPreviousWorkout, logExercise, completeDay, markDayAsNA, getCurrentExercises, currentWeek, userBodyweight, workoutHistory, expandedWeightBreakdown, setExpandedWeightBreakdown }) {
            const exercises = getCurrentExercises();
            const mainExercises = exercises.filter(e => e.category !== 'Cardio');
            const cardioExercises = exercises.filter(e => e.category === 'Cardio');

            const renderExercise = (exercise) => {
                const previous = getPreviousWorkout(exercise.id);
                const isLogged = loggedExercises[exercise.id];
                const data = workoutData[exercise.id] || {};
                const showPlateauBuster = isPlateauBuster(exercise.id, workoutHistory, currentDay);
                const prWeightRecovery = getPRWeightRecovery(exercise.id, workoutHistory, currentDay);
                const failedPlateauBusterRetry = !prWeightRecovery ? getFailedPlateauBusterRetry(exercise.id, workoutHistory, currentDay) : null;
                const prAutoRegulation = !prWeightRecovery && !failedPlateauBusterRetry ? getPRAutoRegulation(exercise.id, workoutHistory, currentDay) : null; // Only show if not already showing plateau recovery or failed plateau retry
                const plateauBusterDecrement = showPlateauBuster && !prWeightRecovery ? getPlateauBusterDecrement(exercise.id, workoutHistory, currentDay) : null;

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
                            const displayedWeight = data.weight !== undefined ? data.weight : (prWeightRecovery?.weight || failedPlateauBusterRetry?.weight || prAutoRegulation?.weight || plateauBusterDecrement?.weight || previous?.weight || defaultWeight || '');
                            const currentWeight = parseFloat(displayedWeight) || 0;

                            if (currentWeight === 0) return null;

                            // PIN-STACK EXERCISE
                            if (isPinStack) {
                                const warmups = calculatePinStackWarmups(currentWeight);

                                return (
                                    <div style={{
                                        backgroundColor: '#050510',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        marginBottom: '12px',
                                        fontSize: '13px',
                                        fontFamily: 'monospace'
                                    }}>
                                        <div style={{ marginBottom: '8px' }}>
                                            <div style={{ fontWeight: '600' }}>
                                                Warmup Set #1 (~50%): {warmups.warmup1} lbs
                                            </div>
                                        </div>

                                        <div>
                                            <div style={{ fontWeight: '600' }}>
                                                Warmup Set #2 (~75%): {warmups.warmup2} lbs
                                            </div>
                                        </div>
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
                                            Warmup Set #1 ({warmup1Total} lbs - ~50%):
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
                                            Warmup Set #2 ({warmup2Total} lbs - ~75%):
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
                        {prWeightRecovery && (
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
                        {prAutoRegulation && !prWeightRecovery && (
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
                                    value={data.weight !== undefined ? data.weight : (prWeightRecovery?.weight || failedPlateauBusterRetry?.weight || prAutoRegulation?.weight || plateauBusterDecrement?.weight || previous?.weight || '')}
                                    onChange={(e) => handleInputChange(exercise.id, 'weight', e.target.value)}
                                    placeholder={previous?.weight || ''}
                                    disabled={isLogged}
                                    style={prWeightRecovery || prAutoRegulation ? {
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
                                    placeholder={prWeightRecovery?.reps || (failedPlateauBusterRetry?.targetReps) || (prAutoRegulation ? '6' : (plateauBusterDecrement ? '8' : (showPlateauBuster && previous?.reps ? String(parseInt(previous.reps)) : (previous?.reps ? String(parseInt(previous.reps) + 1) : ''))))}
                                    disabled={isLogged}
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
                    <div className="day-selector">
                        <button
                            className={`day-btn ${currentDay === 1 ? 'active' : ''}`}
                            onClick={() => setCurrentDay(1)}
                        >
                            Push
                        </button>
                        <button
                            className={`day-btn ${currentDay === 2 ? 'active' : ''}`}
                            onClick={() => setCurrentDay(2)}
                        >
                            Pull
                        </button>
                        <button
                            className={`day-btn ${currentDay === 3 ? 'active' : ''}`}
                            onClick={() => setCurrentDay(3)}
                        >
                            Legs
                        </button>
                    </div>

                    <>
                        <div className="section-title">{currentDay === 1 ? 'Push' : currentDay === 2 ? 'Pull' : 'Legs'}</div>
                        {mainExercises.map(renderExercise)}

                        <div className="section-title">Cardio</div>
                        {cardioExercises.map(renderExercise)}
                    </>

                    <button className="save-btn" onClick={completeDay}>
                        Submit Day and View Breakdown
                    </button>

                </>
            );
        }
