import { useState } from 'react';
import { useDrawingState } from './drawingStore';
import {
    COLOR_NAMES, HIGHLIGHTER_COLORS, HIGHLIGHTER_SIZES, PEN_COLORS, PEN_SIZES, SIZE_NAMES,
} from './geometry';

// The note toolbar's drawing tools, shown in place of the text formatting while a
// drawing is being edited. Picking a colour or size with strokes selected changes them.

const ICONS = {
    pen: <path d="M4 20l4.2-1L19 8.2a2.1 2.1 0 0 0-3-3L5.1 16zM14.5 6.7l2.8 2.8" />,
    highlighter: <path d="M14.5 4.5l5 5-7.8 7.8H7.2v-4.5zM7.2 17.3L4 20.5h6M11.8 7.2l5 5" />,
    eraser: <path d="M9 20h11M4.6 15.4l9.8-9.8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H8.2a2 2 0 0 1-1.4-.6zM9.4 10.6l5 5" />,
    rect: <path d="M4 7V4h3M10 4h4M17 4h3v3M20 10v4M20 17v3h-3M14 20h-4M7 20H4v-3M4 14v-4" />,
    lasso: <path d="M8.5 15.6C5.8 14.7 4 12.9 4 10.8 4 7.6 7.6 5 12 5s8 2.6 8 5.8-3.6 5.8-8 5.8M9.5 13.8a2 2 0 1 0 0 3.8c0 1.6-.8 2.6-2 3.4" />,
    finger: <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10M12 9.5V4.5a1.5 1.5 0 0 1 3 0V10M15 10V6.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.6a6 6 0 0 1-4.9-2.6L3.3 15a1.5 1.5 0 0 1 2.4-1.8L9 16" />,
    trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
};

const TOOLS = [
    { tool: 'pen', label: 'Pen' },
    { tool: 'highlighter', label: 'Highlighter' },
    { tool: 'eraser', label: 'Eraser' },
    { tool: 'rect', label: 'Rectangle select' },
    { tool: 'lasso', label: 'Lasso select' },
];

function Icon({ name }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICONS[name]}
        </svg>
    );
}

function Tool({ label, active, onClick, children, className = '', disabled = false }) {
    return (
        <button
            type="button"
            className={`note-tool${active ? ' is-active' : ''} ${className}`.trim()}
            aria-label={label}
            title={label}
            aria-pressed={active}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function DrawingToolbar({ store }) {
    const s = useDrawingState(store);
    // Phones: colours and widths fold behind one button (see Drawing.css).
    const [styleOpen, setStyleOpen] = useState(false);
    const selecting = s.tool === 'rect' || s.tool === 'lasso';
    // Which colours and sizes to offer: the pen's or highlighter's while drawing; while
    // selecting, those of what's selected.
    const kind = selecting ? s.selectionKind : (s.tool === 'pen' || s.tool === 'highlighter' ? s.tool : null);
    // With nothing to colour (eraser, or selecting with nothing selected) the pen's
    // colours stay in place, dimmed, so the toolbar (and the drawing under it) doesn't
    // jump as tools change.
    const off = !kind;
    const isPen = kind !== 'highlighter';
    const colors = isPen ? PEN_COLORS : HIGHLIGHTER_COLORS;
    const sizes = isPen ? PEN_SIZES : HIGHLIGHTER_SIZES;
    const currentColor = isPen ? s.penColor : s.highlighterColor;
    const currentSize = isPen ? s.penSize : s.highlighterSize;
    const showFinger = s.penSeen || window.matchMedia('(pointer: coarse)').matches;

    function pickColor(color) {
        setStyleOpen(false);
        store.set(isPen ? { penColor: color } : { highlighterColor: color });
        if (selecting) store.api?.recolor(color, kind);
    }

    function pickSize(index) {
        setStyleOpen(false);
        store.set(isPen ? { penSize: index } : { highlighterSize: index });
        if (selecting) store.api?.resize(index, kind);
    }

    return (
        <>
            <div className="note-tool-group" role="group" aria-label="Drawing tool">
                {TOOLS.map((t) => (
                    <Tool key={t.tool} label={t.label} active={s.tool === t.tool} onClick={() => store.set({ tool: t.tool })}>
                        <Icon name={t.tool} />
                    </Tool>
                ))}
            </div>

            <div className="note-tool-group dw-style-toggle-group">
                <button
                    type="button"
                    className="note-tool dw-style-toggle"
                    aria-label="Colour and width"
                    title="Colour and width"
                    aria-expanded={styleOpen}
                    disabled={off}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setStyleOpen((o) => !o)}
                >
                    <span className={`dw-swatch-dot dw-c-${currentColor}${isPen ? '' : ' is-highlighter'}`} aria-hidden="true" />
                </button>
            </div>

            <div className="note-tool-group dw-style dw-colors" role="group" aria-label={isPen ? 'Pen colour' : 'Highlighter colour'}>
                {colors.map((c) => (
                    <Tool
                        key={c}
                        label={`${COLOR_NAMES[c]}${isPen ? '' : ' highlighter'}`}
                        active={currentColor === c}
                        onClick={() => pickColor(c)}
                        className="dw-swatch"
                        disabled={off}
                    >
                        <span className={`dw-swatch-dot dw-c-${c}${isPen ? '' : ' is-highlighter'}`} aria-hidden="true" />
                    </Tool>
                ))}
            </div>

            {s.tool === 'eraser' ? (
                <div className="note-tool-group dw-eraser-modes" role="group" aria-label="What the eraser removes">
                    <Tool label="Erase only what's under the eraser" active={s.eraserMode === 'area'} onClick={() => store.set({ eraserMode: 'area' })} className="dw-mode">
                        <span className="note-tool-text">Area</span>
                    </Tool>
                    <Tool label="Erase whole strokes" active={s.eraserMode === 'stroke'} onClick={() => store.set({ eraserMode: 'stroke' })} className="dw-mode">
                        <span className="note-tool-text">Stroke</span>
                    </Tool>
                </div>
            ) : (
                <div className="note-tool-group dw-style" role="group" aria-label={isPen ? 'Pen width' : 'Highlighter width'}>
                    {sizes.map((size, i) => (
                        <Tool key={size} label={`${SIZE_NAMES[i]} ${isPen ? 'pen' : 'highlighter'}`} active={currentSize === i} disabled={off} onClick={() => pickSize(i)}>
                            <span className={`dw-size-dot dw-size-${i}${isPen ? '' : ' is-highlighter'}`} aria-hidden="true" />
                        </Tool>
                    ))}
                </div>
            )}

            <div className="note-tool-group">
                {showFinger && (
                    <Tool
                        label={s.fingerDraws ? 'Finger draws (tap so fingers scroll instead)' : 'Fingers scroll (tap to draw with a finger)'}
                        active={s.fingerDraws}
                        onClick={() => store.set({ fingerDraws: !s.fingerDraws })}
                    >
                        <Icon name="finger" />
                    </Tool>
                )}
                <Tool label="Delete drawing" active={false} onClick={() => store.api?.removeDrawing()}>
                    <Icon name="trash" />
                </Tool>
                <button type="button" className="dw-done" onMouseDown={(e) => e.preventDefault()} onClick={() => store.api?.finish()}>
                    Done
                </button>
            </div>
        </>
    );
}

export default DrawingToolbar;
