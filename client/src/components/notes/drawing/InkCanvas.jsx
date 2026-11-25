import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useDrawingState } from './drawingStore';
import {
    HIGHLIGHTER_SIZES, PEN_SIZES,
    addPoint, centerlinePath, eraseFromStroke, pressurePath, rectFrom,
    strokeBounds, strokeTouches, strokesInLasso, strokesInRect, transformStroke, unionBounds,
} from './geometry';
import { cleanList } from './strokeCache';
import './Drawing.css';

// The surface ink is drawn on, shared by the drawing blocks (DrawingView) and the
// handwriting layer over a whole note (NoteInk). It handles the pen, highlighter and
// eraser, the rectangle and lasso selections, and moving, resizing, recolouring,
// duplicating and deleting what's selected. The host stores the strokes; this calls
// `save(next, { grow })` once per finished stroke or change, so each is one undo step.
//
// Input: a pen (Apple Pencil, drawing tablet) or mouse always draws. A finger draws too
// until a pen is used on this device; after that fingers scroll the note (palm
// rejection), which the toolbar's finger button can switch back.
//
// `layered` puts the highlighter strokes in a separate SVG (class note-ink-under), so a
// host can place them under its content (the note's text) and the ink over it.

const shapes = new WeakMap();
function shapeOf(stroke) {
    let shape = shapes.get(stroke);
    if (!shape) {
        shape = stroke.tool === 'pen' && stroke.pressure
            ? { d: pressurePath(stroke.points, stroke.size), filled: true }
            : { d: centerlinePath(stroke.points), filled: false };
        shapes.set(stroke, shape);
    }
    return shape;
}

const strokeClass = (s, filled) => `dw-stroke dw-${s.tool} dw-c-${s.color}${filled ? ' is-filled' : ''}`;

function StrokePath({ stroke }) {
    const { d, filled } = shapeOf(stroke);
    return filled
        ? <path className={strokeClass(stroke, true)} d={d} />
        : <path className={strokeClass(stroke, false)} d={d} strokeWidth={stroke.size} />;
}

// Highlighter strokes sit under pen strokes, as on paper, whatever order they were drawn.
// `only` draws just one kind (for layered hosts).
const StrokeLayer = memo(function StrokeLayer({ strokes, indices, only }) {
    const highlights = [];
    const pens = [];
    for (const i of indices) {
        const s = strokes[i];
        if (s.tool === 'highlighter') {
            if (only !== 'pen') highlights.push(<StrokePath key={i} stroke={s} />);
        } else if (only !== 'highlighter') {
            pens.push(<StrokePath key={i} stroke={s} />);
        }
    }
    return (
        <>
            {highlights.length > 0 && <g className="dw-highlights">{highlights}</g>}
            {pens.length > 0 && <g>{pens}</g>}
        </>
    );
});

const NONE = [];
const pressureOf = (e) => (e.pointerType === 'pen' ? Math.max(e.pressure, 0.05) * 100 : 50);

function transformAttr(t) {
    if (!t) return undefined;
    if (t.scale && t.scale !== 1) return `translate(${t.ox} ${t.oy}) scale(${t.scale}) translate(${-t.ox} ${-t.oy})`;
    return `translate(${t.dx} ${t.dy})`;
}

