// Renders an assistant reply. The model is asked for plain text with "- " bullets,
// "1. " steps and **bold**, so that's all this handles. It builds React elements
// (never HTML strings), so nothing in a reply can inject markup.

const BULLET = /^\s*[-*•]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;

// "**bold** text" -> ['', <strong>bold</strong>, ' text']
function renderInline(text, keyPrefix) {
    return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4
            ? <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
            : part
    );
}

// Groups lines into paragraphs and lists.
function toBlocks(text) {
    const blocks = [];
    for (const line of text.split('\n')) {
        const kind = BULLET.test(line) ? 'ul' : NUMBERED.test(line) ? 'ol' : line.trim() ? 'p' : null;
        const last = blocks[blocks.length - 1];
        if (kind === null) {
            blocks.push({ kind: 'break' });
        } else if (kind !== 'p' && last?.kind === kind) {
            last.lines.push(line.replace(kind === 'ul' ? BULLET : NUMBERED, ''));
        } else if (kind === 'p' && last?.kind === 'p') {
            last.lines.push(line);
        } else {
            blocks.push({ kind, lines: [kind === 'p' ? line : line.replace(kind === 'ul' ? BULLET : NUMBERED, '')] });
        }
    }
    return blocks.filter((block) => block.kind !== 'break');
}

export default function MessageText({ text }) {
    return toBlocks(text).map((block, i) => {
        if (block.kind === 'p') {
            return <p key={i}>{renderInline(block.lines.join(' '), i)}</p>;
        }
        const List = block.kind;
        return (
            <List key={i}>
                {block.lines.map((line, j) => <li key={j}>{renderInline(line, `${i}-${j}`)}</li>)}
            </List>
        );
    });
}
