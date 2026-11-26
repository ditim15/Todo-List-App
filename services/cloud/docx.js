// Turns a note (the editor's Tiptap JSON) into a Word document for cloud backup, with
// its images embedded, so one note is one file that opens in Word, Google Docs and
// Drive's preview. Covers what the editor can produce (components/notes/
// editorExtensions.js): headings, paragraphs, lists, checklists, quotes, code, rules,
// links, bold/italic/strike/code/underline, images and PDF chips. Anything unknown
// falls back to its plain text.
//
// Word can only embed PNG, JPEG, GIF and BMP. Other attachments (PDFs, WebP images) are
// saved next to the note by the sync, and the document names that file in their place.
import { drawingToPng, strokesBottom } from './inkImage.js';
import {
    AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel, ImageRun, LevelFormat,
    Packer, Paragraph, ShadingType, TextRun,
} from 'docx';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Usable width of a Letter/A4 page with Word's default margins, in pixels (96 per inch).
const MAX_IMAGE_WIDTH = 600;
const INDENT = 360; // twentieths of a point: a quarter inch
const MONO = 'Consolas';

const EMBEDDABLE = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };

export const canEmbed = (mimeType) => Boolean(EMBEDDABLE[mimeType]);

// Pixel size from the file header (PNG, GIF, JPEG), or null if it can't be read.
export function imageSize(data, mimeType) {
    try {
        if (mimeType === 'image/png' && data.length >= 24) {
            return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
        }
        if (mimeType === 'image/gif' && data.length >= 10) {
            return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
        }
        if (mimeType === 'image/jpeg') {
            let i = 2;
            while (i + 9 < data.length) {
                if (data[i] !== 0xff) { i += 1; continue; }
                const marker = data[i + 1];
                // Start-of-frame markers (not DHT C4, JPG C8, DAC CC) carry the size.
                if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
                    return { width: data.readUInt16BE(i + 7), height: data.readUInt16BE(i + 5) };
                }
                if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
                i += 2 + data.readUInt16BE(i + 2);
            }
        }
    } catch {
        // fall through
    }
    return null;
}

