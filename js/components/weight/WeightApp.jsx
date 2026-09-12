        // Shell for the weight page. Deliberately the same shape as
        // gym-tracker's App: fixed header with a wordmark and a gear, a
        // scrolling content region, a two-button bottom nav. Check In stands
        // where Workout stands and History stands where History stands, so the
        // muscle memory carries between the two pages.
        //
        // Persistence goes through `repo` — localStorage when signed out or
        // under tests, Firestore when signed in — exactly as the workout app's
        // does. The storage keys and the three weight methods live in
        // storageRepo.js; nothing here knows which implementation it got.
        //
        // The namespace comes free: /gym-tracker/weight/ still matches the
        // '/gym-tracker/' test in utils.js, so this page shares the live
        // namespace with the workout app and is isolated from it on localhost
        // exactly as the workout app is.

        function WeightApp() {
            const [log, setLog] = React.useState([]);
            const [loaded, setLoaded] = React.useState(false);
            const [view, setView] = React.useState('checkin');
            // History opens on the last week. The 30d view was the first
            // default, but the question this page gets opened with is "how did
            // this week go" — 7d answers it without a scrub.
            const [range, setRange] = React.useState(7);
            const [plan, setPlan] = React.useState(null);
            const [showSettings, setShowSettings] = React.useState(false);
            const [settingsOnPlan, setSettingsOnPlan] = React.useState(false);
            const [celebrating, setCelebrating] = React.useState(false);
            const [toast, setToast] = React.useState('');
            const celebrationTimer = React.useRef(null);

            // Which local day the page believes it is. Held in state rather
            // than recomputed inline so a tab left open overnight rolls over
            // and offers a fresh check-in instead of insisting it is still
            // yesterday. One minute is plenty of resolution for a date.
            const [todayKey, setTodayKey] = React.useState(() => localDayKey(new Date()));
            React.useEffect(() => {
                const tick = () => setTodayKey(localDayKey(new Date()));
                const id = setInterval(tick, 60000);
                document.addEventListener('visibilitychange', tick);
                return () => {
                    clearInterval(id);
                    document.removeEventListener('visibilitychange', tick);
                };
            }, []);

            // Same visual-viewport pinning as the workout app — see the long
            // note in App.jsx. It matters more here than it looks: this page's
            // one input is numeric, so a keyboard opens on essentially every
            // visit, and without this the card slides out from under it on iOS.
            React.useEffect(() => {
                const vv = window.visualViewport;
                const apply = () => {
                    const style = document.documentElement.style;
                    style.setProperty('--vvh', (vv ? vv.height : window.innerHeight) + 'px');
                    style.setProperty('--vvo', (vv ? vv.offsetTop : 0) + 'px');
                };
                apply();
                if (vv) {
                    vv.addEventListener('resize', apply);
                    vv.addEventListener('scroll', apply);
                }
                window.addEventListener('resize', apply);
                window.addEventListener('orientationchange', apply);
                return () => {
                    if (vv) {
                        vv.removeEventListener('resize', apply);
                        vv.removeEventListener('scroll', apply);
                    }
                    window.removeEventListener('resize', apply);
                    window.removeEventListener('orientationchange', apply);
                };
            }, []);

            // Startup: load, then fold in the hardcoded workbook history once.
            //
            // The seed is a MERGE, not a replace — a stored entry always wins
            // for its day, so re-seeding can never overwrite something typed on
            // this device. The `weightSeeded` flag is what makes the import
            // idempotent and reversible: Reset leaves it set, so a reset really
            // does empty the app rather than springing 918 days back the next
            // time it loads. Signed in, that flag is account-wide rather than
            // device-local, which is what stops a second device undoing a reset
            // performed on the first.
            //
            // Three plan states, not two: undefined is "never had one" and
            // takes the workbook default, null is "deliberately cleared" and
            // stays cleared. See loadWeight in storageRepo.js.
            React.useEffect(() => {
                window.repoReady
                    .then((repo) => repo.loadWeight())
                    .then(({ weightLog, weightPlan, weightSeeded }) => {
                        let stored = sortedLog(weightLog || []);

                        if (!weightSeeded) {
                            const have = new Set(stored.map((e) => e.date));
                            stored = sortedLog(stored.concat(
                                expandHistorySeed().filter((e) => !have.has(e.date))));
                            window.repo.saveWeightLog(stored);
                            window.repo.markWeightSeeded();
                        }
                        setLog(stored);

                        setPlan(weightPlan === undefined
                            ? DEFAULT_CUT_PLAN
                            : (weightPlan ? normalizePlan(weightPlan) : null));

                        setLoaded(true);
                    });
            }, []);

            React.useEffect(() => () => clearTimeout(celebrationTimer.current), []);

            // Safe to write unconditionally because the component renders
            // nothing until `loaded`, so no handler that could call this exists
            // before the stored log is in state. Without that gate the initial
            // empty array would race the load and blank real data.
            const persist = (next) => {
                setLog(next);
                window.repo.saveWeightLog(next);
            };

            // A cleared plan is written as an explicit null rather than by
            // removing the record. Nothing stored means "never had a plan" and
            // loads the workbook default; a stored null is how "I deliberately
            // cleared it" survives a reload instead of the default springing
            // back.
            const persistPlan = (next) => {
                setPlan(next);
                window.repo.saveWeightPlan(next || null);
            };

            const progress = React.useMemo(
                () => planProgress(plan, log, todayKey), [plan, log, todayKey]);

            const flash = (msg) => {
                setToast(msg);
                setTimeout(() => setToast(''), 2000);
            };

            const handleCheckIn = (weight) => {
                const next = upsertEntry(log, todayKey, weight);
                persist(next);
                // The gold aura is gym-tracker's PR celebration, reused. It
                // fires on the streak rule holding — a reading at or below the
                // last one — never on the value itself.
                if (checkInStreak(next) > 0) {
                    clearTimeout(celebrationTimer.current);
                    setCelebrating(true);
                    celebrationTimer.current = setTimeout(() => setCelebrating(false), PR_CELEBRATION_MS);
                }
            };

            // Corrections from the History ledger. Separate handlers rather
            // than one upsert, because these two acts are not the same as a
            // check-in: neither restamps `loggedAt`, and neither can invent a
            // day. Deliberately no celebration either — the gold aura is for
            // standing on the scale, not for fixing a typo about it.
            const handleEditEntry = (dayKey, weight) => {
                persist(editEntry(log, dayKey, weight));
                flash('Updated');
            };

            const handleDeleteEntry = (dayKey) => {
                persist(removeEntry(log, dayKey));
                flash('Deleted');
            };

            const exportData = () => {
                const blob = new Blob([JSON.stringify({
                    weightLog: log,
                    weightPlan: plan,
                    exportDate: new Date().toISOString(),
                }, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'weight-backup-' + todayKey + '.json';
                link.click();
                URL.revokeObjectURL(url);
            };

            const importData = (event) => {
                const file = event.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const parsed = JSON.parse(e.target.result);
                        const incoming = Array.isArray(parsed) ? parsed : parsed.weightLog;
                        if (!Array.isArray(incoming)) throw new Error('no weightLog array');
                        persist(sortedLog(incoming.filter((x) => x && x.date && typeof x.weight === 'number')));
                        if (parsed && parsed.weightPlan) persistPlan(normalizePlan(parsed.weightPlan));
                        flash('Imported');
                        setShowSettings(false);
                    } catch (err) {
                        alert('Could not read that file: ' + err.message);
                    }
                };
                reader.readAsText(file);
                event.target.value = '';
            };

            const resetData = () => {
                if (!confirm('Delete every weight check-in, including the imported history? '
                             + 'This cannot be undone.')) return;
                persist([]);
                // The seeded flag deliberately STAYS set. It records that the
                // workbook history has already been offered, and that is
                // exactly what has to survive a reset — clear it here and the
                // next load re-imports all 918 days, so the reset silently
                // undoes itself. Signed in it is account-wide, so the reset
                // survives the next load on every device rather than only this
                // one. Getting the history back after a reset is a job for
                // Import, not for a reset that does not reset.
                setShowSettings(false);
                flash('Cleared');
            };

            if (!loaded) return null;

            return (
                <div className="app">
                    {toast && <div className="success-message">{toast}</div>}

                    {showSettings && (
                        <WeightSettingsModal
                            onClose={() => { setShowSettings(false); setSettingsOnPlan(false); }}
                            onExport={exportData}
                            onImport={importData}
                            onReset={resetData}
                            entryCount={log.length}
                            plan={plan}
                            onSavePlan={persistPlan}
                            onClearPlan={() => persistPlan(null)}
                            startOnPlan={settingsOnPlan}
                        />
                    )}

                    <div className="header">
                        <div className="header-top">
                            <div className="wordmark">
                                <h1>Weight</h1>
                                <div className="week-indicator">Cut</div>
                            </div>
                            <button className="settings-btn"
                                    onClick={() => { setSettingsOnPlan(false); setShowSettings(true); }}>⚙️</button>
                        </div>
                    </div>

                    <div className="content">
                        {view === 'checkin' && (
                            <CheckInView
                                log={log}
                                todayKey={todayKey}
                                onCheckIn={handleCheckIn}
                                celebrating={celebrating}
                                progress={progress}
                            />
                        )}
                        {view === 'history' && (
                            <WeightHistory
                                log={log}
                                range={range}
                                setRange={setRange}
                                progress={progress}
                                onEditPlan={() => { setSettingsOnPlan(true); setShowSettings(true); }}
                                onEditEntry={handleEditEntry}
                                onDeleteEntry={handleDeleteEntry}
                            />
                        )}
                    </div>

                    <nav className="bottom-nav">
                        <button
                            className={'bottom-nav-btn ' + (view === 'checkin' ? 'active' : '')}
                            onClick={() => setView('checkin')}
                        >
                            <span className="bottom-nav-icon">◉</span>
                            Check In
                        </button>
                        <button
                            className={'bottom-nav-btn ' + (view === 'history' ? 'active' : '')}
                            onClick={() => { setView('history'); window.scrollTo(0, 0); }}
                        >
                            <span className="bottom-nav-icon">≡</span>
                            History
                        </button>
                    </nav>
                </div>
            );
        }

        ReactDOM.render(<WeightApp />, document.getElementById('root'));
