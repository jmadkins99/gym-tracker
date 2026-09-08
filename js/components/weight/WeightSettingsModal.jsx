        // Same modal furniture as gym-tracker's Settings, minus everything that
        // does not apply, plus the cut plan's parameters — the "Initial Inputs"
        // block from the TDEE workbook, reduced to the five fields the plan
        // maths actually reads.
        //
        // The goal row is a readout rather than a control on purpose: this
        // iteration is Cut-only, and the streak rules (hold-or-lower daily,
        // lower-average weekly) plus the plan line's direction are all written
        // against that. A Bulk switch would need every one of them inverted, so
        // it lands with them rather than as a toggle that quietly does nothing.
        //
        // Calorie targets are deliberately absent. The workbook computes a TDEE
        // and a daily intake figure from the same numbers, but a target is only
        // worth anything if intake is logged against it, and that is a whole
        // second daily habit this page has not asked for.

        // One row of the plan editor. Numbers go through a text input with
        // inputMode=decimal rather than type=number: the spinner is useless on
        // a phone and type=number swallows partial input like "1." mid-typing.
        function PlanField({ label, value, onChange, suffix, type }) {
            return (
                <label className="plan-field">
                    <span className="plan-field-label">{label}</span>
                    <span className="plan-field-input">
                        <input
                            className="input-field"
                            type={type || 'text'}
                            inputMode={type === 'date' ? undefined : 'decimal'}
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                        />
                        {suffix && <span className="plan-field-suffix">{suffix}</span>}
                    </span>
                </label>
            );
        }

        function WeightSettingsModal({ onClose, onExport, onImport, onReset, entryCount,
                                      plan, onSavePlan, onClearPlan, startOnPlan }) {
            const fileInputRef = React.useRef(null);
            const [editingPlan, setEditingPlan] = React.useState(!!startOnPlan);
            const [draft, setDraft] = React.useState(() => ({
                name: plan ? plan.name : 'Cut plan',
                startDate: plan ? plan.startDate : localDayKey(getMondayOfWeek(new Date())),
                startWeight: plan ? String(plan.startWeight) : '',
                goalWeight: plan ? String(normalizePlan(plan).goalWeight) : '',
                ratePerWeek: plan ? String(plan.ratePerWeek) : '2',
                weeks: plan ? String(plan.weeks) : '12',
            }));

            const set = (k) => (v) => setDraft((d) => Object.assign({}, d, { [k]: v }));

            const num = (v) => (v === '' || isNaN(parseFloat(v)) ? null : parseFloat(v));
            const valid = draft.name.trim() !== '' &&
                /^\d{4}-\d{2}-\d{2}$/.test(draft.startDate) &&
                num(draft.startWeight) > 0 && num(draft.goalWeight) > 0 &&
                // A cut's goal has to be BELOW where it starts. Without this
                // the derived pounds-to-lose goes zero or negative and the
                // progress bar has nothing to divide by.
                num(draft.goalWeight) < num(draft.startWeight) &&
                num(draft.ratePerWeek) > 0 && num(draft.weeks) > 0;

            const save = () => {
                if (!valid) return;
                onSavePlan({
                    name: draft.name.trim(),
                    // Snapped to a Monday: every week bucket in the app is a
                    // Monday week, and a plan starting on a Thursday would put
                    // its week boundaries permanently out of step with the
                    // weekly averages it is compared against.
                    startDate: localDayKey(getMondayOfWeek(parseDayKey(draft.startDate))),
                    startWeight: num(draft.startWeight),
                    goalWeight: num(draft.goalWeight),
                    ratePerWeek: num(draft.ratePerWeek),
                    weeks: Math.round(num(draft.weeks)),
                });
                setEditingPlan(false);
            };

            // The inverse readout: you set the destination, the app tells you
            // how far that is. Shown live because "145" on its own does not say
            // whether you have signed up for 5 lb or 25.
            const toLose = (num(draft.startWeight) !== null && num(draft.goalWeight) !== null)
                ? num(draft.startWeight) - num(draft.goalWeight) : null;

            return (
                <div className="modal-overlay" onClick={onClose}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-title">Settings</div>

                        <div className="weigh-setting-row">
                            <span className="weigh-setting-label">Goal</span>
                            <span className="weigh-setting-value">Cut</span>
                        </div>
                        <div className="weigh-setting-note">
                            Streaks reward a reading that holds or falls, and a weekly average
                            that falls. Bulk is not built yet.
                        </div>

                        <div className="weigh-setting-row">
                            <span className="weigh-setting-label">Check-ins recorded</span>
                            <span className="weigh-setting-value">{entryCount}</span>
                        </div>

                        <div className="section-title">Cut plan</div>

                        {!editingPlan ? (
                            <>
                                {plan ? (
                                    <div className="weigh-setting-note">
                                        <strong>{plan.name}</strong><br />
                                        {formatWeight(plan.startWeight)} lb from{' '}
                                        {formatMonthDay(plan.startDate)} down to{' '}
                                        {formatWeight(normalizePlan(plan).goalWeight)} lb —{' '}
                                        {formatWeight(planGoalPounds(normalizePlan(plan)))} lb at{' '}
                                        {formatWeight(plan.ratePerWeek)} lb/wk over {plan.weeks} weeks.
                                    </div>
                                ) : (
                                    <div className="weigh-setting-note">No plan set.</div>
                                )}
                                <button className="modal-btn" onClick={() => setEditingPlan(true)}>
                                    {plan ? '✏️ Edit plan' : '➕ Set a plan'}
                                </button>
                                {plan && (
                                    <button className="modal-btn" onClick={onClearPlan}>
                                        Clear plan
                                    </button>
                                )}
                            </>
                        ) : (
                            <>
                                <PlanField label="Name" value={draft.name} onChange={set('name')} />
                                <PlanField label="Start (Monday)" value={draft.startDate}
                                           onChange={set('startDate')} type="date" />
                                <PlanField label="Start weight" value={draft.startWeight}
                                           onChange={set('startWeight')} suffix="lb" />
                                <PlanField label="Goal weight" value={draft.goalWeight}
                                           onChange={set('goalWeight')} suffix="lb" />
                                <PlanField label="Target rate" value={draft.ratePerWeek}
                                           onChange={set('ratePerWeek')} suffix="lb/wk" />
                                <PlanField label="Length" value={draft.weeks}
                                           onChange={set('weeks')} suffix="wks" />
                                {toLose !== null && (
                                    <div className="weigh-setting-note">
                                        {toLose > 0
                                            ? formatWeight(toLose) + ' lb to lose.'
                                            : 'Goal weight must be below the start weight.'}
                                    </div>
                                )}
                                <button className="modal-btn primary" onClick={save} disabled={!valid}>
                                    Save plan
                                </button>
                                <button className="modal-btn" onClick={() => setEditingPlan(false)}>
                                    Cancel
                                </button>
                            </>
                        )}

                        <div className="section-title">Data</div>

                        <button className="modal-btn" onClick={onExport}>📥 Export Data</button>
                        <button className="modal-btn" onClick={() => fileInputRef.current.click()}>
                            📤 Import Data
                        </button>
                        <button className="modal-btn danger" onClick={onReset}>🗑️ Reset All Data</button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            className="file-input"
                            onChange={onImport}
                        />

                        <button className="modal-btn primary" onClick={onClose}>Close</button>
                    </div>
                </div>
            );
        }