function fitted(size) {
    const width = Math.max(1, size?.width || MAX_IMAGE_WIDTH);
    const height = Math.max(1, size?.height || Math.round(width * 0.75));
    const scale = Math.min(1, MAX_IMAGE_WIDTH / width);
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// Only links a reader can safely follow.
const safeHref = (href) => (typeof href === 'string' && /^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : null);

function textRuns(node) {
    const marks = node.marks ?? [];
    const has = (type) => marks.some((m) => m.type === type);
    const link = safeHref(marks.find((m) => m.type === 'link')?.attrs?.href);
    const run = new TextRun({
        text: node.text ?? '',
        bold: has('bold') || undefined,
        italics: has('italic') || undefined,
        strike: has('strike') || undefined,
        underline: has('underline') ? {} : undefined,
        font: has('code') ? MONO : undefined,
        style: link ? 'Hyperlink' : undefined,
    });
    return link ? new ExternalHyperlink({ link, children: [run] }) : run;
}

function inline(nodes = []) {
    const out = [];
    for (const n of nodes) {
        if (n.type === 'text') out.push(textRuns(n));
        else if (n.type === 'hardBreak') out.push(new TextRun({ break: 1 }));
        else if (n.content) out.push(...inline(n.content));
    }
    return out;
}

const plainText = (nodes = []) => nodes.map((n) => (n.type === 'text' ? n.text ?? '' : plainText(n.content))).join('');

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

// ctx: { indent (twips), quote (bool), list: paragraph options for the first paragraph
// of a list item, used once }, plus the document-wide `files` lookup and list counter.
function blocks(nodes = [], ctx) {
    return nodes.flatMap((node) => block(node, ctx));
}

function para(ctx, options) {
    const list = ctx.list;
    ctx.list = null; // only the item's first paragraph carries the bullet or number
    return new Paragraph({
        ...options,
        ...(list ?? {}),
        // A bulleted or numbered paragraph takes its indent from the list level.
        indent: list || !ctx.indent ? undefined : { left: ctx.indent },
        border: ctx.quote ? { left: { style: BorderStyle.SINGLE, size: 12, color: 'B5B5B5', space: 8 } } : options.border,
    });
}

function block(node, ctx) {
    switch (node.type) {
        case 'paragraph':
            return [para(ctx, { children: inline(node.content) })];
        case 'heading': {
            const level = Math.min(Math.max(node.attrs?.level ?? 1, 1), 6);
            return [para(ctx, { heading: HEADINGS[level - 1], children: inline(node.content) })];
        }
        case 'blockquote':
            return blocks(node.content, { ...ctx, quote: true, indent: ctx.indent + INDENT, list: null });
        case 'codeBlock': {
            const lines = plainText(node.content).split('\n');
            const children = lines.flatMap((line, i) => [
                ...(i > 0 ? [new TextRun({ break: 1 })] : []),
                new TextRun({ text: line, font: MONO, size: 20 }),
            ]);
            return [para(ctx, { children, shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } })];
        }
        case 'horizontalRule':
            return [para(ctx, { children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'B5B5B5', space: 1 } } })];
        case 'bulletList':
        case 'orderedList':
        case 'taskList': {
            const level = ctx.level ?? 0;
            const instance = node.type === 'orderedList' ? ++ctx.counter.lists : null;
            return (node.content ?? []).flatMap((item) => {
                const itemCtx = { ...ctx, list: null, level: level + 1, indent: ctx.indent + INDENT * 2 };
                if (node.type === 'bulletList') {
                    itemCtx.list = { bullet: { level: Math.min(level, 8) } };
                } else if (node.type === 'orderedList') {
                    itemCtx.list = { numbering: { reference: 'ordered', level: Math.min(level, 8), instance } };
                } else {
                    // Checklists: a box character in front, no Word numbering.
                    const [first, ...rest] = item.content ?? [];
                    const box = new TextRun({ text: item.attrs?.checked ? '☑ ' : '☐ ' });
                    const head = first?.type === 'paragraph'
                        ? [para(itemCtx, { children: [box, ...inline(first.content)] })]
                        : [para(itemCtx, { children: [box] }), ...(first ? block(first, itemCtx) : [])];
                    return [...head, ...blocks(rest, itemCtx)];
                }
                return blocks(item.content, itemCtx);
            });
        }
        case 'image': {
            const file = ctx.files(node.attrs?.attachmentId);
            const alt = node.attrs?.alt || file?.name || 'image';
            if (file?.embed) {
                const size = fitted(file.embed.size);
                return [para(ctx, {
                    alignment: AlignmentType.LEFT,
                    children: [new ImageRun({
                        type: EMBEDDABLE[file.embed.mimeType],
                        data: file.embed.data,
                        transformation: size,
                        altText: { name: alt.slice(0, 100), description: alt, title: alt.slice(0, 100) },
                    })],
                })];
            }
            return [placeholder(ctx, '🖼', alt, file)];
        }
        case 'fileAttachment': {
            const file = ctx.files(node.attrs?.attachmentId);
            return [placeholder(ctx, '📎', node.attrs?.filename || file?.name || 'file', file)];
        }
        case 'drawing': {
            // A drawing space, drawn out as a picture (inkImage.js).
            const strokes = Array.isArray(node.attrs?.strokes) ? node.attrs.strokes : [];
            if (strokes.length === 0) return [];
            const png = drawingToPng({ strokes, width: 1000, height: node.attrs?.height });
            return [para(ctx, {
                children: [new ImageRun({
                    type: 'png',
                    data: png.data,
                    transformation: fitted(png),
                    altText: { name: 'Drawing', description: 'A drawing from the note', title: 'Drawing' },
                })],
            })];
        }
        default:
            return node.content ? blocks(node.content, ctx) : [para(ctx, { children: [new TextRun(node.text ?? '')] })];
    }
}

// An attachment that isn't embedded: names the file saved next to the note.
function placeholder(ctx, icon, label, file) {
    const children = [new TextRun({ text: `${icon} ${label}` })];
    if (file?.siblingName) {
        children.push(new TextRun({ text: ` (saved in Drive as "${file.siblingName}")`, italics: true, color: '6B6B6B' }));
    } else {
        children.push(new TextRun({ text: ' (missing)', italics: true, color: '6B6B6B' }));
    }
    return para(ctx, { children });
}