function InkCanvas({
    store, editor, id, active, width, height, rawStrokes, latestStrokes, save,
    containerRef, actionsRef, layered = false, className = '', svgStyle, onScale,
}) {
    const tools = useDrawingState(store);
    const strokes = useMemo(() => cleanList(rawStrokes), [rawStrokes]);

    // The selection is a list of stroke positions, valid only for the strokes it was
    // made on (an undo or another change clears it).
    const [selection, setSelection] = useState({ indices: [], of: null });
    const selected = active && selection.of === rawStrokes ? selection.indices : NONE;
    const [erased, setErased] = useState(null);       // strokes hidden mid-erase (whole-stroke eraser)
    const [working, setWorking] = useState(null);     // strokes as cut so far (area eraser)
    const [preview, setPreview] = useState(null);     // move/scale of the selection mid-drag
    const [region, setRegion] = useState(null);       // rectangle or lasso being drawn
    const [scale, setScale] = useState(1);            // screen pixels per drawing unit

    const svgRef = useRef(null);
    const liveRef = useRef(null);
    const eraserRef = useRef(null);
    const gesture = useRef(null);
    const frame = useRef(0);

    const selectionBox = useMemo(
        () => (selected.length ? unionBounds(selected.map((i) => strokeBounds(strokes[i]))) : null),
        [selected, strokes]
    );
    const selectedSet = useMemo(() => new Set(selected), [selected]);
    const restIndices = useMemo(
        () => strokes.map((_, i) => i).filter((i) => !selectedSet.has(i) && !erased?.has(i)),
        [strokes, selectedSet, erased]
    );
    const workingIndices = useMemo(() => working?.map((_, i) => i) ?? NONE, [working]);

    function saveStrokes(next, { select = null, grow = true } = {}) {
        save(next, { grow });
        setSelection(select ? { indices: select, of: next } : { indices: [], of: null });
    }

    // ---------- Actions for the toolbar and the selection bar ----------

    function selectionKind(indices = selected) {
        if (!indices.length) return null;
        return indices.every((i) => strokes[i].tool === 'highlighter') ? 'highlighter' : 'pen';
    }

    const actions = {
        // A colour or size picked while strokes are selected changes them: pen colours
        // the pen strokes, highlighter colours the highlights.
        recolor(color, tool) {
            if (!selected.length) return;
            const next = strokes.map((s, i) => (selectedSet.has(i) && s.tool === tool ? { ...s, color } : s));
            saveStrokes(next, { select: selected, grow: false });
        },
        resize(sizeIndex, tool) {
            if (!selected.length) return;
            const size = (tool === 'pen' ? PEN_SIZES : HIGHLIGHTER_SIZES)[sizeIndex];
            const next = strokes.map((s, i) => (selectedSet.has(i) && s.tool === tool ? { ...s, size } : s));
            saveStrokes(next, { select: selected, grow: false });
        },
        duplicate() {
            if (!selected.length) return;
            const copies = selected.map((i) => transformStroke(strokes[i], { dx: 24, dy: 24 }));
            const next = [...strokes, ...copies];
            saveStrokes(next, { select: copies.map((_, k) => strokes.length + k) });
        },
        deleteSelection() {
            if (!selected.length) return;
            saveStrokes(strokes.filter((_, i) => !selectedSet.has(i)), { grow: false });
        },
        selectAll() {
            setSelection({ indices: strokes.map((_, i) => i), of: rawStrokes });
        },
        clearSelection() {
            setSelection({ indices: [], of: null });
        },
    };
    actionsRef.current = actions;

    // Tell the toolbar whether strokes are selected (it then recolours them).
    const kind = selectionKind();
    useEffect(() => {
        if (active && store.getState().selectionKind !== kind) store.set({ selectionKind: kind });
    }, [active, kind, store]);

    // Switching tools away from selecting drops the selection.
    useEffect(() => {
        if (tools.tool !== 'rect' && tools.tool !== 'lasso') setSelection({ indices: [], of: null });
    }, [tools.tool]);

    // Screen scale, for things that should stay a fixed size on screen (handles, eraser).
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return undefined;
        const observer = new ResizeObserver(() => {
            const s = svg.getBoundingClientRect().width / width || 1;
            setScale(s);
            onScale?.(s);
        });
        observer.observe(svg);
        return () => observer.disconnect();
    }, [width, onScale]);

    // While editing: a tap outside (and outside the toolbar) finishes; keys for the
    // selection; undo/redo without focusing the text.
    useEffect(() => {
        if (!active) return undefined;
        function onPointerDown(e) {
            if (containerRef.current?.contains(e.target)) return;
            if (e.target.closest?.('.note-toolbar')) return;
            store.deactivate(id);
        }
        function onKeyDown(e) {
            const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
            if (typing && !containerRef.current?.contains(e.target)) return;
            const mod = e.ctrlKey || e.metaKey;
            const act = actionsRef.current;
            if (e.key === 'Escape') {
                e.preventDefault();
                if (selected.length) act.clearSelection();
                else store.deactivate(id);
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length) {
                e.preventDefault();
                act.deleteSelection();
            } else if (mod && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) editor.commands.redo();
                else editor.commands.undo();
            } else if (mod && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                editor.commands.redo();
            } else if (mod && e.key.toLowerCase() === 'a' && (tools.tool === 'rect' || tools.tool === 'lasso')) {
                e.preventDefault();
                act.selectAll();
            } else if (mod && e.key.toLowerCase() === 'd' && selected.length) {
                e.preventDefault();
                act.duplicate();
            }
        }
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [active, id, store, editor, selected, tools.tool, containerRef, actionsRef]);

    // A touch that's drawing mustn't also scroll the page. Pointer events can't stop
    // that once scrolling is allowed (needed so fingers scroll in pen mode), so the
    // touch events are cancelled while a stroke is under way.
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return undefined;
        function onTouch(e) {
            const stylus = Array.from(e.touches ?? []).some((t) => t.touchType === 'stylus');
            if (gesture.current || (active && stylus)) e.preventDefault();
        }
        svg.addEventListener('touchstart', onTouch, { passive: false });
        svg.addEventListener('touchmove', onTouch, { passive: false });
        return () => {
            svg.removeEventListener('touchstart', onTouch);
            svg.removeEventListener('touchmove', onTouch);
        };
    }, [active]);

    // ---------- Pointer input ----------

    function toPoint(e) {
        const rect = svgRef.current.getBoundingClientRect();
        const s = rect.width / width || 1;
        return { x: (e.clientX - rect.left) / s, y: (e.clientY - rect.top) / s };
    }

    function drawLive() {
        if (frame.current) return;
        frame.current = requestAnimationFrame(() => {
            frame.current = 0;
            const g = gesture.current;
            const path = liveRef.current;
            if (!path) return;
            if (!g || g.kind !== 'stroke') {
                path.setAttribute('d', '');
                return;
            }
            const { stroke } = g;
            const filled = stroke.tool === 'pen' && stroke.pressure;
            path.setAttribute('class', strokeClass(stroke, filled));
            path.setAttribute('d', filled ? pressurePath(stroke.points, stroke.size) : centerlinePath(stroke.points));
            if (filled) path.removeAttribute('stroke-width');
            else path.setAttribute('stroke-width', stroke.size);
        });
    }

    function showEraser(pt) {
        const ring = eraserRef.current;
        if (!ring) return;
        if (!pt) {
            ring.setAttribute('r', '0');
            return;
        }
        ring.setAttribute('cx', pt.x);
        ring.setAttribute('cy', pt.y);
        ring.setAttribute('r', 12 / scale);
    }

    // Area eraser: cuts away what's under the eraser. Fast swipes are filled in between
    // samples, so a quick stroke of the eraser doesn't skip over lines.
    function eraseAreaAt(g, pt) {
        const radius = 12 / scale;
        const from = g.last ?? pt;
        const steps = Math.max(1, Math.ceil(Math.hypot(pt.x - from.x, pt.y - from.y) / (radius / 2)));
        let current = g.working;
        let changed = false;
        for (let k = 1; k <= steps; k++) {
            const x = from.x + ((pt.x - from.x) * k) / steps;
            const y = from.y + ((pt.y - from.y) * k) / steps;
            const next = [];
            for (const s of current) {
                const left = eraseFromStroke(s, x, y, radius);
                if (left === null) next.push(s);
                else {
                    next.push(...left);
                    changed = true;
                }
            }
            current = next;
        }
        g.last = pt;
        if (changed) {
            g.working = current;
            g.changed = true;
            setWorking(current);
        }
        showEraser(pt);
    }

    // Whole-stroke eraser.
    function eraseAt(g, pt) {
        let changed = false;
        strokes.forEach((s, i) => {
            if (!g.hits.has(i) && strokeTouches(s, pt.x, pt.y, 12 / scale)) {
                g.hits.add(i);
                changed = true;
            }
        });
        if (changed) setErased(new Set(g.hits));
        showEraser(pt);
    }

    const handleRadius = 14 / scale;
    const onHandle = (pt, box) => Math.hypot(pt.x - (box.x + box.w), pt.y - (box.y + box.h)) <= handleRadius * 1.6;
    const inBox = (pt, box) => pt.x >= box.x - 6 && pt.x <= box.x + box.w + 6 && pt.y >= box.y - 6 && pt.y <= box.y + box.h + 6;

    function onPointerDown(e) {
        if (!active) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.pointerType === 'pen' && !tools.penSeen) {
            // First time a pen is used here: from now on fingers scroll, so a resting
            // palm doesn't leave marks.
            store.set({ penSeen: true, fingerDraws: false });
        } else if (e.pointerType === 'touch' && !tools.fingerDraws) {
            return;
        }
        if (gesture.current) {
            // A second finger: the user is pinching or scrolling, not drawing.
            if (e.pointerType === 'touch') cancelGesture();
            return;
        }
        e.preventDefault();
        try {
            svgRef.current.setPointerCapture(e.pointerId);
        } catch {
            // The pointer is already gone (lifted during a slow frame): the stroke still ends on pointerup.
        }
        const pt = toPoint(e);
        const tool = tools.tool;

        if (tool === 'pen' || tool === 'highlighter') {
            const stroke = {
                tool,
                color: tool === 'pen' ? tools.penColor : tools.highlighterColor,
                size: tool === 'pen' ? PEN_SIZES[tools.penSize] : HIGHLIGHTER_SIZES[tools.highlighterSize],
                pressure: tool === 'pen' && e.pointerType === 'pen',
                points: [],
            };
            addPoint(stroke.points, pt.x, pt.y, pressureOf(e));
            gesture.current = { kind: 'stroke', pointerId: e.pointerId, stroke };
            setSelection({ indices: [], of: null });
            drawLive();
        } else if (tool === 'eraser') {
            if (tools.eraserMode === 'stroke') {
                gesture.current = { kind: 'erase', pointerId: e.pointerId, hits: new Set() };
                eraseAt(gesture.current, pt);
            } else {
                gesture.current = { kind: 'erase-area', pointerId: e.pointerId, working: strokes, changed: false, last: null };
                eraseAreaAt(gesture.current, pt);
            }
        } else if (selectionBox && onHandle(pt, selectionBox)) {
            gesture.current = { kind: 'scale', pointerId: e.pointerId, start: pt, box: selectionBox };
        } else if (selectionBox && inBox(pt, selectionBox)) {
            gesture.current = { kind: 'move', pointerId: e.pointerId, start: pt, box: selectionBox };
        } else {
            gesture.current = { kind: tool, pointerId: e.pointerId, start: pt, points: [pt.x, pt.y] };
            setSelection({ indices: [], of: null });
            setRegion(tool === 'rect' ? { kind: 'rect', rect: rectFrom(pt, pt) } : { kind: 'lasso', points: [pt.x, pt.y] });
        }
    }

    // Keeps a moved selection on the page: not past the left, right or top edges.
    function clampMove(box, dx, dy) {
        return {
            dx: Math.min(Math.max(dx, -box.x), width - box.x - box.w),
            dy: Math.max(dy, -box.y),
        };
    }

    function scaleFor(g, pt) {
        const { box } = g;
        const grown = (box.w + (pt.x - g.start.x) + box.h + (pt.y - g.start.y)) / (box.w + box.h || 1);
        const maxScale = (width - box.x) / (box.w || 1);
        return Math.min(Math.max(grown, 0.2), Math.min(maxScale, 6));
    }

    function onPointerMove(e) {
        const g = gesture.current;
        if (!g || e.pointerId !== g.pointerId) return;
        const events = e.getCoalescedEvents?.() ?? [];
        const all = events.length ? events : [e];
        if (g.kind === 'stroke') {
            for (const ev of all) {
                const pt = toPoint(ev);
                addPoint(g.stroke.points, pt.x, pt.y, pressureOf(ev));
            }
            drawLive();
        } else if (g.kind === 'erase') {
            for (const ev of all) eraseAt(g, toPoint(ev));
        } else if (g.kind === 'erase-area') {
            for (const ev of all) eraseAreaAt(g, toPoint(ev));
        } else if (g.kind === 'rect') {
            setRegion({ kind: 'rect', rect: rectFrom(g.start, toPoint(e)) });
        } else if (g.kind === 'lasso') {
            for (const ev of all) {
                const pt = toPoint(ev);
                const n = g.points.length;
                if (Math.hypot(pt.x - g.points[n - 2], pt.y - g.points[n - 1]) * scale >= 3) g.points.push(pt.x, pt.y);
            }
            setRegion({ kind: 'lasso', points: g.points.slice() });
        } else if (g.kind === 'move') {
            const pt = toPoint(e);
            setPreview(clampMove(g.box, pt.x - g.start.x, pt.y - g.start.y));
        } else if (g.kind === 'scale') {
            setPreview({ scale: scaleFor(g, toPoint(e)), ox: g.box.x, oy: g.box.y });
        }
    }

    function endGesture() {
        gesture.current = null;
        drawLive();
        showEraser(null);
        setErased(null);
        setWorking(null);
        setRegion(null);
        setPreview(null);
    }

    function cancelGesture() {
        endGesture();
    }

    function onPointerUp(e) {
        const g = gesture.current;
        if (!g || e.pointerId !== g.pointerId) return;
        if (g.kind === 'stroke') {
            // Built on the saved strokes, not this render's: strokes can finish faster
            // than the view re-renders (quick dots).
            saveStrokes([...cleanList(latestStrokes()), g.stroke]);
        } else if (g.kind === 'erase') {
            if (g.hits.size) saveStrokes(strokes.filter((_, i) => !g.hits.has(i)), { grow: false });
        } else if (g.kind === 'erase-area') {
            if (g.changed) saveStrokes(g.working, { grow: false });
        } else if (g.kind === 'rect' || g.kind === 'lasso') {
            const pt = toPoint(e);
            const picked = g.kind === 'rect'
                ? strokesInRect(strokes, rectFrom(g.start, pt))
                : strokesInLasso(strokes, [...g.points, pt.x, pt.y]);
            setSelection({ indices: picked, of: rawStrokes });
        } else if (g.kind === 'move' || g.kind === 'scale') {
            const pt = toPoint(e);
            const t = g.kind === 'move'
                ? clampMove(g.box, pt.x - g.start.x, pt.y - g.start.y)
                : { scale: scaleFor(g, pt), ox: g.box.x, oy: g.box.y };
            const moved = g.kind === 'move' ? Math.hypot(t.dx, t.dy) * scale >= 2 : Math.abs(t.scale - 1) > 0.01;
            if (moved) {
                const next = strokes.map((s, i) => (selectedSet.has(i) ? transformStroke(s, t) : s));
                saveStrokes(next, { select: selected });
            }
        }
        endGesture();
    }

    // ---------- Render ----------

    const box = selectionBox && preview
        ? (preview.scale
            ? { x: selectionBox.x, y: selectionBox.y, w: selectionBox.w * preview.scale, h: selectionBox.h * preview.scale }
            : { ...selectionBox, x: selectionBox.x + preview.dx, y: selectionBox.y + preview.dy })
        : selectionBox;
    // The selection bar sits above the selection, or below it when that's off the top.
    const barBelow = box && box.y * scale < 52;
    const viewBox = `0 0 ${width} ${height}`;
    const shownStrokes = working ?? strokes;
    const shownIndices = working ? workingIndices : restIndices;

    function layer(only) {
        return (
            <>
                <StrokeLayer strokes={shownStrokes} indices={shownIndices} only={only} />
                {selected.length > 0 && (
                    <g className="dw-selected" transform={transformAttr(preview)}>
                        <StrokeLayer strokes={strokes} indices={selected} only={only} />
                    </g>
                )}
            </>
        );
    }

    return (
        <>
            {layered && (
                <svg className="note-ink-under" viewBox={viewBox} preserveAspectRatio="xMinYMin meet" aria-hidden="true">
                    {layer('highlighter')}
                </svg>
            )}
            <svg
                ref={svgRef}
                className={className}
                viewBox={viewBox}
                preserveAspectRatio="xMinYMin meet"
                style={svgStyle}
                aria-hidden="true"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={cancelGesture}
                onLostPointerCapture={(e) => gesture.current?.pointerId === e.pointerId && gesture.current.kind !== 'stroke' && cancelGesture()}
            >
                {layer(layered ? 'pen' : undefined)}
                <path ref={liveRef} className="dw-stroke" d="" />
                <circle ref={eraserRef} className="dw-eraser-ring" r="0" />
                {region?.kind === 'rect' && (
                    <rect className="dw-region" x={region.rect.x} y={region.rect.y} width={region.rect.w} height={region.rect.h} />
                )}
                {region?.kind === 'lasso' && (
                    <polygon className="dw-region" points={region.points.join(' ')} />
                )}
                {box && (
                    <>
                        <rect className="dw-selection" x={box.x - 6} y={box.y - 6} width={box.w + 12} height={box.h + 12} />
                        <circle className="dw-handle" cx={box.x + box.w + 6} cy={box.y + box.h + 6} r={handleRadius / 1.6} />
                    </>
                )}
            </svg>

            {box && !preview && (
                <div
                    className={`note-drawing-selbar${barBelow ? ' is-below' : ''}`}
                    style={{
                        left: `${((box.x + box.w / 2) / width) * 100}%`,
                        top: `${((barBelow ? box.y + box.h + 6 : box.y - 6) / height) * 100}%`,
                    }}
                    role="toolbar"
                    aria-label="Selected strokes"
                >
                    <button type="button" onClick={() => actions.duplicate()}>Duplicate</button>
                    <button type="button" className="is-danger" onClick={() => actions.deleteSelection()}>Delete</button>
                </div>
            )}
        </>
    );
}

export default InkCanvas;
