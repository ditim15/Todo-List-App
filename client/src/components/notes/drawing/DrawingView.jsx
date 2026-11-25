import { useEffect, useId, useRef, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { closeHistory } from '@tiptap/pm/history';
import { useDrawingState } from './drawingStore';
import InkCanvas from './InkCanvas';
import { cleanList } from './strokeCache';
import { DRAWING_WIDTH, MAX_HEIGHT, MIN_HEIGHT, cleanHeight, contentBottom } from './geometry';

// One drawing block: a sheet of its own in the note, for sketches and diagrams that
// need space (writing over the note itself is NoteInk). Shown as a picture until it's
// tapped; then it takes the pen, and the note's toolbar shows the drawing tools.

function DrawingView({ node, editor, getPos }) {
    const store = editor.storage.drawing.store;
    const tools = useDrawingState(store);
    const id = useId();
    const active = tools.activeId === id;
    const rawStrokes = node.attrs.strokes;
    const strokeCount = Array.isArray(rawStrokes) ? rawStrokes.length : 0;
    const height = cleanHeight(node.attrs.height);
    const [liveHeight, setLiveHeight] = useState(null);
    const [scale, setScale] = useState(1);
    const wrapperRef = useRef(null);
    const canvasActions = useRef({});

    // This drawing's node as saved right now.
    function savedNode() {
        const pos = getPos();
        if (typeof pos !== 'number') return null;
        const current = editor.state.doc.nodeAt(pos);
        return current?.type.name === 'drawing' ? { pos, node: current } : null;
    }

    // Applies a change to this drawing as its own undo step.
    function commit(patch) {
        const saved = savedNode();
        if (!saved) return;
        const tr = editor.state.tr.setNodeMarkup(saved.pos, undefined, { ...saved.node.attrs, ...patch });
        editor.view.dispatch(closeHistory(tr));
    }

    // Saves strokes, growing the sheet when they reach near its bottom edge.
    function save(next, { grow }) {
        const current = cleanHeight(savedNode()?.node.attrs.height ?? height);
        let nextHeight = current;
        if (grow) {
            const bottom = contentBottom(next);
            if (bottom > current - 60) nextHeight = Math.min(MAX_HEIGHT, Math.max(current + 280, Math.ceil(bottom + 120)));
        }
        commit(nextHeight === current ? { strokes: next } : { strokes: next, height: nextHeight });
    }

    function activate() {
        // Stable functions that always run the latest render's actions.
        const api = {
            removeDrawing() {
                const saved = savedNode();
                store.deactivate(id);
                if (saved) editor.view.dispatch(editor.state.tr.delete(saved.pos, saved.pos + saved.node.nodeSize));
            },
            finish: () => store.deactivate(id),
        };
        for (const name of ['recolor', 'resize', 'duplicate', 'deleteSelection', 'selectAll', 'clearSelection']) {
            api[name] = (...args) => canvasActions.current[name]?.(...args);
        }
        store.activate(id, api, 'drawing');
        // Drawing shouldn't bring up the on-screen keyboard or leave a caret blinking.
        if (editor.view.dom.contains(document.activeElement)) editor.view.dom.blur();
    }

    // A drawing just inserted opens ready to draw.
    useEffect(() => {
        if (store.isActivatePending()) activate();
        return () => store.deactivate(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        const minHeight = Math.max(MIN_HEIGHT, Math.ceil(contentBottom(cleanList(rawStrokes)) + 16));
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
        const minHeight = Math.max(MIN_HEIGHT, Math.ceil(contentBottom(cleanList(rawStrokes)) + 16));
        const next = Math.min(MAX_HEIGHT, Math.max(minHeight, height + (e.key === 'ArrowDown' ? step : -step)));
        if (next !== height) commit({ height: next });
    }

    // ---------- Render ----------

    const shownHeight = liveHeight ?? height;
    const toolClass = active ? ` is-active tool-${tools.tool}${tools.fingerDraws ? ' finger-draws' : ''}` : '';
    const label = strokeCount === 0 ? 'Empty drawing' : `Drawing, ${strokeCount} stroke${strokeCount === 1 ? '' : 's'}`;

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
            <InkCanvas
                store={store}
                editor={editor}
                id={id}
                active={active}
                width={DRAWING_WIDTH}
                height={shownHeight}
                rawStrokes={rawStrokes}
                latestStrokes={() => savedNode()?.node.attrs.strokes ?? rawStrokes}
                save={save}
                containerRef={wrapperRef}
                actionsRef={canvasActions}
                className="note-drawing-surface"
                svgStyle={{ aspectRatio: `${DRAWING_WIDTH} / ${shownHeight}` }}
                onScale={setScale}
            />

            {!active && strokeCount === 0 && <span className="note-drawing-empty">Empty drawing. Tap to draw.</span>}
            {active && strokeCount === 0 && <span className="note-drawing-empty" aria-hidden="true">Draw here</span>}

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
