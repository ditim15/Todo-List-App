import { memo, useEffect, useId, useMemo, useRef, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { closeHistory } from '@tiptap/pm/history';
import { useDrawingState } from './drawingStore';
import {
    DRAWING_WIDTH, HIGHLIGHTER_SIZES, MAX_HEIGHT, MIN_HEIGHT, PEN_SIZES,
    addPoint, centerlinePath, cleanHeight, cleanStroke, contentBottom, pressurePath, rectFrom,
    strokeBounds, strokeTouches, strokesInLasso, strokesInRect, transformStroke, unionBounds,
} from './geometry';
import './Drawing.css';

// One drawing block. Shown as a picture until it's tapped; then it takes the pen, and
// the note's toolbar shows the drawing tools (DrawingToolbar). Every finished stroke,
// erase, move or resize is one change to the note's document, so Undo steps through them.
//
// Input: a pen (Apple Pencil, drawing tablet) or mouse always draws. A finger draws too
// until a pen is used on this device; after that fingers scroll the note (palm
// rejection), which the toolbar's finger button can switch back.

// Stored strokes are checked once and the result reused, so paths aren't rebuilt for
// strokes that didn't change.
const cleaned = new WeakMap();
function clean(stroke) {
    if (stroke && typeof stroke === 'object' && cleaned.has(stroke)) return cleaned.get(stroke);
    const result = cleanStroke(stroke);
    if (result) cleaned.set(result, result);
    if (stroke && typeof stroke === 'object' && result) cleaned.set(stroke, result);
    return result;
}

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
const StrokeLayer = memo(function StrokeLayer({ strokes, indices }) {
    const highlights = [];
    const pens = [];
    for (const i of indices) {
        const s = strokes[i];
        (s.tool === 'highlighter' ? highlights : pens).push(<StrokePath key={i} stroke={s} />);
    }
    return (
        <>
            <g className="dw-highlights">{highlights}</g>
            <g>{pens}</g>
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

function DrawingView({ node, editor, getPos }) {
    const store = editor.storage.drawing.store;
    const tools = useDrawingState(store);
    const id = useId();
    const active = tools.activeId === id;

    const rawStrokes = node.attrs.strokes;
    const strokes = useMemo(() => (Array.isArray(rawStrokes) ? rawStrokes.map(clean).filter(Boolean) : []), [rawStrokes]);
    const height = cleanHeight(node.attrs.height);

    // The selection is a list of stroke positions, valid only for the strokes it was
    // made on (an undo or another change clears it).
    const [selection, setSelection] = useState({ indices: [], of: null });
    const selected = active && selection.of === rawStrokes ? selection.indices : NONE;
    const [erased, setErased] = useState(null);       // strokes hidden mid-erase
    const [preview, setPreview] = useState(null);     // move/scale of the selection mid-drag
    const [region, setRegion] = useState(null);       // rectangle or lasso being drawn
    const [liveHeight, setLiveHeight] = useState(null);
    const [scale, setScale] = useState(1);            // screen pixels per drawing unit

    const wrapperRef = useRef(null);
    const svgRef = useRef(null);
    const liveRef = useRef(null);
    const eraserRef = useRef(null);
    const gesture = useRef(null);
    const frame = useRef(0);

    const shownHeight = liveHeight ?? height;
    const selectionBox = useMemo(
        () => (selected.length ? unionBounds(selected.map((i) => strokeBounds(strokes[i]))) : null),
        [selected, strokes]
    );
    const selectedSet = useMemo(() => new Set(selected), [selected]);
    const restIndices = useMemo(
        () => strokes.map((_, i) => i).filter((i) => !selectedSet.has(i) && !erased?.has(i)),
        [strokes, selectedSet, erased]
    );

    // ---------- Saving ----------

    // Applies a change to this drawing as its own undo step.
    // This drawing's node as saved right now. Strokes can finish faster than the view
    // re-renders (quick dots), so additions build on this rather than the last render.
    function savedNode() {
        const pos = getPos();
        if (typeof pos !== 'number') return null;
        const current = editor.state.doc.nodeAt(pos);
        return current?.type.name === 'drawing' ? { pos, node: current } : null;
    }

    function savedStrokes() {
        const saved = savedNode()?.node.attrs.strokes;
        return Array.isArray(saved) ? saved.map(clean).filter(Boolean) : strokes;
    }

    function commit(patch) {
        const saved = savedNode();
        if (!saved) return;
        const tr = editor.state.tr.setNodeMarkup(saved.pos, undefined, { ...saved.node.attrs, ...patch });
        editor.view.dispatch(closeHistory(tr));
    }

    // Saves new strokes, growing the drawing when they reach near its bottom edge.
    function saveStrokes(next, { select = null, grow = true } = {}) {
        const current = cleanHeight(savedNode()?.node.attrs.height ?? height);
        let nextHeight = current;
        if (grow) {
            const bottom = contentBottom(next);
            if (bottom > current - 60) nextHeight = Math.min(MAX_HEIGHT, Math.max(current + 280, Math.ceil(bottom + 120)));
        }
        commit(nextHeight === current ? { strokes: next } : { strokes: next, height: nextHeight });
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
        removeDrawing() {
            const pos = getPos();
            if (typeof pos !== 'number') return;
            store.deactivate(id);
            editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize));
        },
        finish() {
            store.deactivate(id);
        },
    };
    const actionsRef = useRef(actions);
    actionsRef.current = actions;

    function activate() {
        // Stable functions that always run the latest render's actions.
        const api = {};
        for (const name of Object.keys(actions)) api[name] = (...args) => actionsRef.current[name](...args);
        store.activate(id, api);
        // Drawing shouldn't bring up the on-screen keyboard or leave a caret blinking.
        if (editor.view.dom.contains(document.activeElement)) editor.view.dom.blur();
    }

    // A drawing just inserted opens ready to draw.
    useEffect(() => {
        if (store.isActivatePending()) activate();
        return () => store.deactivate(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        const observer = new ResizeObserver(() => setScale(svg.getBoundingClientRect().width / DRAWING_WIDTH || 1));
        observer.observe(svg);
        return () => observer.disconnect();
    }, []);

    // While editing: a tap outside the drawing (and its toolbar) finishes; keys for the
    // selection; undo/redo without focusing the text.
    useEffect(() => {
        if (!active) return undefined;
        function onPointerDown(e) {
            if (wrapperRef.current?.contains(e.target)) return;
            if (e.target.closest?.('.note-toolbar')) return;
            store.deactivate(id);
        }
        function onKeyDown(e) {
            const typing = e.target.closest?.('input, textarea, select, [contenteditable="true"]');
            if (typing && !wrapperRef.current?.contains(e.target)) return;
            const mod = e.ctrlKey || e.metaKey;
            const act = actionsRef.current;
            if (e.key === 'Escape') {
                e.preventDefault();
                if (selected.length) act.clearSelection();
                else act.finish();
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
    }, [active, id, store, editor, selected, tools.tool]);

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
        const s = rect.width / DRAWING_WIDTH || 1;
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
            gesture.current = { kind: 'erase', pointerId: e.pointerId, hits: new Set() };
            eraseAt(gesture.current, pt);
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
            dx: Math.min(Math.max(dx, -box.x), DRAWING_WIDTH - box.x - box.w),
            dy: Math.max(dy, -box.y),
        };
    }

    function scaleFor(g, pt) {
        const { box } = g;
        const grown = (box.w + (pt.x - g.start.x) + box.h + (pt.y - g.start.y)) / (box.w + box.h || 1);
        const maxScale = (DRAWING_WIDTH - box.x) / (box.w || 1);
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
            saveStrokes([...savedStrokes(), g.stroke]);
        } else if (g.kind === 'erase') {
            if (g.hits.size) saveStrokes(strokes.filter((_, i) => !g.hits.has(i)), { grow: false });
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

    // ---------- Changing the height ----------

    function onGripDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
            // Already lifted.
        }
        const minHeight = Math.max(MIN_HEIGHT, Math.ceil(contentBottom(strokes) + 16));
        const target = e.currentTarget;
        const grip = { startY: e.clientY, startHeight: height, minHeight, value: height };
        const move = (ev) => {
            const next = grip.startHeight + (ev.clientY - grip.startY) / scale;
            grip.value = Math.round(Math.min(MAX_HEIGHT, Math.max(grip.minHeight, next)));
            setLiveHeight(grip.value);
        };
        const up = (ev) => {
            target.removeEventListener('pointermove', move);
            target.removeEventListener('pointerup', up);
            target.removeEventListener('pointercancel', up);
            if (ev.type === 'pointerup' && grip.value !== height) commit({ height: grip.value });
            setLiveHeight(null);
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        target.addEventListener('pointercancel', up);
    }

    function onGripKey(e) {
        const step = e.shiftKey ? 200 : 60;
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const minHeight = Math.max(MIN_HEIGHT, Math.ceil(contentBottom(strokes) + 16));
        const next = Math.min(MAX_HEIGHT, Math.max(minHeight, height + (e.key === 'ArrowDown' ? step : -step)));
        if (next !== height) commit({ height: next });
    }

    // ---------- Render ----------

    const toolClass = active ? ` is-active tool-${tools.tool}${tools.fingerDraws ? ' finger-draws' : ''}` : '';
    const box = selectionBox && preview
        ? (preview.scale
            ? { x: selectionBox.x, y: selectionBox.y, w: selectionBox.w * preview.scale, h: selectionBox.h * preview.scale }
            : { ...selectionBox, x: selectionBox.x + preview.dx, y: selectionBox.y + preview.dy })
        : selectionBox;
    const label = strokes.length === 0
        ? 'Empty drawing'
        : `Drawing, ${strokes.length} stroke${strokes.length === 1 ? '' : 's'}`;
    // The selection bar sits above the selection, or below it when that's off the top.
    const barBelow = box && box.y * scale < 52;

    return (
        <NodeViewWrapper
            ref={wrapperRef}
            className={`note-drawing${toolClass}`}
            {...(active
                ? { role: 'group', 'aria-label': `${label}. Editing; press Escape to finish.` }
                : {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': `${label}. Press Enter to draw.`,
                    onClick: activate,
                    onKeyDown: (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            activate();
                        }
                    },
                })}
        >
            <svg
                ref={svgRef}
                className="note-drawing-surface"
                viewBox={`0 0 ${DRAWING_WIDTH} ${shownHeight}`}
                style={{ aspectRatio: `${DRAWING_WIDTH} / ${shownHeight}` }}
                aria-hidden="true"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={cancelGesture}
                onLostPointerCapture={(e) => gesture.current?.pointerId === e.pointerId && gesture.current.kind !== 'stroke' && cancelGesture()}
            >
                <StrokeLayer strokes={strokes} indices={restIndices} />
                {selected.length > 0 && (
                    <g className="dw-selected" transform={transformAttr(preview)}>
                        <StrokeLayer strokes={strokes} indices={selected} />
                    </g>
                )}
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

            {!active && strokes.length === 0 && <span className="note-drawing-empty">Empty drawing. Tap to draw.</span>}
            {active && strokes.length === 0 && !gesture.current && <span className="note-drawing-empty" aria-hidden="true">Draw here</span>}

            {box && !preview && (
                <div
                    className={`note-drawing-selbar${barBelow ? ' is-below' : ''}`}
                    style={{
                        left: `${((box.x + box.w / 2) / DRAWING_WIDTH) * 100}%`,
                        top: `${((barBelow ? box.y + box.h + 6 : box.y - 6) / shownHeight) * 100}%`,
                    }}
                    role="toolbar"
                    aria-label="Selected strokes"
                >
                    <button type="button" onClick={() => actions.duplicate()}>Duplicate</button>
                    <button type="button" className="is-danger" onClick={() => actions.deleteSelection()}>Delete</button>
                </div>
            )}

            {active && (
                <button
                    type="button"
                    className="note-drawing-grip"
                    aria-label="Drawing height. Drag, or use the arrow keys, to make it taller or shorter."
                    title="Drag to resize"
                    onPointerDown={onGripDown}
                    onKeyDown={onGripKey}
                >
                    <span aria-hidden="true" />
                </button>
            )}
        </NodeViewWrapper>
    );
}

export default DrawingView;
