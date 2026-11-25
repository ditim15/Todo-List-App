import { Node, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import DrawingView from './DrawingView';
import { createDrawingStore } from './drawingStore';
import { DEFAULT_HEIGHT, cleanHeight, cleanStrokes } from './geometry';

// A drawing block in a note: handwriting, sketches and highlights, drawn with a pen,
// mouse or finger. It's an ordinary block of the note's document, so it saves, undoes,
// moves and copies like the rest of the note. See geometry.js for the stored format.
const Drawing = Node.create({
    name: 'drawing',
    group: 'block',
    atom: true,
    selectable: true,
    draggable: false,

    addStorage() {
        return { store: createDrawingStore() };
    },

    addAttributes() {
        return {
            height: {
                default: DEFAULT_HEIGHT,
                parseHTML: (el) => cleanHeight(el.getAttribute('data-height')),
                renderHTML: (attrs) => ({ 'data-height': attrs.height }),
            },
            strokes: {
                default: [],
                parseHTML: (el) => {
                    try {
                        return cleanStrokes(JSON.parse(el.getAttribute('data-strokes') ?? '[]'));
                    } catch {
                        return [];
                    }
                },
                renderHTML: (attrs) => ({ 'data-strokes': JSON.stringify(attrs.strokes ?? []) }),
            },
        };
    },

    parseHTML() {
        return [{ tag: 'div[data-drawing]' }];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-drawing': '', class: 'note-drawing' })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(DrawingView, {
            className: 'note-drawing-node',
            // The drawing handles its own pointer and key events; the editor would
            // otherwise treat a stroke as a text selection or a drag.
            stopEvent: () => true,
            ignoreMutation: () => true,
        });
    },
});

export default Drawing;
