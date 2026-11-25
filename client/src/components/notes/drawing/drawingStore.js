import { useSyncExternalStore } from 'react';
import { HIGHLIGHTER_COLORS, PEN_COLORS } from './geometry';

// Shared state for the drawings in one note editor: which drawing is being edited (one
// at a time) and the "pen in hand": the tool, colours and sizes. The tool choice carries
// from one drawing to the next and is remembered on this device.
//
// The editing drawing registers `api` (its actions the toolbar calls: recolour or resize
// the selected strokes, delete the drawing, finish). See DrawingView.

const PREFS_KEY = 'doneyet:drawing-tools';
const TOOLS = ['pen', 'highlighter', 'eraser', 'rect', 'lasso'];

function loadPrefs() {
    try {
        const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
        return {
            tool: TOOLS.includes(saved.tool) ? saved.tool : 'pen',
            penColor: PEN_COLORS.includes(saved.penColor) ? saved.penColor : 'ink',
            penSize: [0, 1, 2].includes(saved.penSize) ? saved.penSize : 1,
            highlighterColor: HIGHLIGHTER_COLORS.includes(saved.highlighterColor) ? saved.highlighterColor : 'yellow',
            highlighterSize: [0, 1, 2].includes(saved.highlighterSize) ? saved.highlighterSize : 1,
            // Once a pen has been used here, fingers scroll instead of drawing (palm
            // rejection). Until then, or if turned back on, fingers draw.
            fingerDraws: saved.fingerDraws !== false,
            penSeen: saved.penSeen === true,
            // "area" erases only what's under the eraser; "stroke" removes whole strokes.
            eraserMode: saved.eraserMode === 'stroke' ? 'stroke' : 'area',
        };
    } catch {
        return { tool: 'pen', penColor: 'ink', penSize: 1, highlighterColor: 'yellow', highlighterSize: 1, fingerDraws: true, penSeen: false, eraserMode: 'area' };
    }
}

export function createDrawingStore() {
    let state = { ...loadPrefs(), activeId: null, activeKind: null, selectionKind: null };
    const listeners = new Set();
    let api = null;
    let pendingActivate = 0;

    function save() {
        const { tool, penColor, penSize, highlighterColor, highlighterSize, fingerDraws, penSeen, eraserMode } = state;
        // A selection tool isn't remembered: the next drawing starts with something that draws.
        const kept = tool === 'rect' || tool === 'lasso' || tool === 'eraser' ? 'pen' : tool;
        try {
            localStorage.setItem(PREFS_KEY, JSON.stringify({ tool: kept, penColor, penSize, highlighterColor, highlighterSize, fingerDraws, penSeen, eraserMode }));
        } catch {
            // Private mode: the choice just isn't remembered.
        }
    }

    return {
        getState: () => state,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        set(patch) {
            state = { ...state, ...patch };
            if (Object.keys(patch).some((k) => !['activeId', 'activeKind', 'selectionKind'].includes(k))) save();
            listeners.forEach((l) => l());
        },
        get api() {
            return api;
        },
        // kind: 'drawing' (a drawing block) or 'page' (writing over the whole note).
        activate(id, viewApi, kind = 'drawing') {
            api = viewApi;
            this.set({ activeId: id, activeKind: kind, selectionKind: null });
        },
        deactivate(id) {
            if (state.activeId !== id) return;
            api = null;
            this.set({ activeId: null, activeKind: null, selectionKind: null });
        },
        // A drawing that appears within a moment of this (the one just inserted) opens
        // for editing. A time window rather than a one-off flag, because React mounts a
        // node view twice in development.
        requestActivate() {
            pendingActivate = Date.now();
        },
        isActivatePending: () => Date.now() - pendingActivate < 1000,
        // Set by the note's handwriting layer (NoteInk): starts writing on the note.
        openPage: null,
    };
}

export function useDrawingState(store) {
    return useSyncExternalStore(store.subscribe, store.getState);
}
