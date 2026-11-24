// Helpers for repeating tasks (see repeat.jsx): the options, sensible end dates, and
// how many copies are still to come.

// Keep the keys in sync with RECURRENCES in utils/validation.js.
export const REPEAT_OPTIONS = [
    { key: 'daily', label: 'Daily', phrase: 'every day' },
    { key: 'weekdays', label: 'Weekdays', phrase: 'every weekday' },
    { key: 'weekly', label: 'Weekly', phrase: 'every week' },
    { key: 'biweekly', label: 'Every 2 weeks', phrase: 'every 2 weeks' },
    { key: 'monthly', label: 'Monthly', phrase: 'every month' },
];

// Matches RECURRENCE_MAX_DAYS on the server.
const MAX_DAYS = 366;

// How long a newly picked repeat runs by default: about a month for daily work, a
// term's worth of weeks for weekly work, half a year for monthly.
const DEFAULT_SPAN_DAYS = { daily: 28, weekdays: 28, weekly: 84, biweekly: 84, monthly: 182 };

function addDays(date, days) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

export function maxRepeatUntil(dueDate) {
    return dueDate ? addDays(dueDate, MAX_DAYS) : '';
}

export function defaultRepeatUntil(dueDate, rule) {
    return addDays(dueDate, DEFAULT_SPAN_DAYS[rule] ?? 84);
}

// Keeps an end date valid for a (new) due date: on or after it, and within a year.
export function fitRepeatUntil(dueDate, rule, until) {
    if (!dueDate || !rule) return until;
    if (!until || until < dueDate) return defaultRepeatUntil(dueDate, rule);
    const max = maxRepeatUntil(dueDate);
    return until > max ? max : until;
}

// Same rule as nextOccurrence in utils/validation.js: monthly keeps the day of the
// month, falling back to the month's last day.
function nextOccurrence(dueDate, rule) {
    const d = new Date(`${dueDate}T00:00:00Z`);
    if (rule === 'daily') d.setUTCDate(d.getUTCDate() + 1);
    else if (rule === 'weekdays') {
        do d.setUTCDate(d.getUTCDate() + 1); while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    } else if (rule === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
    else if (rule === 'biweekly') d.setUTCDate(d.getUTCDate() + 14);
    else if (rule === 'monthly') {
        const day = d.getUTCDate();
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() + 1);
        const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
        d.setUTCDate(Math.min(day, lastDay));
    }
    return d.toISOString().slice(0, 10);
}

// How many copies come after this one, and the last one's due date.
export function remainingOccurrences(dueDate, rule, until) {
    let count = 0;
    let last = dueDate;
    let next = nextOccurrence(dueDate, rule);
    while (next <= until && count < 400) {
        count += 1;
        last = next;
        next = nextOccurrence(next, rule);
    }
    return { count, last };
}

export function formatDay(date, withWeekday = false) {
    return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        ...(withWeekday ? { weekday: 'short' } : {}),
        month: 'short',
        day: 'numeric',
    });
}


// Calendar previews: the later dates of each open repeating task that fall inside
// [from, to], up to the series' end date. They are drawings, not tasks: each one points
// back at the open copy (`source`), which is the only one that can be ticked off.
export function repeatPreviews(todos, from, to) {
    const previews = [];
    for (const todo of todos) {
        if (todo.completed || !todo.recurrence || !todo.due_date || !todo.recurrence_until) continue;
        const end = todo.recurrence_until < to ? todo.recurrence_until : to;
        let date = nextOccurrence(todo.due_date, todo.recurrence);
        for (let guard = 0; date <= end && guard < 400; guard += 1) {
            if (date >= from) {
                previews.push({
                    key: `${todo.todo_id}:${date}`,
                    due_date: date,
                    title: todo.title,
                    priority: todo.priority,
                    category: todo.category,
                    recurrence: todo.recurrence,
                    source: todo,
                });
            }
            date = nextOccurrence(date, todo.recurrence);
        }
    }
    return previews;
}
