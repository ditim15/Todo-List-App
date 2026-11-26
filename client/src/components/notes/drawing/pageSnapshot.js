// Pictures of a handwritten note's pages, for the cloud backup: the note exactly as it's
// laid out on screen (text, checklists, bullets, images, drawings) with the handwriting
// over it, on white like paper, cut into Letter-shaped pages. The backup's Word file
// shows them first (services/cloud/docx.js), the way OneNote or Notability exports show
// a page as written. The server can't lay the text out the way the editor does, so the
// app takes them (NoteInk) and stores them as attachments.
//
// It draws onto a canvas from the page's own layout, word by word, rather than
// screenshotting HTML (which browsers don't allow from a page script). Colours are the
// light theme's, whatever theme is showing.

const INK = '#111411';
const MUTED = '#5b635a';
const LINK = '#1d6a45';
const RULE = '#a2a9a0';
const CODE_BG = '#f1f3ef';
const COLORS = {
    ink: INK, blue: '#2746d0', red: '#c42b1c', green: '#1d6a45', orange: '#b85d00', purple: '#6b3fc4',
    yellow: '#ffdc3d', mint: '#3fe08c', pink: '#ff7ab8', sky: '#63bdfd', peach: '#ff9f52',
};
const HIGHLIGHTER_OPACITY = 0.55;
const MARGIN = 32;
const SCALE = 2;

// Bumped when the pictures' look changes, so existing ones are retaken.
export const SNAPSHOT_VERSION = 2;

export function hashString(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
}

// Everything to draw, in page coordinates (CSS pixels of the unzoomed page).
function collect(page, pageWidth) {
    const pageRect = page.getBoundingClientRect();
    const zoom = pageRect.width / pageWidth || 1;
    const local = (r) => ({
        x: (r.left - pageRect.left) / zoom,
        y: (r.top - pageRect.top) / zoom,
        w: r.width / zoom,
        h: r.height / zoom,
    });
    const root = page.querySelector('.ProseMirror') ?? page;
    const items = { backgrounds: [], sheets: [], sheetPaths: [], under: [], words: [], boxes: [], markers: [], images: [], over: [] };

    // Text, word by word, with each word's own font and decoration.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement;
        // Skipped: drawings, and checklist labels (screen-reader text, not shown).
        if (!el || el.closest('.note-drawing, svg, li[data-checked] > label') || !node.textContent.trim()) continue;
        const style = getComputedStyle(el);
        const checked = el.closest('li[data-checked="true"]');
        const link = el.closest('a[href]') && !el.closest('.note-file');
        const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const strike = Boolean(el.closest('s, del, strike')) || Boolean(checked);
        const underline = Boolean(el.closest('u')) || Boolean(link);
        const color = link ? LINK : checked ? MUTED : INK;
        for (const match of node.textContent.matchAll(/\S+/g)) {
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            const rect = range.getClientRects()[0];
            if (!rect || rect.width === 0) continue;
            items.words.push({ text: match[0], rect: local(rect), font, color, strike, underline });
        }
    }

    for (const box of root.querySelectorAll('input[type="checkbox"]')) {
        items.boxes.push({ rect: local(box.getBoundingClientRect()), checked: box.checked });
    }

    // List markers aren't in the page's DOM, so they're drawn beside each item's first line.
    for (const li of root.querySelectorAll('ul:not([data-type="taskList"]) > li, ol > li')) {
        const first = li.querySelector('p, h1, h2, h3') ?? li;
        const rect = local(first.getBoundingClientRect());
        const lineHeight = parseFloat(getComputedStyle(first).lineHeight) || 24;
        const list = li.parentElement;
        if (list.tagName === 'OL') {
            const start = Number(list.getAttribute('start') ?? 1);
            const index = Array.prototype.indexOf.call(list.children, li);
            items.markers.push({ kind: 'number', text: `${start + index}.`, x: rect.x - 6, y: rect.y, lineHeight, font: getComputedStyle(first).font });
        } else {
            items.markers.push({ kind: 'bullet', x: rect.x - 13, y: rect.y + lineHeight / 2 });
        }
    }

    for (const quote of root.querySelectorAll('blockquote')) items.backgrounds.push({ kind: 'quote', rect: local(quote.getBoundingClientRect()) });
    for (const pre of root.querySelectorAll('pre')) items.backgrounds.push({ kind: 'code', rect: local(pre.getBoundingClientRect()) });
    for (const hr of root.querySelectorAll('hr')) items.backgrounds.push({ kind: 'rule', rect: local(hr.getBoundingClientRect()) });
    for (const chip of root.querySelectorAll('.note-file')) items.backgrounds.push({ kind: 'chip', rect: local(chip.getBoundingClientRect()) });
    for (const img of root.querySelectorAll('img')) items.images.push({ src: img.currentSrc || img.src, rect: local(img.getBoundingClientRect()) });

    // Ink: every stroke path, from the drawing spaces and the handwriting layers.
    function paths(svg, into) {
        const vb = svg.viewBox.baseVal;
        const rect = local(svg.getBoundingClientRect());
        if (!vb || !vb.width) return;
        const k = rect.w / vb.width;
        for (const path of svg.querySelectorAll('path.dw-stroke')) {
            const d = path.getAttribute('d');
            if (!d) continue;
            const color = COLORS[[...path.classList].find((c) => c.startsWith('dw-c-'))?.slice(5)] ?? INK;
            into.push({
                d,
                color,
                filled: path.classList.contains('is-filled'),
                width: Number(path.getAttribute('stroke-width')) || 4,
                highlighter: path.classList.contains('dw-highlighter'),
                transform: [k, rect.x, rect.y],
            });
        }
    }
    for (const sheet of page.querySelectorAll('.note-drawing')) {
        items.sheets.push(local(sheet.getBoundingClientRect()));
        const svg = sheet.querySelector('svg');
        if (svg) paths(svg, items.sheetPaths);
    }
    const under = page.querySelector(':scope > svg.note-ink-under');
    const over = page.querySelector(':scope > svg.note-ink');
    if (under) paths(under, items.under);
    if (over) paths(over, items.over);

    return { items, height: pageRect.height / zoom };
}