const ORDERED_LEVELS = Array.from({ length: 9 }, (_, level) => ({
    level,
    format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
    text: `%${level + 1}.`,
    alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: INDENT * 2 * (level + 1), hanging: INDENT } } },
}));

// A note with handwriting over its text starts with pictures of its pages as written:
// the app snapshots them (text, highlights and ink together, see
// client/src/components/notes/drawing/pageSnapshot.js) and keeps them as attachments
// listed in `ink.pages`. The typed text follows, so it can still be searched and edited.
function handwrittenPages(content, files) {
    const ink = content?.attrs?.ink;
    if (!Array.isArray(ink?.strokes) || ink.strokes.length === 0) return [];
    const note = (text) => new Paragraph({ children: [new TextRun({ text, italics: true, color: '6B6B6B' })] });
    const pages = (Array.isArray(ink.pages) ? ink.pages : []).map((id) => files(id)?.embed).filter(Boolean);
    if (pages.length === 0) {
        // No pictures from the app yet (the note hasn't been open long enough since it was
        // written on): the handwriting is drawn here instead, without the text under it,
        // cut into page-sized pieces. The typed text follows as usual.
        const width = Number(ink.width) > 0 ? Number(ink.width) : 760;
        const pageUnits = Math.round(width * (11 / 8.5));
        const bottom = strokesBottom(ink.strokes);
        const count = Math.max(1, Math.min(20, Math.ceil(bottom / pageUnits)));
        const pieces = [];
        for (let i = 0; i < count; i++) {
            const height = Math.min(pageUnits, Math.max(50, bottom - i * pageUnits + 16));
            const png = drawingToPng({ strokes: ink.strokes, width, height, top: i * pageUnits, pixelWidth: width * 2 });
            pieces.push(new Paragraph({
                children: [new ImageRun({
                    type: 'png',
                    data: png.data,
                    transformation: fitted(png),
                    altText: { name: 'Handwriting', description: 'Handwriting written on the note', title: 'Handwriting' },
                })],
            }));
        }
        return [
            note('✏ Handwriting on this note. Open the note in DoneYet to add a picture of the page with the text and handwriting together.'),
            ...pieces,
            new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Typed text')] }),
        ];
    }
    return [
        note('✏ The note as written, with handwriting. Its typed text follows.'),
        ...pages.map((page, i) => new Paragraph({
            children: [new ImageRun({
                type: EMBEDDABLE[page.mimeType],
                data: page.data,
                transformation: fitted(page.size),
                altText: { name: `Page ${i + 1}`, description: `Page ${i + 1} of the note, with handwriting`, title: `Page ${i + 1}` },
            })],
        })),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Typed text')] }),
    ];
}

// `files(attachmentId)` -> { name, embed?: { data, mimeType, size }, siblingName? } or
// null if the attachment is missing. Resolves to the .docx file as a Buffer.
export async function noteToDocx({ title, content }, files = () => null) {
    const ctx = { indent: 0, quote: false, list: null, level: 0, files, counter: { lists: 0 } };
    const body = blocks(content?.content ?? [], ctx);
    body.unshift(...handwrittenPages(content, files));
    const doc = new Document({
        title: title || 'Untitled',
        creator: 'DoneYet?',
        numbering: { config: [{ reference: 'ordered', levels: ORDERED_LEVELS }] },
        sections: [{ children: [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title || 'Untitled')] }), ...body] }],
    });
    return Packer.toBuffer(doc);
}

// The attachment ids a note uses, in order of first use. Attachments uploaded to the
// note but no longer in it (removed, or undone after pasting) aren't included.
export function referencedAttachmentIds(content) {
    const ids = [];
    const seen = new Set();
    // Snapshots of a handwritten note's pages come first, as they lead the document.
    for (const id of Array.isArray(content?.attrs?.ink?.pages) ? content.attrs.ink.pages : []) {
        if (Number.isInteger(id) && !seen.has(id)) { seen.add(id); ids.push(id); }
    }
    (function visit(node) {
        if (!node || typeof node !== 'object') return;
        if ((node.type === 'image' || node.type === 'fileAttachment') && Number.isInteger(node.attrs?.attachmentId)) {
            const id = node.attrs.attachmentId;
            if (!seen.has(id)) { seen.add(id); ids.push(id); }
        }
        for (const child of node.content ?? []) visit(child);
    })(content);
    return ids;
}
