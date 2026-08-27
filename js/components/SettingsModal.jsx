        const { useState, useRef } = React;

        function SettingsModal({ onClose, onExport, onImport, onReset, exercises, updateExerciseName, updateExerciseLoadType, moveExercise }) {
            const fileInputRef = useRef();
            const [settingsView, setSettingsView] = useState('main'); // 'main', 'exercises'
            const [editingExercise, setEditingExercise] = useState(null);
            const [tempName, setTempName] = useState('');

            const handleStartEdit = (exercise) => {
                setEditingExercise(exercise.id);
                setTempName(exercise.name);
            };

            const handleSaveEdit = (exerciseId) => {
                if (tempName.trim()) {
                    updateExerciseName(exerciseId, tempName.trim());
                }
                setEditingExercise(null);
                setTempName('');
            };

            const handleCancelEdit = () => {
                setEditingExercise(null);
                setTempName('');
            };

            if (settingsView === 'exercises') {
                return (
                    <div className="modal-overlay" onClick={onClose}>
                        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', maxHeight: '80vh', overflowY: 'auto' }}>
                            <div className="modal-title">Exercises</div>

                            {/* Grouped by day so the up/down arrows stop at each
                                day's boundary — moveExercise refuses to swap
                                across it, so an arrow that looked enabled there
                                would silently do nothing. */}
                            {[['anterior', 'Anterior'], ['posterior', 'Posterior']].map(([dayKey, dayLabel]) => {
                              const dayExercises = exercises.filter(e => e.day === dayKey);
                              if (dayExercises.length === 0) return null;
                              return (
                                <div key={dayKey} style={{ marginBottom: '20px' }}>
                                    <div className="section-title">{dayLabel}</div>
                                    {dayExercises.map((exercise, idx) => (
                                    <div key={exercise.id} className="exercise-row" data-exercise-id={exercise.id} style={{
                                        background: '#1a1a2a',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        marginBottom: '8px',
                                        border: '1px solid #2a2a3a'
                                    }}>
                                        {editingExercise === exercise.id ? (
                                            <div>
                                                <input
                                                    type="text"
                                                    value={tempName}
                                                    onChange={(e) => setTempName(e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px',
                                                        background: '#0d0d1a',
                                                        border: '1px solid var(--accent)',
                                                        borderRadius: '4px',
                                                        color: '#b8b8d0',
                                                        marginBottom: '8px'
                                                    }}
                                                    autoFocus
                                                />
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        onClick={() => handleSaveEdit(exercise.id)}
                                                        style={{
                                                            flex: 1,
                                                            padding: '6px',
                                                            background: 'var(--accent)',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            color: '#b8b8d0',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={handleCancelEdit}
                                                        style={{
                                                            flex: 1,
                                                            padding: '6px',
                                                            background: '#1a1a2a',
                                                            border: '1px solid #2a2a3a',
                                                            borderRadius: '4px',
                                                            color: '#8a8aa0',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div className="exercise-row-name" style={{ flex: 1, fontWeight: '600' }}>
                                                    {exercise.name}
                                                </div>
                                                <button
                                                    onClick={() => moveExercise(exercise.id, 'up')}
                                                    disabled={idx === 0}
                                                    style={{
                                                        padding: '4px 8px',
                                                        background: idx === 0 ? '#0d0d1a' : '#1a1a2a',
                                                        border: '1px solid #2a2a3a',
                                                        borderRadius: '4px',
                                                        color: idx === 0 ? '#555' : '#8a8aa0',
                                                        cursor: idx === 0 ? 'not-allowed' : 'pointer'
                                                    }}
                                                >
                                                    ↑
                                                </button>
                                                <button
                                                    onClick={() => moveExercise(exercise.id, 'down')}
                                                    disabled={idx === dayExercises.length - 1}
                                                    style={{
                                                        padding: '4px 8px',
                                                        background: idx === dayExercises.length - 1 ? '#0d0d1a' : '#1a1a2a',
                                                        border: '1px solid #2a2a3a',
                                                        borderRadius: '4px',
                                                        color: idx === dayExercises.length - 1 ? '#555' : '#8a8aa0',
                                                        cursor: idx === dayExercises.length - 1 ? 'not-allowed' : 'pointer'
                                                    }}
                                                >
                                                    ↓
                                                </button>
                                                <button
                                                    onClick={() => handleStartEdit(exercise)}
                                                    style={{
                                                        padding: '4px 8px',
                                                        background: '#1a1a2a',
                                                        border: '1px solid #2a2a3a',
                                                        borderRadius: '4px',
                                                        color: '#8a8aa0',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    ✏️
                                                </button>
                                            </div>
                                        )}

                                        {/* Which shape the Weight Breakdown renders.
                                            Its own row rather than a fourth control in
                                            the flex row above — at phone width the name
                                            is already competing with three buttons. Sits
                                            outside the rename branch so it stays put
                                            while a name is being edited. */}
                                        <select
                                            className="input-field"
                                            data-field="loadType"
                                            value={resolveLoadType(exercise)}
                                            onChange={(e) => updateExerciseLoadType(exercise.id, e.target.value)}
                                            style={{
                                                marginTop: '8px',
                                                padding: '8px',
                                                fontSize: '14px',
                                                background: '#0d0d1a'
                                            }}
                                        >
                                            <option value="pin">Pin-loaded</option>
                                            <option value="plate-two-sided">Plate-loaded on both sides</option>
                                            <option value="plate-one-sided">Plate-loaded on one side</option>
                                        </select>
                                    </div>
                                    ))}
                                </div>
                              );
                            })}

                            <button className="modal-btn" onClick={() => setSettingsView('main')}>
                                ← Back to Settings
                            </button>
                        </div>
                    </div>
                );
            }

            return (
                <div className="modal-overlay" onClick={onClose}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-title">Settings</div>

                        <button className="modal-btn" onClick={() => setSettingsView('exercises')}>
                            ✏️ Manage Exercises
                        </button>

                        <div style={{ height: '1px', background: '#2a2a3a', margin: '12px 0' }}></div>

                        {window.FIREBASE_READY && window.repo && (
                            window.repo.mode === 'firestore' ? (
                                <div style={{
                                    background: '#1a1a2a',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    marginBottom: '8px',
                                    border: '1px solid #2a2a3a',
                                    fontSize: '14px'
                                }}>
                                    <div style={{ marginBottom: '8px' }}>
                                        ☁️ Syncing as <strong>{window.repo.status().email}</strong>
                                        {window.repo.status().pendingWrites > 0 &&
                                            <span style={{ color: '#8a8aa0' }}> ({window.repo.status().pendingWrites} pending)</span>}
                                    </div>
                                    <button className="modal-btn" onClick={() => window.repoSignOut()}>
                                        Sign out
                                    </button>
                                </div>
                            ) : (
                                <button className="modal-btn" onClick={() => window.repoSignIn()}>
                                    ☁️ Sign in with Google to sync
                                </button>
                            )
                        )}
                        {window.FIREBASE_READY && <div style={{ height: '1px', background: '#2a2a3a', margin: '12px 0' }}></div>}

                        <button className="modal-btn" onClick={onExport}>
                            📥 Export Data
                        </button>
                        <button className="modal-btn" onClick={() => fileInputRef.current.click()}>
                            📤 Import Data
                        </button>
                        <button className="modal-btn danger" onClick={onReset}>
                            🗑️ Reset All Data
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            className="file-input"
                            onChange={onImport}
                        />
                        <button className="modal-btn" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>
            );
        }
