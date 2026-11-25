import { useEffect, useRef, useState } from 'react';
import { closeHistory } from '@tiptap/pm/history';
import { useDrawingState } from './drawingStore';
import InkCanvas from './InkCanvas';
import { cleanList } from './strokeCache';
import { contentBottom } from './geometry';

// Handwriting over the whole note: the pen writes on the page itself, next to and on top
// of the typed text, rather than in a separate drawing block.
//
// So the writing stays where it was put, the note is laid out like a sheet of paper:
// PAGE_WIDTH wide on every device. Where the column is narrower (tablets in portrait,
// phones), a note with handwriting is zoomed to fit instead of rewrapping its text.
// Notes without handwriting rewrap as usual and only become a fixed page once you start
// writing. Ink coordinates are page pixels; highlights sit under the text, pen over it.
//
// Stored on the document node as `ink: { width, strokes }` (see NoteDocument in
// editorExtensions.js), so it saves and undoes with the note.

export const PAGE_WIDTH = 760;
const PAGE_ID = 'page';
const NONE = [];

function NoteInk({ editor, children }) {
    const store = editor.storage.drawing.store;
    const tools = useDrawingState(store);
    const writing = tools.activeId === PAGE_ID;
    const rawStrokes = editor.state.doc.attrs.ink?.strokes ?? NONE;
    const paged = rawStrokes.length > 0 || writing;

    const frameRef = useRef(null);
    const pageRef = useRef(null);
    const canvasActions = useRef({});
    const [frameWidth, setFrameWidth] = useState(PAGE_WIDTH);
    const [pageHeight, setPageHeight] = useState(0);

    // The column's width decides the zoom; the page's height sizes the ink layer.
    useEffect(() => {
        const frame = frameRef.current;
        const page = pageRef.current;
        if (!frame || !page) return undefined;
        const observer = new ResizeObserver(() => {
            setFrameWidth(frame.clientWidth || PAGE_WIDTH);
            const rect = page.getBoundingClientRect();
            if (rect.width) setPageHeight(Math.ceil(rect.height / (rect.width / PAGE_WIDTH)));
        });
        observer.observe(frame);
        observer.observe(page);
        return () => observer.disconnect();
    }, []);

    function save(next) {
        const ink = next.length ? { width: PAGE_WIDTH, strokes: next } : null;
        editor.view.dispatch(closeHistory(editor.state.tr.setDocAttribute('ink', ink)));
    }

    function activate() {
        const api = {
            removeDrawing: () => save([]),
            finish: () => store.deactivate(PAGE_ID),
        };
        for (const name of ['recolor', 'resize', 'duplicate', 'deleteSelection', 'selectAll', 'clearSelection']) {
            api[name] = (...args) => canvasActions.current[name]?.(...args);
        }
        store.activate(PAGE_ID, api, 'page');
        // Writing shouldn't bring up the on-screen keyboard or leave a caret blinking.
        if (editor.view.dom.contains(document.activeElement)) editor.view.dom.blur();
    }
    store.openPage = activate;

    useEffect(() => () => store.deactivate(PAGE_ID), [store]);

    const zoom = paged ? Math.min(1, frameWidth / PAGE_WIDTH) : 1;
    // Room below the last writing; more while writing, to keep going down the page.
    const minHeight = paged ? Math.ceil(contentBottom(cleanList(rawStrokes)) + (writing ? 480 : 24)) : undefined;
    const classes = ['note-page'];
    if (paged) classes.push('is-paged');
    if (writing) classes.push('is-writing', `tool-${tools.tool}`);
    if (writing && tools.fingerDraws) classes.push('finger-draws');

    return (
        <div ref={frameRef} className="note-page-frame">
            <div ref={pageRef} className={classes.join(' ')} style={{ zoom: zoom === 1 ? undefined : zoom, minHeight }}>
                {children}
                {paged && pageHeight > 0 && (
                    <InkCanvas
                        layered
                        store={store}
                        editor={editor}
                        id={PAGE_ID}
                        active={writing}
                        width={PAGE_WIDTH}
                        height={pageHeight}
                        rawStrokes={rawStrokes}
                        latestStrokes={() => editor.state.doc.attrs.ink?.strokes ?? NONE}
                        save={save}
                        containerRef={pageRef}
                        actionsRef={canvasActions}
                        className="note-ink"
                    />
                )}
            </div>
        </div>
    );
}

export default NoteInk;
