        const { useState, useRef } = React;

        function SettingsModal({ onClose, onExport, onImport, onReset, day1Exercises, day2Exercises, updateExerciseName, moveExercise }) {
            const fileInputRef = useRef();
            const [settingsView, setSettingsView] = useState('main'); // 'main', 'exercises'
            const [editingExercise, setEditingExercise] = useState(null);
            const [tempName, setTempName] = useState('');

            const handleStartEdit = (exercise) => {
                setEditingExercise(exercise.id);
                setTempName(exercise.name);
            };

            const handleSaveEdit = (day, exerciseId) => {
                if (tempName.trim()) {
                    updateExerciseName(day, exerciseId, tempName.trim());
                }
                setEditingExercise(null);
                setTempName('');
            };

            const handleCancelEdit = () => {
                setEditingExercise(null);
                setTempName('');
            };

            if (settingsView === 'exercises-day1' || settingsView === 'exercises-day2') {
                const day = settingsView === 'exercises-day1' ? 1 : 2;
                const exercises = day === 1 ? day1Exercises : day2Exercises;
                const dayName = day === 1 ? 'Anterior' : 'Posterior';

                return (
                    <div className="modal-overlay" onClick={onClose}>
                        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px', maxHeight: '80vh', overflowY: 'auto' }}>
                            <div className="modal-title">{dayName} Day Exercises</div>

                            <div style={{ marginBottom: '20px' }}>
                                {exercises.map((exercise, idx) => (
                                    <div key={exercise.id} style={{
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
                                                        border: '1px solid #3a2a5a',
                                                        borderRadius: '4px',
                                                        color: '#b8b8d0',
                                                        marginBottom: '8px'
                                                    }}
                                                    autoFocus
                                                />
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        onClick={() => handleSaveEdit(day, exercise.id)}
                                                        style={{
                                                            flex: 1,
                                                            padding: '6px',
                                                            background: '#3a2a5a',
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
                                                <div style={{ flex: 1, fontWeight: '600' }}>
                                                    {exercise.name}
                                                </div>
                                                <button
                                                    onClick={() => moveExercise(day, exercise.id, 'up')}
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
                                                    onClick={() => moveExercise(day, exercise.id, 'down')}
                                                    disabled={idx === exercises.length - 1}
                                                    style={{
                                                        padding: '4px 8px',
                                                        background: idx === exercises.length - 1 ? '#0d0d1a' : '#1a1a2a',
                                                        border: '1px solid #2a2a3a',
                                                        borderRadius: '4px',
                                                        color: idx === exercises.length - 1 ? '#555' : '#8a8aa0',
                                                        cursor: idx === exercises.length - 1 ? 'not-allowed' : 'pointer'
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
                                    </div>
                                ))}
                            </div>

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

                        <button className="modal-btn" onClick={() => setSettingsView('exercises-day1')}>
                            ✏️ Manage Anterior Day Exercises
                        </button>
                        <button className="modal-btn" onClick={() => setSettingsView('exercises-day2')}>
                            ✏️ Manage Posterior Day Exercises
                        </button>

                        <div style={{ height: '1px', background: '#2a2a3a', margin: '12px 0' }}></div>

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
