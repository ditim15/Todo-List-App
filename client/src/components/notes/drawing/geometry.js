// Geometry for note drawings: the stored format, turning strokes into SVG paths, and the
// hit tests behind the eraser and the rectangle and lasso selections.
//
// A drawing is stored in the note's document as a `drawing` node with two attributes:
//   width-independent coordinates: the drawing is DRAWING_WIDTH units wide at any screen
//     size and `height` units tall, and is scaled to fit the note's column, so a sketch
//     made on an iPad looks the same on a phone or a desktop;
//   strokes: [{ tool: 'pen' | 'highlighter', color, size, pressure, points }]
//     points is a flat list of whole numbers [x, y, p, x, y, p, …]; p is the pen pressure
//     (0–100). `pressure` is true only for strokes drawn with a pen (Apple Pencil, a
//     drawing tablet), the only input that reports real pressure; other strokes keep an
//     even width.
// Everything read from a stored drawing is checked here (cleanDrawing), so a damaged or
// hand-edited note can't break the page.

export const DRAWING_WIDTH = 1000;
export const DEFAULT_HEIGHT = 560;
export const MIN_HEIGHT = 200;
export const MAX_HEIGHT = 6000;
export const MAX_STROKES = 4000;
const MAX_POINTS = 6000; // per stroke (x, y, p triples)

export const PEN_COLORS = ['ink', 'blue', 'red', 'green', 'orange', 'purple'];
export const HIGHLIGHTER_COLORS = ['yellow', 'mint', 'pink', 'sky', 'peach'];
export const COLOR_NAMES = {
    ink: 'Ink', blue: 'Blue', red: 'Red', green: 'Green', orange: 'Orange', purple: 'Purple',
    yellow: 'Yellow', mint: 'Green', pink: 'Pink', sky: 'Blue', peach: 'Orange',
};
// Widths in drawing units (a thousandth of the drawing's width).
export const PEN_SIZES = [2, 4, 8];
export const HIGHLIGHTER_SIZES = [14, 24, 36];
export const SIZE_NAMES = ['Fine', 'Medium', 'Bold'];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const finite = (n, fallback) => (Number.isFinite(Number(n)) ? Number(n) : fallback);

