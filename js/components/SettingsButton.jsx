        // The header's Settings button on both pages (#31): an outline gear,
        // drawn as an inline SVG rather than the word "Settings". It strokes in
        // currentColor, and .settings-btn sets that to var(--accent-hi), so the
        // gear follows the day's accent. The SVG is aria-hidden and the button
        // carries aria-label="Settings", so a screen reader still reads a word.
        // Eight trapezoid teeth on a 7.6-radius rim, plus a 3-radius hub.
        function SettingsButton({ onClick }) {
            return (
                <button className="settings-btn" aria-label="Settings" onClick={onClick}>
                    <svg className="settings-gear" viewBox="0 0 24 24" width="24" height="24"
                         fill="none" stroke="currentColor" strokeWidth="1.75"
                         strokeLinejoin="round" strokeLinecap="round"
                         aria-hidden="true" focusable="false">
                        <path d="M10.40 4.57L10.67 2.09L13.33 2.09L13.60 4.57A7.6 7.6 0 0 1 16.12 5.62L18.07 4.05L19.95 5.93L18.38 7.88A7.6 7.6 0 0 1 19.43 10.40L21.91 10.67L21.91 13.33L19.43 13.60A7.6 7.6 0 0 1 18.38 16.12L19.95 18.07L18.07 19.95L16.12 18.38A7.6 7.6 0 0 1 13.60 19.43L13.33 21.91L10.67 21.91L10.40 19.43A7.6 7.6 0 0 1 7.88 18.38L5.93 19.95L4.05 18.07L5.62 16.12A7.6 7.6 0 0 1 4.57 13.60L2.09 13.33L2.09 10.67L4.57 10.40A7.6 7.6 0 0 1 5.62 7.88L4.05 5.93L5.93 4.05L7.88 5.62A7.6 7.6 0 0 1 10.40 4.57Z" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                </button>
            );
        }
