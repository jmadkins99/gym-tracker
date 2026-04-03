        function BackupReminderModal({ onExport, onDismiss }) {
            return (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-title">💾 Backup Reminder</div>
                        <p style={{ color: '#888', marginBottom: '20px', fontSize: '14px' }}>
                            It's been a month! Back up your workout data to keep it safe.
                        </p>
                        <button className="modal-btn primary" onClick={onExport}>
                            Download Backup
                        </button>
                        <button className="modal-btn" onClick={onDismiss}>
                            Remind Me Later
                        </button>
                    </div>
                </div>
            );
        }
