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

export function DeadlinesMock() {
    return (
        <MockWindow title="Today">
            <div className="mock-stats">
                <div><span>Due today</span><strong>2</strong></div>
                <div><span>Overdue</span><strong>1</strong></div>
                <div><span>Done</span><strong>68%</strong></div>
            </div>
            <MockTask title="Lab report: cellular respiration" list="Biology 101" priority="high" due="Due today" />
            <MockTask title="Problem set 6" list="Calculus II" priority="medium" due="Overdue · Mon" overdue />
            <MockTask title="Read chapters 7–8" list="History 210" priority="low" due="Due Fri" />
        </MockWindow>
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
