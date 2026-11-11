// Date helpers for the calendar view. Dates are 'YYYY-MM-DD' strings in the user's
// local time (the same format as todo.due_date), built and parsed by hand because
// `new Date('YYYY-MM-DD')` parses as UTC and can land on the wrong day.

export function toISODate(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

export function parseISODate(iso) {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day);
}

export function addDays(iso, days) {
    const date = parseISODate(iso);
    date.setDate(date.getDate() + days);
    return toISODate(date);
}

// The first of the month containing `iso`, as 'YYYY-MM-01'.
export function monthOf(iso) {
    return `${iso.slice(0, 7)}-01`;
}

// The first of the month `delta` months away from `month` ('YYYY-MM-01').
export function addMonths(month, delta) {
    const date = parseISODate(month);
    date.setMonth(date.getMonth() + delta, 1);
    return toISODate(date);
}

export function isSameMonth(iso, month) {
    return iso.slice(0, 7) === month.slice(0, 7);
}

// First day of the week for the user's locale: 0 = Sunday ... 6 = Saturday.
// Intl.Locale weekInfo isn't in every browser yet, so fall back to Sunday.
export function localeFirstDayOfWeek() {
    try {
        const locale = new Intl.Locale(navigator.language);
        const info = locale.getWeekInfo?.() ?? locale.weekInfo;
        if (info?.firstDay) return info.firstDay % 7; // weekInfo uses 7 for Sunday
    } catch {
        // Unknown locale or no support: use the default below.
    }
    return 0;
}

// Every date shown for `month`: whole weeks from the one containing the 1st to the one
// containing the last day (4 to 6 weeks). Returns an array of weeks of ISO dates.
export function monthGrid(month, firstDayOfWeek = 0) {
    const first = parseISODate(month);
    const lead = (first.getDay() - firstDayOfWeek + 7) % 7;
    const start = addDays(month, -lead);

    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const trail = (firstDayOfWeek + 6 - last.getDay() + 7) % 7;
    const end = addDays(toISODate(last), trail);

    const weeks = [];
    let day = start;
    while (day <= end) {
        const week = [];
        for (let i = 0; i < 7; i += 1) {
            week.push(day);
            day = addDays(day, 1);
        }
        weeks.push(week);
    }
    return weeks;
}

// Short weekday names in display order, e.g. ['Sun', 'Mon', ...].
export function weekdayLabels(firstDayOfWeek = 0, format = 'short') {
    // 2023-01-01 was a Sunday.
    return Array.from({ length: 7 }, (_, i) =>
        new Date(2023, 0, 1 + ((firstDayOfWeek + i) % 7)).toLocaleDateString(undefined, { weekday: format })
    );
}

export function formatMonthTitle(month) {
    return parseISODate(month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function formatLongDate(iso) {
    return parseISODate(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