export function cleanStroke(stroke) {
    if (!stroke || typeof stroke !== 'object' || !Array.isArray(stroke.points)) return null;
    const tool = stroke.tool === 'highlighter' ? 'highlighter' : 'pen';
    const colors = tool === 'pen' ? PEN_COLORS : HIGHLIGHTER_COLORS;
    const points = [];
    const raw = stroke.points.slice(0, MAX_POINTS * 3);
    for (let i = 0; i + 1 < raw.length; i += 3) {
        const x = Number(raw[i]);
        const y = Number(raw[i + 1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        points.push(Math.round(x), Math.round(y), Math.round(clamp(finite(raw[i + 2], 50), 0, 100)));
    }
    if (points.length === 0) return null;
    return {
        tool,
        color: colors.includes(stroke.color) ? stroke.color : colors[0],
        size: clamp(finite(stroke.size, tool === 'pen' ? 4 : 24), 1, 80),
        pressure: stroke.pressure === true,
        points,
    };
}

export function cleanStrokes(strokes) {
    if (!Array.isArray(strokes)) return [];
    return strokes.slice(0, MAX_STROKES).map(cleanStroke).filter(Boolean);
}

export function cleanHeight(height) {
    return clamp(Math.round(finite(height, DEFAULT_HEIGHT)), MIN_HEIGHT, MAX_HEIGHT);
}

// ---------- Recording ----------

// Adds a point to a stroke being drawn, skipping ones too close to the last to matter
// (keeps notes small without visibly changing the line).
export function addPoint(points, x, y, p) {
    const n = points.length;
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rp = Math.round(clamp(p, 0, 100));
    if (n >= 3) {
        const dx = rx - points[n - 3];
        const dy = ry - points[n - 2];
        if (dx * dx + dy * dy < 4) {
            // Same place: keep the firmer pressure, so a press at the end still counts.
            points[n - 1] = Math.max(points[n - 1], rp);
            return false;
        }
    }
    if (n >= MAX_POINTS * 3) return false;
    points.push(rx, ry, rp);
    return true;
}

// ---------- Drawing paths ----------

const fmt = (n) => (Math.round(n * 10) / 10).toString();

// An even-width line through the points, smoothed with curves through the midpoints.
// Drawn with stroke (round caps and joins), so it suits mouse, finger and highlighter.
export function centerlinePath(points) {
    const n = points.length / 3;
    if (n === 0) return '';
    if (n === 1) return `M${fmt(points[0])} ${fmt(points[1])}l0.01 0`;
    let d = `M${fmt(points[0])} ${fmt(points[1])}`;
    for (let i = 1; i < n - 1; i++) {
        const x = points[i * 3];
        const y = points[i * 3 + 1];
        const mx = (x + points[(i + 1) * 3]) / 2;
        const my = (y + points[(i + 1) * 3 + 1]) / 2;
        d += `Q${fmt(x)} ${fmt(y)} ${fmt(mx)} ${fmt(my)}`;
    }
    d += `L${fmt(points[(n - 1) * 3])} ${fmt(points[(n - 1) * 3 + 1])}`;
    return d;
}

// Pen pressure makes the line thinner (light) or thicker (firm) than its set width.
export const pressureWidth = (size, p) => size * (0.35 + (1.3 * p) / 100);

function circle(x, y, r) {
    return `M${fmt(x - r)} ${fmt(y)}a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(r * 2)} 0a${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(-r * 2)} 0Z`;
}

// A pressure-sensitive line as a filled shape: a circle at every point and a tapered
// band between each pair. They overlap, but the fill is solid, so the joins are
// seamless even on sharp turns (where a single outline would kink).
export function pressurePath(points, size) {
    const n = points.length / 3;
    let d = '';
    let prev = null;
    for (let i = 0; i < n; i++) {
        const x = points[i * 3];
        const y = points[i * 3 + 1];
        // Smooth pressure a little, so one noisy reading doesn't make a bump.
        const p = prev ? (prev.p * 0.4 + points[i * 3 + 2] * 0.6) : points[i * 3 + 2];
        const r = pressureWidth(size, p) / 2;
        d += circle(x, y, r);
        if (prev) {
            const dx = x - prev.x;
            const dy = y - prev.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;
            d += `M${fmt(prev.x + nx * prev.r)} ${fmt(prev.y + ny * prev.r)}`
                + `L${fmt(x + nx * r)} ${fmt(y + ny * r)}`
                + `L${fmt(x - nx * r)} ${fmt(y - ny * r)}`
                + `L${fmt(prev.x - nx * prev.r)} ${fmt(prev.y - ny * prev.r)}Z`;
        }
        prev = { x, y, p, r };
    }
    return d;
}

// ---------- Bounds, hit tests, transforms ----------

export function strokeBounds(stroke) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const { points } = stroke;
    for (let i = 0; i < points.length; i += 3) {
        minX = Math.min(minX, points[i]);
        maxX = Math.max(maxX, points[i]);
        minY = Math.min(minY, points[i + 1]);
        maxY = Math.max(maxY, points[i + 1]);
    }
    const pad = stroke.size / 2;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + stroke.size, h: maxY - minY + stroke.size };
}

export function unionBounds(boxes) {
    if (boxes.length === 0) return null;
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    const right = Math.max(...boxes.map((b) => b.x + b.w));
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    return { x, y, w: right - x, h: bottom - y };
}

function distanceToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Whether the eraser, a circle of `radius` at (x, y), touches the stroke.
export function strokeTouches(stroke, x, y, radius) {
    const { points } = stroke;
    const reach = radius + stroke.size / 2;
    if (points.length === 3) return Math.hypot(points[0] - x, points[1] - y) <= reach;
    for (let i = 3; i < points.length; i += 3) {
        if (distanceToSegment(x, y, points[i - 3], points[i - 2], points[i], points[i + 1]) <= reach) return true;
    }
    return false;
}

