        // Same modal furniture as gym-tracker's Settings, minus everything that
        // does not apply, plus the cut plan's parameters — the "Initial Inputs"
        // block from the TDEE workbook, reduced to the five fields the plan
        // maths actually reads.
        //
        // Four of those numbers state the same line twice. Start, goal, rate
        // and length are over-determined: any three fix the fourth, and typing
        // all four is how a plan comes to ask for 40 lb while reporting against
        // 30 (the target line runs off rate x weeks, the progress bar off the
        // goal weight, and neither ever consults the other). So the editor
        // SOLVES FOR one of them. Start weight is never the solved one — it is
        // a fact about the scale rather than a choice — which leaves goal, rate
        // and length, and which of those three is derived is itself the choice:
        // "30 lb at 2.5 a week, how long?" and "30 lb by March, how fast?" are
        // both real questions, and neither is more the plan's shape than the
        // other. The pick is stored on the plan so reopening Settings lands
        // back in the same three inputs.
        //
        // The arithmetic itself is derivePlanField in planLogic.js, beside the
        // target line it has to agree with.
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

        const SOLVE_OPTIONS = [
            { key: 'goalWeight', label: 'Goal', field: 'Goal weight', suffix: 'lb' },
            { key: 'ratePerWeek', label: 'Rate', field: 'Target rate', suffix: 'lb/wk' },
            { key: 'weeks', label: 'Length', field: 'Length', suffix: 'wks' },
        ];

        // A plan whose length would run past five years is a data-entry
        // accident rather than a diet — 0.05 typed for the rate — and planRows
        // would build a row per week of it.
        const MAX_PLAN_WEEKS = 260;

        // Derived numbers print at the precision they actually have rather than
        // through formatWeight: 30 lb over 16 weeks is 1.875 lb/wk, and a rate
        // rounded to a tenth for display is a rate that misses the goal by the
        // rounding. Trailing zeros go, so a whole number still reads as one.
        function planNumberText(n) {
            return String(Math.round(n * 1000) / 1000);
        }

        // One row of the plan editor. Numbers go through a text input with
        // inputMode=decimal rather than type=number: the spinner is useless on
        // a phone and type=number swallows partial input like "1." mid-typing.
        //
        // The solved-for row is the same row with the input replaced by a
        // readout. Not a disabled input: a greyed-out box reads as a field you
        // are not allowed to fill in, and this one is not being withheld — it
        // is the answer to the other three.
        function PlanField({ label, value, onChange, suffix, type, derived }) {
            return (
                <label className={'plan-field' + (derived ? ' is-derived' : '')}>
                    <span className="plan-field-label">{label}</span>
                    <span className="plan-field-input">
                        {derived ? (
                            <span className="plan-field-derived">{value}</span>
                        ) : (
                            <input
                                className="input-field"
                                type={type || 'text'}
                                inputMode={type === 'date' ? undefined : 'decimal'}
                                value={value}
                                onChange={(e) => onChange(e.target.value)}
                            />
                        )}
                        {suffix && <span className="plan-field-suffix">{suffix}</span>}
                    </span>
                </label>
            );
        }

        function WeightSettingsModal({ onClose, onExport, onImport, onReset, entryCount,
                                      plan, onSavePlan, onClearPlan, startOnPlan }) {
            const fileInputRef = React.useRef(null);
            const [editingPlan, setEditingPlan] = React.useState(!!startOnPlan);
            const [draft, setDraft] = React.useState(() => {
                const p = normalizePlan(plan);
                return {
                    name: p ? p.name : 'Cut plan',
                    startDate: p ? p.startDate : localDayKey(getMondayOfWeek(new Date())),
                    startWeight: p ? String(p.startWeight) : '',
                    goalWeight: p ? String(p.goalWeight) : '',
                    ratePerWeek: p ? String(p.ratePerWeek) : '2',
                    weeks: p ? String(p.weeks) : '12',
                    // Plans saved before this existed have all four typed in and
                    // no recorded preference. They open solving for length,
                    // which is the field that can absorb the correction without
                    // changing what the plan was asked to do: the goal weight
                    // and the rate both survive, and the end date moves to where
                    // those two actually put it.
                    solveFor: (p && p.solveFor) || 'weeks',
                };
            });

            const set = (k) => (v) => setDraft((d) => Object.assign({}, d, { [k]: v }));

            const num = (v) => (v === '' || isNaN(parseFloat(v)) ? null : parseFloat(v));

            // The typed fields, with the solved-for one held out: leaving its
            // stale text in is how it would appear to answer with the number it
            // is supposed to be computing.
            const typed = {
                startWeight: num(draft.startWeight),
                goalWeight: num(draft.goalWeight),
                ratePerWeek: num(draft.ratePerWeek),
                weeks: num(draft.weeks),
            };
            typed[draft.solveFor] = null;

            const derived = derivePlanField(draft.solveFor, typed);
            const resolved = Object.assign({}, typed, { [draft.solveFor]: derived });

            // Switching which field is solved for hands the old derived one back
            // as an input carrying the number it was showing, rather than
            // reverting to whatever text was in it before. Switch from Length to
            // Rate and the 12 weeks it just worked out is what you are now
            // editing — the plan on screen does not change under you, only which
            // end of it is held fixed.
            const chooseSolveFor = (key) => setDraft((d) => {
                if (d.solveFor === key) return d;
                const next = Object.assign({}, d, { solveFor: key });
                if (derived !== null) next[d.solveFor] = planNumberText(derived);
                return next;
            });

            const inputsIn = draft.name.trim() !== '' &&
                /^\d{4}-\d{2}-\d{2}$/.test(draft.startDate) &&
                ['startWeight', 'goalWeight', 'ratePerWeek', 'weeks']
                    .every((k) => k === draft.solveFor || typed[k] > 0);

            // Told apart from merely unfinished on purpose: a half-typed field
            // is not a mistake and gets no message, only a Save that is not yet
            // available. A complete set of numbers that cannot make a plan does
            // get one, and says which way it failed.
            const problem = !inputsIn ? null
                : derived === null ? 'Those numbers do not make a plan.'
                : resolved.goalWeight <= 0
                    ? 'That rate over that many weeks lands at or below zero.'
                : resolved.goalWeight >= resolved.startWeight
                    ? 'Goal weight must be below the start weight.'
                : resolved.weeks > MAX_PLAN_WEEKS
                    ? 'That works out at ' + resolved.weeks + ' weeks. Raise the rate or the goal.'
                : null;

            const valid = inputsIn && !problem;

            const save = () => {
                if (!valid) return;
                onSavePlan({
                    name: draft.name.trim(),
                    // Snapped to a Monday: every week bucket in the app is a
                    // Monday week, and a plan starting on a Thursday would put
                    // its week boundaries permanently out of step with the
                    // weekly averages it is compared against.
                    startDate: localDayKey(getMondayOfWeek(parseDayKey(draft.startDate))),
                    startWeight: resolved.startWeight,
                    goalWeight: resolved.goalWeight,
                    ratePerWeek: resolved.ratePerWeek,
                    weeks: Math.round(resolved.weeks),
                    solveFor: draft.solveFor,
                });
                setEditingPlan(false);
            };

            // The plan read back in the other direction, so the three numbers
            // typed and the one that fell out are checkable as a single sentence
            // — including the end date, which is the part nobody works out in
            // their head.
            const summary = (() => {
                if (!valid) return null;
                const end = getMondayOfWeek(parseDayKey(draft.startDate));
                end.setDate(end.getDate() + resolved.weeks * 7);
                return formatWeight(resolved.startWeight - resolved.goalWeight) + ' lb at ' +
                    planNumberText(resolved.ratePerWeek) + ' lb/wk over ' + resolved.weeks +
                    ' weeks, ending ' + formatMonthDay(localDayKey(end)) + '.';
            })();

            // A length is a count of Mondays, so it rounds up, and a rate that
            // does not divide evenly leaves the last week's target a shade under
            // the goal. Small and deliberate, and said out loud here rather than
            // left for the History ledger to reveal.
            const lastWeekTarget = valid && draft.solveFor === 'weeks'
                ? resolved.startWeight - resolved.ratePerWeek * resolved.weeks : null;
            const overshoot = lastWeekTarget !== null && lastWeekTarget < resolved.goalWeight - 0.05
                ? 'Week ' + resolved.weeks + ' asks for ' + formatWeight(lastWeekTarget) +
                  ' lb — the rate does not divide evenly, so the last week overshoots a little.'
                : null;

            // A plan saved before the editor derived anything can still hold
            // four numbers that disagree, and it goes on being read two ways
            // until someone opens it. Saying so is the whole prompt to do that.
            const saved = normalizePlan(plan);
            const savedLands = saved ? saved.startWeight - saved.ratePerWeek * saved.weeks : null;
            const savedDisagrees = saved !== null && Math.abs(savedLands - saved.goalWeight) > 0.05;

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
                                {saved ? (
                                    <div className="weigh-setting-note">
                                        <strong>{saved.name}</strong><br />
                                        {formatWeight(saved.startWeight)} lb from{' '}
                                        {formatMonthDay(saved.startDate)} down to{' '}
                                        {formatWeight(saved.goalWeight)} lb —{' '}
                                        {formatWeight(planGoalPounds(saved))} lb at{' '}
                                        {formatWeight(saved.ratePerWeek)} lb/wk over {saved.weeks} weeks.
                                        {savedDisagrees && (
                                            <span className="plan-warn">
                                                <br />
                                                Those disagree: {formatWeight(saved.ratePerWeek)} lb/wk for{' '}
                                                {saved.weeks} weeks lands at {formatWeight(savedLands)} lb,
                                                not {formatWeight(saved.goalWeight)}. Edit and save to
                                                settle it.
                                            </span>
                                        )}
                                    </div>
                                ) : (
                                    <div className="weigh-setting-note">No plan set.</div>
                                )}
                                <button className="modal-btn" onClick={() => setEditingPlan(true)}>
                                    {saved ? '✏️ Edit plan' : '➕ Set a plan'}
                                </button>
                                {saved && (
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

                                <div className="plan-solve">
                                    <span className="plan-field-label">Solve for</span>
                                    <div className="day-toggle plan-solve-toggle">
                                        {SOLVE_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.key}
                                                className={'day-pill' +
                                                    (draft.solveFor === opt.key ? ' active' : '')}
                                                onClick={() => chooseSolveFor(opt.key)}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {SOLVE_OPTIONS.map((opt) => (
                                    <PlanField
                                        key={opt.key}
                                        label={opt.field}
                                        suffix={opt.suffix}
                                        derived={draft.solveFor === opt.key}
                                        value={draft.solveFor === opt.key
                                            ? (derived === null ? '—' : planNumberText(derived))
                                            : draft[opt.key]}
                                        onChange={set(opt.key)}
                                    />
                                ))}

                                {(problem || summary) && (
                                    <div className={'weigh-setting-note plan-note' + (problem ? ' plan-warn' : '')}>
                                        {problem || summary}
                                        {overshoot && <><br />{overshoot}</>}
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
