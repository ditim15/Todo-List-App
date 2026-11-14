// Folder background colours (Folder settings). The keys match FOLDER_COLORS in
// controllers/notes.controller.js; the actual colours (light and dark) are CSS tokens in
// pages/static/Notes.css, applied with data-folder-color="<key>".
export const FOLDER_COLORS = [
    { key: 'sage', label: 'Sage' },
    { key: 'sky', label: 'Sky' },
    { key: 'lavender', label: 'Lavender' },
    { key: 'rose', label: 'Rose' },
    { key: 'peach', label: 'Peach' },
    { key: 'butter', label: 'Butter' },
    { key: 'clay', label: 'Clay' },
    { key: 'slate', label: 'Slate' },
];

export function colorLabel(key) {
    return FOLDER_COLORS.find((c) => c.key === key)?.label ?? 'Default';
}
