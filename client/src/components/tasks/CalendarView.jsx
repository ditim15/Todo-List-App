import { useEffect, useMemo, useRef } from 'react';
import {
    addDays,
    addMonths,
    formatLongDate,
    formatMonthTitle,
    isSameMonth,
    monthGrid,
    monthOf,
    parseISODate,
    toISODate,
    weekdayLabels,
} from './calendarUtils';
import './CalendarView.css';

// Tasks shown inside a day cell before it collapses to "+N more".
const MAX_CELL_TASKS = 3;

function taskCountLabel(count) {
    if (count === 0) return 'no tasks';
    return `${count} ${count === 1 ? 'task' : 'tasks'}`;
}

// Month grid of tasks by due date, with the selected day's tasks listed underneath.
//
// `month` is 'YYYY-MM-01'; `selectedDay` a 'YYYY-MM-DD' inside the grid. `todos` are the
// tasks due in the visible range. `renderTask` draws a full task row (same as the list
// view) for the selected day, so checking off and editing work the same way.
// Keyboard: arrows move by day/week, Home/End to the week's ends, PageUp/PageDown by month.
function CalendarView({ month, selectedDay, today, todos, firstDayOfWeek, onMonthChange, onSelectDay, renderTask, children }) {
    const weeks = useMemo(() => monthGrid(month, firstDayOfWeek), [month, firstDayOfWeek]);
    const weekdays = useMemo(() => weekdayLabels(firstDayOfWeek), [firstDayOfWeek]);
    const weekdaysLong = useMemo(() => weekdayLabels(firstDayOfWeek, 'long'), [firstDayOfWeek]);

    // Tasks grouped by due date, open ones first, then by priority.
    const tasksByDay = useMemo(() => {
        const rank = { high: 0, medium: 1, low: 2 };
        const map = new Map();
        for (const todo of todos) {
            if (!todo.due_date) continue;
            if (!map.has(todo.due_date)) map.set(todo.due_date, []);
            map.get(todo.due_date).push(todo);
        }
        for (const list of map.values()) {
            list.sort((a, b) => a.completed - b.completed || rank[a.priority] - rank[b.priority]);
        }
        return map;
    }, [todos]);

    // Move focus along with the selection when it changes from the keyboard.
    const cellRefs = useRef(new Map());
    const focusSelected = useRef(false);
    useEffect(() => {
        if (!focusSelected.current) return;
        focusSelected.current = false;
        cellRefs.current.get(selectedDay)?.focus();
    }, [selectedDay, month]);

    function select(day, { focus = false } = {}) {
        focusSelected.current = focus;
        if (!isSameMonth(day, month)) onMonthChange(monthOf(day));
        onSelectDay(day);
    }

    function changeMonth(delta) {
        const next = addMonths(month, delta);
        onMonthChange(next);
        onSelectDay(isSameMonth(today, next) ? today : next);
    }

    function goToToday() {
        onMonthChange(monthOf(today));
        onSelectDay(today);
    }

    function handleKeyDown(e, day) {
        const weekday = (parseISODate(day).getDay() - firstDayOfWeek + 7) % 7;
        const moves = {
            ArrowLeft: () => addDays(day, -1),
            ArrowRight: () => addDays(day, 1),
            ArrowUp: () => addDays(day, -7),
            ArrowDown: () => addDays(day, 7),
            Home: () => addDays(day, -weekday),
            End: () => addDays(day, 6 - weekday),
            PageUp: () => shiftMonthKeepDay(day, -1),
            PageDown: () => shiftMonthKeepDay(day, 1),
        };
        const move = moves[e.key];
        if (!move) return;
        e.preventDefault();
        select(move(), { focus: true });
    }

    const selectedTasks = tasksByDay.get(selectedDay) ?? [];
    const openCount = selectedTasks.filter((t) => !t.completed).length;

    return (
        <div className="calendar">
            <div className="calendar-toolbar">
                <h3 className="calendar-title" aria-live="polite">{formatMonthTitle(month)}</h3>
                <div className="calendar-nav">
                    <button
                        type="button"
                        className="calendar-today"
                        onClick={goToToday}
                        disabled={isSameMonth(today, month) && selectedDay === today}
                    >
                        Today
                    </button>
                    <button type="button" className="calendar-arrow" onClick={() => changeMonth(-1)} aria-label="Previous month">
                        <Chevron direction="left" />
                    </button>
                    <button type="button" className="calendar-arrow" onClick={() => changeMonth(1)} aria-label="Next month">
                        <Chevron direction="right" />
                    </button>
                </div>
            </div>

            <div className="calendar-grid" role="grid" aria-label={`Tasks in ${formatMonthTitle(month)}`}>
                <div className="calendar-row calendar-weekdays" role="row">
                    {weekdays.map((label, i) => (
                        <span key={label} className="calendar-weekday" role="columnheader">
                            <abbr title={weekdaysLong[i]}>{label}</abbr>
                        </span>
                    ))}
                </div>

                {weeks.map((week) => (
                    <div key={week[0]} className="calendar-row" role="row">
                        {week.map((day) => {
                            const tasks = tasksByDay.get(day) ?? [];
                            const open = tasks.filter((t) => !t.completed);
                            const overdue = day < today && open.length > 0;
                            const classes = ['calendar-day'];
                            if (!isSameMonth(day, month)) classes.push('calendar-day--outside');
                            if (day === today) classes.push('calendar-day--today');
                            if (day === selectedDay) classes.push('calendar-day--selected');
                            if (overdue) classes.push('calendar-day--overdue');

                            return (
                                <div key={day} role="gridcell" aria-selected={day === selectedDay} className="calendar-cell">
                                    <button
                                        ref={(el) => {
                                            if (el) cellRefs.current.set(day, el);
                                            else cellRefs.current.delete(day);
                                        }}
                                        type="button"
                                        className={classes.join(' ')}
                                        tabIndex={day === selectedDay ? 0 : -1}
                                        onClick={() => select(day)}
                                        onKeyDown={(e) => handleKeyDown(e, day)}
                                        aria-label={`${formatLongDate(day)}${day === today ? ' (today)' : ''}, ${taskCountLabel(tasks.length)}${overdue ? `, ${open.length} overdue` : ''}`}
                                    >
                                        <span className="calendar-date" aria-hidden="true">
                                            {parseISODate(day).getDate()}
                                        </span>
                                        <DayTasks tasks={tasks} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>

            <section className="calendar-agenda" aria-labelledby="calendar-agenda-heading">
                <div className="calendar-agenda-header">
                    <h3 id="calendar-agenda-heading">
                        {selectedDay === today ? 'Today' : formatLongDate(selectedDay)}
                        {selectedDay === today && (
                            <span className="calendar-agenda-date"> · {formatLongDate(selectedDay)}</span>
                        )}
                    </h3>
                    <span className="panel-meta">
                        {selectedTasks.length === 0
                            ? 'Nothing due'
                            : openCount === selectedTasks.length
                                ? taskCountLabel(openCount)
                                : `${openCount} open · ${selectedTasks.length - openCount} done`}
                    </span>
                </div>
                {children}
                {selectedTasks.length > 0 ? (
                    <ul className="task-list">{selectedTasks.map(renderTask)}</ul>
                ) : (
                    <p className="calendar-agenda-empty">
                        No tasks due{selectedDay === today ? ' today' : ' this day'}. Add one above.
                    </p>
                )}
            </section>
        </div>
    );
}

// Same day of the month, `delta` months away (clamped, so Jan 31 → Feb 28).
function shiftMonthKeepDay(day, delta) {
    const date = parseISODate(day);
    const target = new Date(date.getFullYear(), date.getMonth() + delta, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(date.getDate(), lastDay));
    return toISODate(target);
}

// A day's tasks inside its cell: short titled pills on wide calendars, dots on narrow ones.
function DayTasks({ tasks }) {
    if (tasks.length === 0) return null;
    const shown = tasks.slice(0, MAX_CELL_TASKS);
    const hidden = tasks.length - shown.length;

    return (
        <span className="calendar-tasks" aria-hidden="true">
            {shown.map((todo) => (
                <span
                    key={todo.todo_id}
                    className={`calendar-task calendar-task--${todo.priority}${todo.completed ? ' calendar-task--done' : ''}`}
                >
                    <span className="calendar-task-title">{todo.title}</span>
                </span>
            ))}
            {hidden > 0 && <span className="calendar-more">+{hidden} more</span>}
        </span>
    );
}

function Chevron({ direction }) {
    return (
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path
                d={direction === 'left' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export default CalendarView;
