// Task reminder UI: the days-before dropdown, the edit-form picker and the badge shown
// on tasks. Email is the only delivery method for now.
import {
    DEFAULT_REMINDER_TIME,
    REMINDER_OPTIONS,
    formatReminderTime,
    isDayPast,
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
export function ReminderSelect({ dueDate, days, onChange, id, time = null, compact = false }) {
    const isUnavailable = (optionDays) => time
        ? reminderMoment(dueDate, optionDays, time) <= new Date()
        : isDayPast(dueDate, optionDays);

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
            {REMINDER_OPTIONS.map((option) => (
                <option key={option.days} value={option.days} disabled={Boolean(dueDate) && isUnavailable(option.days)}>
                    {compact ? option.short : option.label}
                </option>
            ))}
        </select>
    );
}

// Full picker for the edit form: days-before + time of day, with a note saying when
// the email goes out (or why it can't).
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
            <div className="reminder-picker-inputs">
                <ReminderSelect
                    id="reminder-days"
                    dueDate={dueDate}
                    days={days}
                    onChange={(nextDays) => onChange({ days: nextDays, time })}
                />
                {days !== null && dueDate && (
                    <input
                        type="time"
                        aria-label="Reminder time"
                        value={time}
                        required
                        onChange={(e) => onChange({ days, time: e.target.value || DEFAULT_REMINDER_TIME })}
                    />
                )}
            </div>
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
