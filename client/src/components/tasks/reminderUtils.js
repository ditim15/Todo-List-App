// Reminder constants and date math, shared by the reminder UI (reminders.jsx) and the
// dashboard forms. A reminder is "N days before the due date at a local time"
// (server: controllers/todos.controller.js parseReminder).

export const REMINDER_OPTIONS = [
    { days: 0, label: 'On the due date', short: 'Day of' },
    { days: 1, label: '1 day before', short: '1 day before' },
    { days: 2, label: '2 days before', short: '2 days before' },
    { days: 3, label: '3 days before', short: '3 days before' },
    { days: 7, label: '1 week before', short: '1 week before' },
];

export const DEFAULT_REMINDER_TIME = '09:00';

// Local Date for "dueDate minus `days` days at HH:MM". The date string is split by hand
// because new Date('YYYY-MM-DD') parses as UTC.
export function reminderMoment(dueDate, days, time = DEFAULT_REMINDER_TIME) {
    if (!dueDate || days === null || days === undefined) return null;
    const [year, month, day] = dueDate.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    return new Date(year, month - 1, day - days, hours, minutes);
}

function startOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// True when the reminder's day is already behind us, so no time that day could work.
export function isDayPast(dueDate, days) {
    const moment = reminderMoment(dueDate, days, '00:00');
    return moment !== null && moment < startOfToday();
}

// The reminder time to suggest for `days` before `dueDate`: `time` if that moment is
// still ahead, otherwise (the reminder day is today and `time` has passed) the next
// whole minute, so "Day of" on a task due today works straight away. It's only a
// starting point: any later time can be picked. The server checks for due reminders
// every minute, so a reminder arrives within about a minute of its time.
export function nextAvailableTime(dueDate, days, time = DEFAULT_REMINDER_TIME) {
    const moment = reminderMoment(dueDate, days, time);
    if (!moment || moment > new Date() || isDayPast(dueDate, days)) return time;

    const now = new Date();
    const next = new Date(now);
    next.setMinutes(now.getMinutes() + 1, 0, 0);
    if (next.getDate() !== now.getDate()) return '23:59';
    return `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`;
}

export function formatReminderTime(date) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
