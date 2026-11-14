// Static, non-interactive previews of the real app's UI for the landing page. They use
// the same theme tokens as the dashboard so they look right in light and dark mode.
// All content is sample coursework, marked aria-hidden: the surrounding copy describes it.

function Dot({ priority }) {
    return <span className={`mock-dot mock-dot--${priority}`} />;
}

function MockWindow({ title, children }) {
    return (
        <div className="mock-window" aria-hidden="true">
            <div className="mock-window-bar">
                <span />
                <span />
                <span />
                <strong>{title}</strong>
            </div>
            <div className="mock-window-body">{children}</div>
        </div>
    );
}

function MockTask({ title, list, priority, due, overdue = false, done = false }) {
    return (
        <div className={`mock-task${done ? ' mock-task--done' : ''}`}>
            <span className={`mock-check${done ? ' mock-check--on' : ''}`} />
            <div className="mock-task-body">
                <span className="mock-task-title">{title}</span>
                <span className="mock-task-meta">
                    <span className="mock-chip">{list}</span>
                    <span className="mock-priority">
                        <Dot priority={priority} />
                        {priority[0].toUpperCase() + priority.slice(1)}
                    </span>
                    {due && <span className={overdue ? 'mock-overdue' : undefined}>{due}</span>}
                </span>
            </div>
        </div>
    );
}

function MockProgress({ value, max }) {
    return (
        <span className="mock-progress">
            <span style={{ width: `${Math.round((value / max) * 100)}%` }} />
        </span>
    );
}

// The landing page's one visual device: a slightly uneven, hand-drawn line that
// crosses finished work out. It draws itself in on mount (static with reduced motion).
export function Strike({ className = '', style }) {
    return (
        <svg className={`strike ${className}`.trim()} style={style} viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
            <path d="M1 7.5C18 5 34 8.5 52 6.2S84 4.8 99 6.5" pathLength="1" />
        </svg>
    );
}

const PLANNER = [
    { day: 'Mon', title: 'Problem set 6', list: 'Calculus II', priority: 'medium', done: true },
    { day: 'Tue', title: 'Read chapters 7–8', list: 'History 210', priority: 'low', done: true },
    { day: 'Wed', title: 'Lab report: cellular respiration', list: 'Biology 101', priority: 'high', done: true },
    { day: 'Thu', title: 'History essay: first draft', list: 'History 210', priority: 'high', done: false, next: true },
    { day: 'Fri', title: 'Group project slides', list: 'Marketing 120', priority: 'medium', done: false },
];

// Hero preview: one planner page for the week, with finished tasks struck through in
// sequence and the next task to work on marked.
export function PlannerMock() {
    let strikeIndex = 0;
    return (
        <div className="planner" aria-hidden="true">
            <div className="planner-head">
                <span className="planner-title">Week 9</span>
                <span className="planner-progress">3 of 5 done</span>
            </div>
            <ul className="planner-rows">
                {PLANNER.map((row) => {
                    const delay = row.done ? strikeIndex++ : 0;
                    return (
                        <li key={row.title} className={`planner-row${row.done ? ' is-done' : ''}${row.next ? ' is-next' : ''}`}>
                            <span className="planner-day">{row.day}</span>
                            <span className={`mock-check${row.done ? ' mock-check--on' : ''}`} />
                            <span className="planner-task">
                                <span className="planner-task-title">
                                    {row.title}
                                    {row.done && <Strike style={{ '--strike-step': delay }} />}
                                </span>
                                <span className="mock-task-meta">
                                    <span className="mock-chip">{row.list}</span>
                                    <span className="mock-priority">
                                        <Dot priority={row.priority} />
                                        {row.priority[0].toUpperCase() + row.priority.slice(1)}
                                    </span>
                                </span>
                            </span>
                            {row.next && <span className="planner-next">Up next</span>}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

const SAMPLE_LISTS = [
    { name: 'Biology 101', done: 5, total: 8 },
    { name: 'Calculus II', done: 3, total: 6 },
    { name: 'History 210', done: 7, total: 7 },
    { name: 'Club & part-time job', done: 1, total: 4 },
];

export function ListsMock() {
    return (
        <MockWindow title="My lists">
            <div className="mock-lists">
                {SAMPLE_LISTS.map((list, i) => (
                    <div key={list.name} className={`mock-list${i === 0 ? ' mock-list--active' : ''}`}>
                        <span className="mock-list-top">
                            <span>{list.name}</span>
                            <span>{list.done}/{list.total}</span>
                        </span>
                        <MockProgress value={list.done} max={list.total} />
                    </div>
                ))}
            </div>
        </MockWindow>
    );
}

export function PriorityMock() {
    return (
        <MockWindow title="Priority">
            <div className="mock-priority-bar">
                <span className="mock-seg mock-seg--high" style={{ flexGrow: 3 }} />
                <span className="mock-seg mock-seg--medium" style={{ flexGrow: 5 }} />
                <span className="mock-seg mock-seg--low" style={{ flexGrow: 2 }} />
            </div>
            <div className="mock-legend">
                <span><Dot priority="high" />High<strong>3</strong></span>
                <span><Dot priority="medium" />Medium<strong>5</strong></span>
                <span><Dot priority="low" />Low<strong>2</strong></span>
            </div>
            <div className="mock-subhead">Coming up</div>
            <div className="mock-upcoming">
                <span><Dot priority="high" />Midterm study guide<em>Due Wed</em></span>
                <span><Dot priority="medium" />Group project slides<em>Due Thu</em></span>
                <span><Dot priority="low" />Return library books<em>Due Sat</em></span>
            </div>
        </MockWindow>
    );
}

export function FiltersMock() {
    return (
        <MockWindow title="All tasks">
            <div className="mock-filters">
                <span className="mock-search">essay</span>
                <span className="mock-filter-chip mock-filter-chip--on"><Dot priority="high" />High</span>
                <span className="mock-filter-chip"><Dot priority="medium" />Medium</span>
                <span className="mock-filter-chip">This week</span>
            </div>
            <div className="mock-result-count">2 matching</div>
            <MockTask title="History essay: first draft" list="History 210" priority="high" due="Due Thu" />
            <MockTask title="Essay outline" list="History 210" priority="high" due="Done" done />
        </MockWindow>
    );
}
