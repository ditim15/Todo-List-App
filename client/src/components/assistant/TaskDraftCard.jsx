// A task the assistant proposed, shown under its reply. The fields are editable and
// nothing is saved until the user presses Add (which goes through POST /todos).
import { useState } from 'react';
import { PrioritySelect } from '../tasks/PrioritySelect';
import { ReminderField } from '../tasks/reminders';
import { DEFAULT_REMINDER_TIME, isDayPast, nextAvailableTime, reminderMoment } from '../tasks/reminderUtils';

function CheckIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12l5 5L20 7" />
        </svg>
    );
}

// The card's starting fields. A reminder whose time has already passed (e.g. "the day
// before" for something due tomorrow morning) can't be saved, so it starts off.
function initialFields(draft) {
    const time = draft.reminder_time ?? DEFAULT_REMINDER_TIME;
    const moment = reminderMoment(draft.due_date, draft.reminder_days_before, time);
    const reminderPassed = Boolean(moment && moment <= new Date());
    return {
        fields: {
            title: draft.title,
            description: draft.description ?? null,
            category: draft.category ?? '',
            priority: draft.priority ?? 'medium',
            due_date: draft.due_date ?? '',
            reminder_days_before: reminderPassed ? null : draft.reminder_days_before ?? null,
            reminder_time: time,
        },
        reminderPassed,
    };
}

// `onAdd(fields)` saves the task and resolves once it's saved; `onDismiss()` hides the
// card. Both throw on failure so the card can show the error.
export default function TaskDraftCard({ draft, listsDatalistId, onAdd, onDismiss }) {
    const [{ fields: initial, reminderPassed }] = useState(() => initialFields(draft));
    const [fields, setFields] = useState(initial);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    if (draft.status === 'added') {
        return (
            <div className="assistant-card assistant-card--done">
                <CheckIcon />
                <span>Added <strong>{draft.title}</strong></span>
            </div>
        );
    }
    if (draft.status === 'dismissed') {
        return <div className="assistant-card assistant-card--done assistant-card--muted">Dismissed “{draft.title}”</div>;
    }

    const update = (changes) => setFields((current) => ({ ...current, ...changes }));

    function changeDueDate(next) {
        // Drop a reminder whose day the new date puts in the past (or that has no date);
        // if only the time has passed today, move it to the next minute.
        const days = fields.reminder_days_before;
        if (!next || (days !== null && isDayPast(next, days))) {
            update({ due_date: next, reminder_days_before: null });
        } else {
            update({ due_date: next, ...(days !== null && { reminder_time: nextAvailableTime(next, days, fields.reminder_time) }) });
        }
    }

    function changeReminderDays(days) {
        update({
            reminder_days_before: days,
            ...(days !== null && { reminder_time: nextAvailableTime(fields.due_date, days, fields.reminder_time) }),
        });
    }

    async function run(action) {
        setIsSaving(true);
        setError('');
        try {
            await action();
        } catch (err) {
            setError(err.message);
            setIsSaving(false);
        }
    }

    function handleAdd() {
        const hasReminder = Boolean(fields.due_date) && fields.reminder_days_before !== null;
        const moment = hasReminder ? reminderMoment(fields.due_date, fields.reminder_days_before, fields.reminder_time) : null;
        if (moment && moment <= new Date()) {
            setError('That reminder time has already passed. Pick a later one.');
            return;
        }
        return run(() => onAdd({
            title: fields.title.trim(),
            description: fields.description || undefined,
            category: fields.category.trim() || undefined,
            priority: fields.priority,
            due_date: fields.due_date || null,
            reminder_days_before: hasReminder ? fields.reminder_days_before : null,
            reminder_time: hasReminder ? fields.reminder_time : null,
        }));
    }

    return (
        <div className="assistant-card" role="group" aria-label={`Proposed task: ${draft.title}`}>
            <input
                className="assistant-card-title"
                type="text"
                aria-label="Task title"
                value={fields.title}
                maxLength={255}
                onChange={(e) => update({ title: e.target.value })}
            />
            {fields.description && <p className="assistant-card-notes">{fields.description}</p>}
            <div className="assistant-card-fields">
                <input
                    type="date"
                    aria-label="Due date"
                    value={fields.due_date}
                    onChange={(e) => changeDueDate(e.target.value)}
                />
                <PrioritySelect value={fields.priority} onChange={(priority) => update({ priority })} />
                <input
                    type="text"
                    placeholder="List"
                    aria-label="List"
                    list={listsDatalistId}
                    value={fields.category}
                    maxLength={50}
                    onChange={(e) => update({ category: e.target.value })}
                />
                <div className="assistant-card-reminder">
                    <ReminderField
                        compact
                        dueDate={fields.due_date}
                        days={fields.reminder_days_before}
                        time={fields.reminder_time}
                        onDaysChange={changeReminderDays}
                        onTimeChange={(reminder_time) => update({ reminder_time })}
                    />
                </div>
            </div>
            {reminderPassed && fields.reminder_days_before === null && (
                <p className="assistant-card-note">That reminder time has already passed, so it&apos;s off. Pick another.</p>
            )}
            {error && <p className="assistant-card-error" role="alert">{error}</p>}
            <div className="assistant-card-actions">
                <button type="button" className="link-button" onClick={() => run(onDismiss)} disabled={isSaving}>
                    Dismiss
                </button>
                <button type="button" className="assistant-card-add" onClick={handleAdd} disabled={isSaving || !fields.title.trim()}>
                    {isSaving ? 'Adding...' : 'Add task'}
                </button>
            </div>
        </div>
    );
}
