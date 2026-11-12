// A task the assistant proposed, shown under its reply. The fields are editable and
// nothing is saved until the user presses Add (which goes through POST /todos).
import { useState } from 'react';
import { PrioritySelect } from '../tasks/PrioritySelect';
import { ReminderSelect } from '../tasks/reminders';
import { DEFAULT_REMINDER_TIME, reminderMoment } from '../tasks/reminderUtils';

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
        // Drop a reminder the new date makes impossible (or that has no date).
        const moment = reminderMoment(next, fields.reminder_days_before, fields.reminder_time);
        const dropReminder = !next || (moment && moment <= new Date());
        update({ due_date: next, ...(dropReminder && { reminder_days_before: null }) });
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
                <ReminderSelect
                    compact
                    dueDate={fields.due_date}
                    days={fields.reminder_days_before}
                    time={fields.reminder_time}
                    onChange={(days) => update({ reminder_days_before: days })}
                />
                {fields.due_date && fields.reminder_days_before !== null && (
                    <input
                        type="time"
                        aria-label="Reminder time"
                        value={fields.reminder_time}
                        required
                        onChange={(e) => update({ reminder_time: e.target.value || DEFAULT_REMINDER_TIME })}
                    />
                )}
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
