// Task reminder UI: the days-before dropdown, the edit-form picker and the badge shown
// on tasks. Email is the only delivery method for now.
import {
    DEFAULT_REMINDER_TIME,
    REMINDER_OPTIONS,
    formatReminderTime,
    isDayPast,
    nextAvailableTime,
    reminderMoment,
} from './reminderUtils';

function BellIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
    );
}

// Days-before dropdown. Disabled until the task has a due date. Options that can no
// longer work are disabled: with a fixed `time`, those whose moment has passed;
// otherwise those whose whole day has passed (the time can still be changed).
// `compact` is for fields without a visible label (short option text, an aria-label);
// `shortLabels` alone keeps the visible label but uses the short option text.
export function ReminderSelect({ dueDate, days, onChange, id, time = null, compact = false, shortLabels = compact }) {
    const isUnavailable = (optionDays) => time
        ? reminderMoment(dueDate, optionDays, time) <= new Date()
        : isDayPast(dueDate, optionDays);

    // A value outside the presets (e.g. 5 days, from the assistant or the API) still gets an
    // option, so the select never shows "No reminder" for a task that has one.
    const options = days === null || days === undefined || REMINDER_OPTIONS.some((o) => o.days === days)
        ? REMINDER_OPTIONS
        : [...REMINDER_OPTIONS, { days, label: `${days} days before`, short: `${days} days before` }]
            .sort((a, b) => a.days - b.days);

    return (
        <select
            id={id}
            aria-label={compact ? 'Reminder' : undefined}
            value={days ?? ''}
            disabled={!dueDate}
            title={dueDate ? 'Email me a reminder' : 'Add a due date to set a reminder'}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        >
            <option value="">{compact && !dueDate ? 'Reminder' : 'No reminder'}</option>
            {options.map((option) => (
                <option key={option.days} value={option.days} disabled={Boolean(dueDate) && isUnavailable(option.days)}>
                    {shortLabels ? option.short : option.label}
                </option>
            ))}
        </select>
    );
}

// The reminder day and its time in one box: the days-before dropdown, and once a
// reminder is picked, the time sits inline on its right behind a divider, so the
// control grows sideways instead of adding a row. Used by the add-task form, the edit
// form and the assistant's task cards.
export function ReminderField({ dueDate, days, time, onDaysChange, onTimeChange, id, compact = false }) {
    const showTime = Boolean(dueDate) && days !== null && days !== undefined;

    return (
        <div className={`reminder-field${showTime ? ' has-time' : ''}${dueDate ? '' : ' is-disabled'}`}>
            <span className="reminder-field-icon" aria-hidden="true"><BellIcon /></span>
            {/* Short option text ("Day of") everywhere, so the time always fits beside it. */}
            <ReminderSelect id={id} compact={compact} shortLabels dueDate={dueDate} days={days} onChange={onDaysChange} />
            {showTime && (
                <input
                    type="time"
                    aria-label="Reminder time"
                    value={time}
                    required
                    onChange={(e) => onTimeChange(e.target.value || DEFAULT_REMINDER_TIME)}
                />
            )}
        </div>
    );
}

// Full picker for the edit form: the reminder field, with a note saying when the
// email goes out (or why it can't).
export function ReminderPicker({ dueDate, days, time, onChange, sentAt, checkPast }) {
    const moment = reminderMoment(dueDate, days, time);
    const isPast = checkPast && moment !== null && moment <= new Date();

    let note = null;
    if (!dueDate) {
        note = 'Add a due date to set a reminder.';
    } else if (moment && isPast) {
        note = <span className="reminder-note--error">That time has already passed. Pick a later one.</span>;
    } else if (moment && sentAt && !checkPast) {
        note = 'Reminder sent.';
    } else if (moment) {
        note = `We'll email you at ${formatReminderTime(moment)} on ${moment.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}.`;
    }

    return (
        <div className="reminder-picker">
            <ReminderField
                id="reminder-days"
                dueDate={dueDate}
                days={days}
                time={time}
                onDaysChange={(nextDays) => onChange({
                    days: nextDays,
                    time: nextDays === null ? time : nextAvailableTime(dueDate, nextDays, time),
                })}
                onTimeChange={(nextTime) => onChange({ days, time: nextTime })}
            />
            {note && <p className="reminder-note" aria-live="polite">{note}</p>}
        </div>
    );
}

// Small bell + time shown in a task's meta row.
export function ReminderBadge({ todo }) {
    if (todo.completed || !todo.remind_at || todo.reminder_days_before === null) return null;

    const at = new Date(todo.remind_at);
    const sent = Boolean(todo.reminder_sent_at);
    const day = at.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const label = sent ? 'Reminder sent' : `${day}, ${formatReminderTime(at)}`;

    return (
        <span
            className={`task-reminder${sent ? ' task-reminder--sent' : ''}`}
            title={sent ? `Reminder emailed ${day}` : `Email reminder ${day} at ${formatReminderTime(at)}`}
        >
            <BellIcon />
            <span className="visually-hidden">{sent ? '' : 'Reminder: '}</span>
            {label}
        </span>
    );
}
