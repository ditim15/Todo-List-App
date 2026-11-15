// Turns a note (the editor's Tiptap JSON) into Markdown for cloud backup. Covers what
// the editor can produce (components/notes/editorExtensions.js): headings, paragraphs,
// lists, checklists, quotes, code, rules, links, bold/italic/strike/code/underline,
// images and PDF chips. Anything unknown falls back to its plain text.

// Characters that would otherwise turn into Markdown formatting.
const escapeText = (s) => s.replace(/([\\`*_[\]#<>|])/g, '\\$1');

function renderText(node) {
    const marks = node.marks ?? [];
    if (marks.some((m) => m.type === 'code')) return `\`${node.text.replace(/`/g, 'ˋ')}\``;
    let text = escapeText(node.text);
    for (const mark of marks) {
        if (mark.type === 'bold') text = `**${text}**`;
        else if (mark.type === 'italic') text = `*${text}*`;
        else if (mark.type === 'strike') text = `~~${text}~~`;
        else if (mark.type === 'underline') text = `<u>${text}</u>`;
    }
    const link = marks.find((m) => m.type === 'link');
    if (link?.attrs?.href) text = `[${text}](${link.attrs.href.replace(/\)/g, '%29')})`;
    return text;
}

function renderInline(nodes = []) {
    return nodes.map((n) => (n.type === 'text' ? renderText(n) : n.type === 'hardBreak' ? '  \n' : renderInline(n.content))).join('');
}

const indent = (text, prefix) => text.split('\n').map((line) => (line ? prefix + line : line)).join('\n');

// `files(attachmentId)` -> { name, path } for an attachment, or null if it's missing.
function renderBlock(node, files) {
    switch (node.type) {
        case 'paragraph':
            return renderInline(node.content);
        case 'heading':
            return `${'#'.repeat(Math.min(Math.max(node.attrs?.level ?? 1, 1), 6))} ${renderInline(node.content)}`;
        case 'blockquote':
            return renderBlocks(node.content, files).split('\n').map((line) => `> ${line}`.trimEnd()).join('\n');
        case 'codeBlock': {
            const code = (node.content ?? []).map((n) => n.text ?? '').join('');
            return `\`\`\`${node.attrs?.language ?? ''}\n${code}\n\`\`\``;
        }
        case 'horizontalRule':
            return '---';
        case 'bulletList':
        case 'orderedList':
        case 'taskList':
            return (node.content ?? []).map((item, i) => {
                const marker = node.type === 'orderedList' ? `${(node.attrs?.start ?? 1) + i}. `
                    : node.type === 'taskList' ? `- [${item.attrs?.checked ? 'x' : ' '}] ` : '- ';
                const body = renderBlocks(item.content, files, '\n');
                const [first, ...rest] = body.split('\n');
                return `${marker}${first}${rest.length ? `\n${indent(rest.join('\n'), ' '.repeat(marker.length))}` : ''}`;
            }).join('\n');
        case 'image': {
            const file = files(node.attrs?.attachmentId);
            const alt = escapeText(node.attrs?.alt || file?.name || 'image');
            return file ? `![${alt}](${encodeURI(file.path)})` : `*(image: ${alt})*`;
        }
        case 'fileAttachment': {
            const file = files(node.attrs?.attachmentId);
            const name = escapeText(node.attrs?.filename || file?.name || 'file');
            return file ? `📎 [${name}](${encodeURI(file.path)})` : `*(file: ${name})*`;
        }
        default:
            return node.content ? renderBlocks(node.content, files) : (node.text ?? '');
    }
}

function renderBlocks(nodes = [], files, separator = '\n\n') {
    return nodes.map((n) => renderBlock(n, files)).filter((s) => s !== '').join(separator);
}

export function noteToMarkdown({ title, content }, files = () => null) {
    const body = renderBlocks(content?.content ?? [], files);
    return `# ${escapeText(title)}\n\n${body}${body ? '\n' : ''}`;
}
