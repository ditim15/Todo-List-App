// Task priorities, in display order, and the dropdown used by the task forms and the
// assistant's task cards.
export const PRIORITIES = [
    { key: 'high', label: 'High' },
    { key: 'medium', label: 'Medium' },
    { key: 'low', label: 'Low' },
];

export function PrioritySelect({ value, onChange }) {
    return (
        <select aria-label="Priority" value={value} onChange={(e) => onChange(e.target.value)}>
            {PRIORITIES.map((p) => (
                <option key={p.key} value={p.key}>
                    {p.label}
                </option>
            ))}
        </select>
    );
}