// The area eraser: removes only the part of the stroke under the eraser (a circle of
// `radius` at x, y). Returns null if the stroke isn't touched, otherwise what's left of
// it: none, one or several strokes (erasing across the middle of a line cuts it in two).
export function eraseFromStroke(stroke, x, y, radius) {
    const reach = radius + stroke.size * 0.35;
    const b = strokeBounds(stroke);
    if (x < b.x - reach || x > b.x + b.w + reach || y < b.y - reach || y > b.y + b.h + reach) return null;
    if (!strokeTouches(stroke, x, y, radius)) return null;

    // Add points along long segments, so the cut lands where the eraser was rather than
    // at the nearest recorded point.
    const step = Math.max(2, radius / 3);
    const src = stroke.points;
    const dense = [src[0], src[1], src[2]];
    for (let i = 3; i < src.length; i += 3) {
        const [ax, ay, ap] = [src[i - 3], src[i - 2], src[i - 1]];
        const [bx, by, bp] = [src[i], src[i + 1], src[i + 2]];
        const n = Math.ceil(Math.hypot(bx - ax, by - ay) / step);
        for (let k = 1; k <= n; k++) {
            const t = k / n;
            dense.push(Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t), Math.round(ap + (bp - ap) * t));
        }
    }

    const pieces = [];
    let run = [];
    for (let i = 0; i < dense.length; i += 3) {
        if (Math.hypot(dense[i] - x, dense[i + 1] - y) <= reach) {
            if (run.length) pieces.push(run);
            run = [];
        } else {
            run.push(dense[i], dense[i + 1], dense[i + 2]);
        }
    }
    if (run.length) pieces.push(run);
    // A lone leftover point from a line would show as a stray dot, so it goes too.
    const isDot = src.length === 3;
    return pieces
        .filter((points) => isDot || points.length >= 6)
        .map((points) => ({ ...stroke, points }));
}

function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 2; i < polygon.length; j = i, i += 2) {
        const xi = polygon[i];
        const yi = polygon[i + 1];
        const xj = polygon[j];
        const yj = polygon[j + 1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

// Strokes count as selected when most of their points are inside the area, as in
// note-taking apps: a loose circle around a word picks the word, not its neighbours'
// tails that happen to cross the line.
function mostlyInside(stroke, test) {
    const { points } = stroke;
    let inside = 0;
    const total = points.length / 3;
    for (let i = 0; i < points.length; i += 3) if (test(points[i], points[i + 1])) inside++;
    return inside / total >= 0.5;
}

export function strokesInRect(strokes, rect) {
    const x2 = rect.x + rect.w;
    const y2 = rect.y + rect.h;
    const ids = [];
    strokes.forEach((s, i) => {
        if (mostlyInside(s, (x, y) => x >= rect.x && x <= x2 && y >= rect.y && y <= y2)) ids.push(i);
    });
    return ids;
}

export function strokesInLasso(strokes, polygon) {
    if (polygon.length < 6) return [];
    const ids = [];
    strokes.forEach((s, i) => {
        if (mostlyInside(s, (x, y) => pointInPolygon(x, y, polygon))) ids.push(i);
    });
    return ids;
}

// A rectangle from two corners, in any order.
export function rectFrom(a, b) {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

// Moves and scales a stroke: scaled by `scale` around (ox, oy), then shifted by (dx, dy).
// Line widths scale too, so a shrunk word keeps its look.
export function transformStroke(stroke, { dx = 0, dy = 0, scale = 1, ox = 0, oy = 0 }) {
    const points = stroke.points.slice();
    for (let i = 0; i < points.length; i += 3) {
        points[i] = Math.round(ox + (points[i] - ox) * scale + dx);
        points[i + 1] = Math.round(oy + (points[i + 1] - oy) * scale + dy);
    }
    return { ...stroke, points, size: clamp(Math.round(stroke.size * scale * 10) / 10, 1, 80) };
}

// The lowest point any stroke reaches, so the drawing can't be shrunk past its content.
export function contentBottom(strokes) {
    let bottom = 0;
    for (const s of strokes) {
        const b = strokeBounds(s);
        bottom = Math.max(bottom, b.y + b.h);
    }
    return bottom;
}
