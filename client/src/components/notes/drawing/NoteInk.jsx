import { useEffect, useRef, useState } from 'react';
import { closeHistory } from '@tiptap/pm/history';
import { useDrawingState } from './drawingStore';
import InkCanvas from './InkCanvas';
import { cleanList } from './strokeCache';
import { contentBottom } from './geometry';
import { SNAPSHOT_VERSION, hashString, snapshotPages } from './pageSnapshot';

// Handwriting over the whole note: the pen writes on the page itself, next to and on top
// of the typed text, rather than in a separate drawing block.
//
// So the writing stays where it was put, the note is laid out like a sheet of paper:
// PAGE_WIDTH wide on every device. Where the column is narrower (tablets in portrait,
// phones), a note with handwriting is zoomed to fit instead of rewrapping its text.
// Notes without handwriting rewrap as usual and only become a fixed page once you start
// writing. Ink coordinates are page pixels; highlights sit under the text, pen over it.
//
// Stored on the document node as `ink: { width, strokes, pages, pagesFor }` (see
// NoteDocument in editorExtensions.js), so it saves and undoes with the note. `pages` are
// attachment ids of pictures of the note as written (pageSnapshot.js) for the cloud
// backup, and `pagesFor` a hash of the note they show, so they're only retaken after a change.

const SNAPSHOT_IDLE_MS = 15000;

export const PAGE_WIDTH = 760;
const PAGE_ID = 'page';
const NONE = [];

function NoteInk({ editor, onUpload, children }) {
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
        const ink = next.length ? { ...editor.state.doc.attrs.ink, width: PAGE_WIDTH, strokes: next } : null;
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

    // ---------- Page pictures for the backup ----------

    // A hash of the note (text and handwriting, not the pictures themselves), or null
    // when there's no handwriting to picture.
    function fingerprint() {
        const json = editor.getJSON();
        const ink = json.attrs?.ink;
        if (!ink?.strokes?.length) return null;
        const rest = { ...ink };
        delete rest.pages;
        delete rest.pagesFor;
        return hashString(`${SNAPSHOT_VERSION}:${JSON.stringify({ ...json, attrs: { ...json.attrs, ink: rest } })}`);
    }

    const snapshot = useRef({ timer: 0, running: false, take: null, upload: onUpload });
    snapshot.current.upload = onUpload;
    snapshot.current.take = async function take() {
        const s = snapshot.current;
        if (s.running || editor.isDestroyed || !pageRef.current || !s.upload) return;
        if (store.getState().activeId === PAGE_ID) return; // retaken once writing is done
        const fp = fingerprint();
        if (!fp || editor.state.doc.attrs.ink?.pagesFor === fp) return;
        // The ink layer appears a moment after the note opens; wait for it.
        if (!pageRef.current.querySelector('svg.note-ink path.dw-stroke[d]:not([d=""])')) {
            clearTimeout(s.timer);
            s.timer = setTimeout(() => s.take(), 1000);
            return;
        }
        s.running = true;
        try {
            const files = await snapshotPages(pageRef.current, PAGE_WIDTH);
            const ids = [];
            for (const file of files) ids.push((await s.upload(file)).id);
            const current = editor.isDestroyed ? null : editor.state.doc.attrs.ink;
            if (!current?.strokes?.length) return;
            // Not an undo step: it's bookkeeping, not something the student did.
            const tr = editor.state.tr.setDocAttribute('ink', { ...current, pages: ids, pagesFor: fp }).setMeta('addToHistory', false);
            editor.view.dispatch(tr);
        } catch (err) {
            // The backup then says to open the note; the next change tries again.
            console.warn("Couldn't save the page pictures for the backup.", err);
        } finally {
            s.running = false;
        }
    };

    // Retaken a little after the note stops changing, and soon after opening a note whose
    // pictures are out of date.
    useEffect(() => {
        const s = snapshot.current;
        const schedule = (delay = SNAPSHOT_IDLE_MS) => {
            clearTimeout(s.timer);
            s.timer = setTimeout(() => s.take(), delay);
        };
        const onUpdate = () => schedule();
        editor.on('update', onUpdate);
        schedule(3000);
        return () => {
            editor.off('update', onUpdate);
            clearTimeout(s.timer);
        };
    }, [editor]);

    // Done with writing: take them now.
    useEffect(() => {
        if (writing) return undefined;
        const timer = setTimeout(() => snapshot.current.take(), 800);
        return () => clearTimeout(timer);
    }, [writing]);

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