function drawPaths(ctx, list) {
    for (const p of list) {
        const [k, x, y] = p.transform;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(k, k);
        const shape = new Path2D(p.d);
        if (p.highlighter) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = HIGHLIGHTER_OPACITY;
        }
        if (p.filled) {
            ctx.fillStyle = p.color;
            ctx.fill(shape);
        } else {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke(shape);
        }
        ctx.restore();
    }
}

function drawPage(ctx, { items }, images) {
    for (const b of items.backgrounds) {
        const { x, y, w, h } = b.rect;
        if (b.kind === 'code') {
            ctx.fillStyle = CODE_BG;
            ctx.fillRect(x, y, w, h);
        } else if (b.kind === 'quote') {
            ctx.fillStyle = RULE;
            ctx.fillRect(x, y, 3, h);
        } else if (b.kind === 'rule') {
            ctx.fillStyle = RULE;
            ctx.fillRect(x, y + h / 2, w, 1);
        } else if (b.kind === 'chip') {
            ctx.strokeStyle = RULE;
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        }
    }

    drawPaths(ctx, items.under);

    for (const r of items.sheets) {
        ctx.strokeStyle = '#dadfd8';
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }
    drawPaths(ctx, items.sheetPaths.filter((p) => p.highlighter));
    drawPaths(ctx, items.sheetPaths.filter((p) => !p.highlighter));

    for (const img of items.images) {
        const { x, y, w, h } = img.rect;
        const bitmap = images.get(img.src);
        if (bitmap) ctx.drawImage(bitmap, x, y, w, h);
        else {
            ctx.fillStyle = CODE_BG;
            ctx.fillRect(x, y, w, h);
        }
    }

    ctx.textBaseline = 'alphabetic';
    for (const word of items.words) {
        ctx.font = word.font;
        ctx.fillStyle = word.color;
        const m = ctx.measureText(word.text);
        const ascent = m.fontBoundingBoxAscent ?? word.rect.h * 0.8;
        const descent = m.fontBoundingBoxDescent ?? word.rect.h * 0.2;
        const baseline = word.rect.y + (word.rect.h - (ascent + descent)) / 2 + ascent;
        // Squeezed to the width the word has on screen, in case the canvas's version of the
        // font is wider (headings use a narrower cut).
        ctx.fillText(word.text, word.rect.x, baseline, word.rect.w * 1.02);
        if (word.strike || word.underline) {
            ctx.fillStyle = word.color;
            const thickness = Math.max(1, word.rect.h / 18);
            if (word.strike) ctx.fillRect(word.rect.x, baseline - ascent * 0.32, word.rect.w, thickness);
            if (word.underline) ctx.fillRect(word.rect.x, baseline + thickness * 1.5, word.rect.w, thickness);
        }
    }

    for (const box of items.boxes) {
        const { x, y, w, h } = box.rect;
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = INK;
        ctx.fillStyle = box.checked ? INK : '#ffffff';
        ctx.beginPath();
        ctx.roundRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5, 2);
        ctx.fill();
        ctx.stroke();
        if (box.checked) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + w * 0.24, y + h * 0.52);
            ctx.lineTo(x + w * 0.43, y + h * 0.7);
            ctx.lineTo(x + w * 0.77, y + h * 0.3);
            ctx.stroke();
        }
    }

    for (const marker of items.markers) {
        ctx.fillStyle = INK;
        if (marker.kind === 'bullet') {
            ctx.beginPath();
            ctx.arc(marker.x, marker.y, 2.6, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.font = marker.font;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(marker.text, marker.x, marker.y + marker.lineHeight / 2);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        }
    }

    drawPaths(ctx, items.over);
}

// Images in the note, loaded as files so the canvas can still be saved (an <img> from
// another origin would block that).
async function loadImages(items) {
    const images = new Map();
    await Promise.all(items.images.map(async ({ src }) => {
        if (images.has(src)) return;
        try {
            const response = await fetch(src, { credentials: 'omit' });
            if (!response.ok) return;
            images.set(src, await createImageBitmap(await response.blob()));
        } catch {
            // Drawn as a grey box instead.
        }
    }));
    return images;
}

// page: the .note-page element; pageWidth: its width in CSS pixels. Resolves to PNG files,
// one per Letter-shaped page.
export async function snapshotPages(page, pageWidth) {
    await document.fonts?.ready;
    const layout = collect(page, pageWidth);
    const images = await loadImages(layout.items);
    const sheetWidth = pageWidth + MARGIN * 2;
    const sheetHeight = Math.round(sheetWidth * (11 / 8.5));
    const contentPerPage = sheetHeight - MARGIN * 2;
    const count = Math.max(1, Math.min(20, Math.ceil(layout.height / contentPerPage)));
    const files = [];
    for (let i = 0; i < count; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = sheetWidth * SCALE;
        canvas.height = sheetHeight * SCALE;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(SCALE, SCALE);
        ctx.beginPath();
        ctx.rect(MARGIN, MARGIN, pageWidth, contentPerPage);
        ctx.clip();
        ctx.translate(MARGIN, MARGIN - i * contentPerPage);
        drawPage(ctx, layout, images);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) files.push(new File([blob], `Page ${i + 1}.png`, { type: 'image/png' }));
    }
    return files;
}
