// Repeating tasks: the "Repeat" field in the add and edit forms, and the small badge in
// a task's meta row. A repeating task needs a due date and an end date (up to a year
// after the due date), so nothing repeats forever. Ticking one off makes the API create
// the next copy; only one copy is open at a time.

import { REPEAT_OPTIONS, fitRepeatUntil, formatDay, maxRepeatUntil, remainingOccurrences } from './repeatUtils';

export function RepeatIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 2l3 3-3 3" />
            <path d="M4 11V9a4 4 0 0 1 4-4h12" />
            <path d="M7 22l-3-3 3-3" />
            <path d="M20 13v2a4 4 0 0 1-4 4H4" />
        </svg>
    );
}

// One box: repeat icon, how often, then "until" and the end date once a rule is picked.
// Choosing a rule fills in a sensible end date, which the person can change.
export function RepeatField({ dueDate, rule, until, onChange, id }) {
    const active = Boolean(dueDate && rule);

    return (
        <div className={`reminder-field repeat-field${active ? ' has-time' : ''}${dueDate ? '' : ' is-disabled'}`}>
            <span className="reminder-field-icon" aria-hidden="true"><RepeatIcon /></span>
            <select
                id={id}
                aria-label="Repeat"
                value={dueDate ? rule : ''}
                disabled={!dueDate}
                title={dueDate ? undefined : 'Add a due date to make the task repeat'}
                onChange={(e) => {
                    const nextRule = e.target.value;
                    onChange({ rule: nextRule, until: nextRule ? fitRepeatUntil(dueDate, nextRule, until) : '' });
                }}
            >
                <option value="">Doesn&apos;t repeat</option>
                {REPEAT_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                ))}
            </select>
            {active && (
                <>
                    <span className="repeat-field-until" aria-hidden="true">until</span>
                    <input
                        type="date"
                        aria-label="Repeat until"
                        value={until}
                        min={dueDate}
                        max={maxRepeatUntil(dueDate)}
                        required
                        onChange={(e) => onChange({ rule, until: e.target.value })}
                    />
                </>
            )}
        </div>
    );
}

// Edit form version: the field plus a note saying how many more times it comes back.
export function RepeatPicker({ dueDate, rule, until, onChange }) {
    let note = null;
    if (!dueDate) {
        note = 'Add a due date to make the task repeat.';
    } else if (rule && until) {
        const { count, last } = remainingOccurrences(dueDate, rule, until);
        note = count === 0
            ? "This is the last one; nothing comes after it."
            : `Comes back ${count} more ${count === 1 ? 'time' : 'times'}, the last due ${formatDay(last, true)}.`;
    }

    return (
        <div className="reminder-picker">
            <RepeatField id="repeat-rule" dueDate={dueDate} rule={rule} until={until} onChange={onChange} />
            {note && <p className="reminder-note" aria-live="polite">{note}</p>}
        </div>
    );
}

// Small repeat icon + how often, in a task's meta row.
export function RepeatBadge({ todo }) {
    const option = REPEAT_OPTIONS.find((o) => o.key === todo.recurrence);
    if (!option || !todo.recurrence_until) return null;
    const description = `Repeats ${option.phrase} until ${formatDay(todo.recurrence_until)}`;

    return (
        <span className="task-repeat" title={description}>
            <RepeatIcon />
            <span className="visually-hidden">{description}</span>
            <span aria-hidden="true">{option.label}</span>
        </span>
    );
}
