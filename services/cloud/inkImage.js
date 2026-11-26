import zlib from 'zlib';

// Draws a note's drawing (the strokes of a `drawing` block, see
// client/src/components/notes/drawing/geometry.js) as a PNG, so Word backups show the
// sketch itself. No image library: strokes are round-capped lines, so each is painted
// as a run of anti-aliased capsules into a pixel buffer, then written out as a PNG.
// Colours are the light theme's, on white, like paper.

const PEN = {
    ink: [17, 20, 17], blue: [39, 70, 208], red: [196, 43, 28], green: [29, 106, 69],
    orange: [184, 93, 0], purple: [107, 63, 196],
};
const HIGHLIGHTER = {
    yellow: [255, 220, 61], mint: [63, 224, 140], pink: [255, 122, 184], sky: [99, 189, 253], peach: [255, 159, 82],
};
const HIGHLIGHTER_OPACITY = 0.55;
const MAX_PIXELS = 1600 * 9600; // keeps one image well under a few tens of MB in memory

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const pressureWidth = (size, p) => size * (0.35 + (1.3 * p) / 100);

// Only well-formed strokes are drawn (the stored data comes from the browser).
function readStrokes(strokes) {
    if (!Array.isArray(strokes)) return [];
    return strokes.slice(0, 4000).flatMap((s) => {
        if (!s || !Array.isArray(s.points) || s.points.length < 3) return [];
        const points = s.points.slice(0, 18000).map(Number);
        if (points.some((n) => !Number.isFinite(n))) return [];
        const tool = s.tool === 'highlighter' ? 'highlighter' : 'pen';
        const colors = tool === 'pen' ? PEN : HIGHLIGHTER;
        return [{
            tool,
            color: colors[s.color] ?? Object.values(colors)[0],
            size: clamp(Number(s.size) || 4, 1, 80),
            pressure: s.pressure === true,
            points,
        }];
    });
}

// The stroke's coverage (0–1 per pixel) within its bounding box, at `scale` pixels per unit.
function strokeMask(stroke, scale, imgW, imgH) {
    const pts = [];
    let prevP = null;
    for (let i = 0; i + 1 < stroke.points.length; i += 3) {
        const raw = clamp(stroke.points[i + 2] ?? 50, 0, 100);
        const p = prevP === null ? raw : prevP * 0.4 + raw * 0.6;
        prevP = p;
        const width = stroke.tool === 'pen' && stroke.pressure ? pressureWidth(stroke.size, p) : stroke.size;
        pts.push({ x: stroke.points[i] * scale, y: stroke.points[i + 1] * scale, r: Math.max(0.5, (width * scale) / 2) });
    }
    if (pts.length === 0) return null;
    const maxR = Math.max(...pts.map((q) => q.r)) + 1;
    const x0 = clamp(Math.floor(Math.min(...pts.map((q) => q.x)) - maxR), 0, imgW);
    const y0 = clamp(Math.floor(Math.min(...pts.map((q) => q.y)) - maxR), 0, imgH);
    const x1 = clamp(Math.ceil(Math.max(...pts.map((q) => q.x)) + maxR), 0, imgW);
    const y1 = clamp(Math.ceil(Math.max(...pts.map((q) => q.y)) + maxR), 0, imgH);
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return null;
    const mask = new Float32Array(w * h);

    const segments = pts.length === 1 ? [[pts[0], pts[0]]] : pts.slice(1).map((b, k) => [pts[k], b]);
    for (const [a, b] of segments) {
        const r = Math.max(a.r, b.r) + 1;
        const sx0 = Math.max(x0, Math.floor(Math.min(a.x, b.x) - r));
        const sy0 = Math.max(y0, Math.floor(Math.min(a.y, b.y) - r));
        const sx1 = Math.min(x1, Math.ceil(Math.max(a.x, b.x) + r));
        const sy1 = Math.min(y1, Math.ceil(Math.max(a.y, b.y) + r));
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        for (let y = sy0; y < sy1; y++) {
            const py = y + 0.5;
            for (let x = sx0; x < sx1; x++) {
                const px = x + 0.5;
                const t = len2 === 0 ? 0 : clamp(((px - a.x) * dx + (py - a.y) * dy) / len2, 0, 1);
                const d = Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
                const cover = clamp(a.r + (b.r - a.r) * t + 0.5 - d, 0, 1);
                if (cover > 0) {
                    const idx = (y - y0) * w + (x - x0);
                    if (cover > mask[idx]) mask[idx] = cover;
                }
            }
        }
    }
    return { mask, x0, y0, w, h };
}

// ---------- PNG ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

function crc32(buf) {
    let c = 0xffffffff;
    for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

function encodePng(rgb, width, height) {
    const raw = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 3 + 1)] = 0; // no filter
        rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;  // bit depth
    header[9] = 2;  // RGB
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

// strokes: a drawing's strokes; width/height: its size in drawing units; pixelWidth: the
// image's width. Returns { data (PNG Buffer), width, height } in pixels.
export function drawingToPng({ strokes, width = 1000, height = 560, pixelWidth = 1200 }) {
    let scale = pixelWidth / width;
    const units = clamp(Number(height) || 560, 50, 6000);
    if (pixelWidth * units * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (width * units));
    const imgW = Math.max(1, Math.round(width * scale));
    const imgH = Math.max(1, Math.round(units * scale));
    const rgb = Buffer.alloc(imgW * imgH * 3, 255);

    const list = readStrokes(strokes);
    // Highlighters first, multiplied like ink on paper; pens over them.
    for (const stroke of [...list.filter((s) => s.tool === 'highlighter'), ...list.filter((s) => s.tool === 'pen')]) {
        const m = strokeMask(stroke, scale, imgW, imgH);
        if (!m) continue;
        const [cr, cg, cb] = stroke.color;
        const highlight = stroke.tool === 'highlighter';
        for (let y = 0; y < m.h; y++) {
            for (let x = 0; x < m.w; x++) {
                const cover = m.mask[y * m.w + x];
                if (cover === 0) continue;
                const i = ((m.y0 + y) * imgW + (m.x0 + x)) * 3;
                if (highlight) {
                    const a = cover * HIGHLIGHTER_OPACITY;
                    rgb[i] = Math.round(rgb[i] * (1 - a + (a * cr) / 255));
                    rgb[i + 1] = Math.round(rgb[i + 1] * (1 - a + (a * cg) / 255));
                    rgb[i + 2] = Math.round(rgb[i + 2] * (1 - a + (a * cb) / 255));
                } else {
                    rgb[i] = Math.round(rgb[i] + (cr - rgb[i]) * cover);
                    rgb[i + 1] = Math.round(rgb[i + 1] + (cg - rgb[i + 1]) * cover);
                    rgb[i + 2] = Math.round(rgb[i + 2] + (cb - rgb[i + 2]) * cover);
                }
            }
        }
    }
    return { data: encodePng(rgb, imgW, imgH), width: imgW, height: imgH };
}
