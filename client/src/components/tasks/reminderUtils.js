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

export function formatReminderTime(date) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
