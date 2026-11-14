// Applying the notes assistant's proposed edits to an open editor. They go through
// editor transactions, so Ctrl+Z undoes them and the normal autosave saves them.

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Escapes, then turns **bold** into <strong>.
function inline(text) {
    return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

const LINE_KINDS = [
    { kind: 'heading', re: /^(#{1,3})\s+(.*)$/ },
    { kind: 'task', re: /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/ },
    { kind: 'bullet', re: /^\s*[-*•]\s+(.*)$/ },
    { kind: 'ordered', re: /^\s*\d+[.)]\s+(.*)$/ },
];

// The small markdown subset the assistant is told to use (headings, bullets, numbered
// steps, checklists, **bold**) as HTML the editor's schema understands. Everything is
// escaped first, so nothing in the text becomes markup it didn't ask for.
export function markdownToHtml(text) {
    const html = [];
    let list = null; // { kind, items }
    const closeList = () => {
        if (!list) return;
        if (list.kind === 'task') {
            html.push(`<ul data-type="taskList">${list.items.map(({ checked, body }) => `<li data-type="taskItem" data-checked="${checked}"><p>${body}</p></li>`).join('')}</ul>`);
        } else {
            const tag = list.kind === 'ordered' ? 'ol' : 'ul';
            html.push(`<${tag}>${list.items.map(({ body }) => `<li><p>${body}</p></li>`).join('')}</${tag}>`);
        }
        list = null;
    };

    for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) {
            closeList();
            continue;
        }
        const match = LINE_KINDS.map((k) => ({ ...k, m: line.match(k.re) })).find((k) => k.m);
        if (match?.kind === 'heading') {
            closeList();
            html.push(`<h${match.m[1].length}>${inline(match.m[2])}</h${match.m[1].length}>`);
        } else if (match) {
            const item = match.kind === 'task'
                ? { checked: match.m[1].toLowerCase() === 'x', body: inline(match.m[2]) }
                : { body: inline(match.m[1]) };
            if (list?.kind !== match.kind) {
                closeList();
                list = { kind: match.kind, items: [] };
            }
            list.items.push(item);
        } else {
            closeList();
            html.push(`<p>${inline(line.trim())}</p>`);
        }
    }
    closeList();
    return html.join('');
}

// Where `find` is in the document, as { from, to }, or null. Matches within one
// paragraph/heading/list item, ignoring differences in whitespace (the server compares
// against the note's plain text, which collapses it).
export function findTextRange(doc, find) {
    const target = find.replace(/\s+/g, ' ').trim();
    if (!target) return null;
    let found = null;
    doc.descendants((node, pos) => {
        if (found) return false;
        if (!node.isTextblock) return true;
        // The block's text with whitespace collapsed, and the doc position of each char.
        let text = '';
        const positions = [];
        node.forEach((child, offset) => {
            const start = pos + 1 + offset;
            const chars = child.isText ? child.text : ' ';
            for (let i = 0; i < chars.length; i++) {
                const isSpace = /\s/.test(chars[i]);
                if (isSpace && (text === '' || text.endsWith(' '))) continue;
                text += isSpace ? ' ' : chars[i];
                positions.push(start + (child.isText ? i : 0));
            }
        });
        const index = text.indexOf(target);
        if (index !== -1) found = { from: positions[index], to: positions[index + target.length - 1] + 1 };
        return false;
    });
    return found;
}

// Applies one edit. Returns { ok: true } or { error }.
export function applyNoteEdit(editor, edit) {
    if (!editor || editor.isDestroyed) return { error: 'Open the note to apply this.' };
    if (edit.action === 'append') {
        editor.chain().insertContentAt(editor.state.doc.content.size, markdownToHtml(edit.text)).focus('end').run();
        return { ok: true };
    }
    const range = findTextRange(editor.state.doc, edit.find);
    if (!range) return { error: "That text isn't in the note any more, so this can't be applied." };
    // insertText keeps the formatting of the text it replaces.
    editor.chain()
        .command(({ tr }) => {
            tr.insertText(edit.text, range.from, range.to);
            return true;
        })
        .setTextSelection({ from: range.from, to: range.from + edit.text.length })
        .scrollIntoView()
        .focus()
        .run();
    return { ok: true };
}
