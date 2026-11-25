import { useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { FILE_TYPES, IMAGE_TYPES, MAX_FILE_BYTES, noteExtensions } from './editorExtensions';
import DrawingToolbar from './drawing/DrawingToolbar';
import NoteInk from './drawing/NoteInk';
import { useDrawingState } from './drawing/drawingStore';

// Small inline icons for the toolbar (decorative; buttons carry aria-labels).
const ICONS = {
    bold: <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />,
    italic: <path d="M10 5h8M6 19h8M14 5l-4 14" />,
    underline: <path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" />,
    strike: <path d="M5 12h14M16 6.5A4 4 0 0 0 12.5 5h-1A3.5 3.5 0 0 0 8 8.5c0 1.6 1 2.6 3 3.2M8 17.5A4 4 0 0 0 11.5 19h1a3.5 3.5 0 0 0 3.5-3.5c0-.6-.1-1.1-.4-1.5" />,
    bullet: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
    ordered: <path d="M10 6h10M10 12h10M10 18h10M4 5h1v4M4 9h2M4 15.5a1 1 0 0 1 2 0c0 1-2 1.5-2 3h2" />,
    check: <path d="M4 5h4v4H4zM4 15h4v4H4zM11 7h9M11 17h9M5 7l1 1 2-2.5" />,
    quote: <path d="M6 17h3l2-4V7H5v6h3zM14 17h3l2-4V7h-6v6h3z" />,
    code: <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />,
    link: <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />,
    image: <path d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5h.01" />,
    file: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4" />,
    write: <path d="M4 20l4.2-1L19 8.2a2.1 2.1 0 0 0-3-3L5.1 16zM14.5 6.7l2.8 2.8M13 20h7" />,
    drawing: <path d="M3 17.5c2.2-4.6 4.6-7.6 6.6-6.4 2.4 1.4-2.2 5.8.2 6.9 2 .9 4.2-3.7 6.3-6.6M14.8 7.2l2-2a1.8 1.8 0 0 1 2.6 2.6l-2 2M14.8 7.2l2.6 2.6M14.8 7.2l-3.4 3.4-.6 3.2 3.2-.6 3.4-3.4" />,
    undo: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
    redo: <path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />,
};

function Icon({ name }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ICONS[name]}
        </svg>
    );
}

function ToolButton({ label, icon, text, active = false, disabled = false, onClick }) {
    return (
        <button
            type="button"
            className={`note-tool${active ? ' is-active' : ''}`}
            aria-label={label}
            title={label}
            aria-pressed={active}
            disabled={disabled}
            // Keep the editor's selection when the button is pressed.
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
        >
            {icon ? <Icon name={icon} /> : <span className="note-tool-text">{text}</span>}
        </button>
    );
}

function Toolbar({ editor, onPickImage, onPickFile, isUploading }) {
    const chain = () => editor.chain().focus();
    const drawings = editor.storage.drawing.store;
    const { activeId } = useDrawingState(drawings);

    // Adds a drawing where the cursor is and opens it for drawing. Not focusing the
    // text first, so a phone or tablet doesn't bring up its keyboard.
    function insertDrawing() {
        drawings.requestActivate();
        editor.chain().insertContent({ type: 'drawing' }).run();
        const { selection } = editor.state;
        // Leave a line after the drawing to keep typing on.
        if (selection.node?.type.name === 'drawing' && !selection.$to.nodeAfter) {
            editor.chain().insertContentAt(selection.to, { type: 'paragraph' }).run();
        }
    }

    // While a drawing is open, the toolbar holds its tools instead of text formatting.
    if (activeId) {
        return (
            <div className="note-toolbar note-toolbar--drawing" role="toolbar" aria-label="Drawing tools">
                <DrawingToolbar store={drawings} />
                <div className="note-tool-group note-tool-group--end">
                    <ToolButton label="Undo" icon="undo" disabled={!editor.can().undo()} onClick={() => editor.commands.undo()} />
                    <ToolButton label="Redo" icon="redo" disabled={!editor.can().redo()} onClick={() => editor.commands.redo()} />
                </div>
            </div>
        );
    }

    function setLink() {
        const previous = editor.getAttributes('link').href ?? '';
        const url = window.prompt('Link address (https://…)', previous);
        if (url === null) return;
        if (url.trim() === '') {
            chain().extendMarkRange('link').unsetLink().run();
            return;
        }
        const href = /^(https?:\/\/|mailto:)/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
        chain().extendMarkRange('link').setLink({ href }).run();
    }

    return (
        <div className="note-toolbar" role="toolbar" aria-label="Formatting">
            <div className="note-tool-group">
                <ToolButton label="Heading 1" text="H1" active={editor.isActive('heading', { level: 1 })} onClick={() => chain().toggleHeading({ level: 1 }).run()} />
                <ToolButton label="Heading 2" text="H2" active={editor.isActive('heading', { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
                <ToolButton label="Heading 3" text="H3" active={editor.isActive('heading', { level: 3 })} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
            </div>
            <div className="note-tool-group">
                <ToolButton label="Bold" icon="bold" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()} />
                <ToolButton label="Italic" icon="italic" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()} />
                <ToolButton label="Underline" icon="underline" active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()} />
                <ToolButton label="Strikethrough" icon="strike" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()} />
            </div>
            <div className="note-tool-group">
                <ToolButton label="Bulleted list" icon="bullet" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()} />
                <ToolButton label="Numbered list" icon="ordered" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()} />
                <ToolButton label="Checklist" icon="check" active={editor.isActive('taskList')} onClick={() => chain().toggleTaskList().run()} />
                <ToolButton label="Quote" icon="quote" active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()} />
                <ToolButton label="Code block" icon="code" active={editor.isActive('codeBlock')} onClick={() => chain().toggleCodeBlock().run()} />
            </div>
            <div className="note-tool-group">
                <ToolButton label="Link" icon="link" active={editor.isActive('link')} onClick={setLink} />
                <ToolButton label="Add image" icon="image" disabled={isUploading} onClick={onPickImage} />
                <ToolButton label="Attach PDF" icon="file" disabled={isUploading} onClick={onPickFile} />
                <ToolButton label="Write on the note" icon="write" onClick={() => drawings.openPage?.()} />
                <ToolButton label="Add drawing space" icon="drawing" onClick={insertDrawing} />
            </div>
            <div className="note-tool-group note-tool-group--end">
                <ToolButton label="Undo" icon="undo" disabled={!editor.can().undo()} onClick={() => chain().undo().run()} />
                <ToolButton label="Redo" icon="redo" disabled={!editor.can().redo()} onClick={() => chain().redo().run()} />
            </div>
        </div>
    );
}

// Rich-text editor for one note. `onChange(doc)` gets the document (Tiptap JSON) after
// every edit; the page debounces saving. `onUpload(file)` stores a file and resolves to
// the attachment ({ id, url, filename, size_bytes, mime_type }). Re-mount it (key) to
// show a different note.
function NoteEditor({ initialContent, onChange, onUpload, editorRef }) {
    const imageInput = useRef(null);
    const fileInput = useRef(null);
    const [uploading, setUploading] = useState(0);
    const [uploadError, setUploadError] = useState('');
    // The editor's own handlers are created once, so they read the latest upload
    // function through a ref.
    const insertRef = useRef(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const editor = useEditor({
        extensions: noteExtensions(),
        content: initialContent,
        // Re-render on every change so the toolbar's active/undo states stay current
        // (Tiptap 3 no longer does this by default).
        shouldRerenderOnTransaction: true,
        immediatelyRender: true,
        onUpdate: ({ editor: e }) => onChangeRef.current(e.getJSON()),
        editorProps: {
            attributes: { class: 'note-editor-content', 'aria-label': 'Note text', role: 'textbox', 'aria-multiline': 'true' },
            handlePaste: (view, event) => {
                const files = Array.from(event.clipboardData?.files ?? []);
                if (files.length === 0) return false;
                insertRef.current?.(files);
                return true;
            },
            handleDrop: (view, event, slice, moved) => {
                const files = Array.from(event.dataTransfer?.files ?? []);
                if (moved || files.length === 0) return false;
                const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
                insertRef.current?.(files, pos);
                return true;
            },
            // Links inside an editable area don't open on click, so file chips do it here.
            handleClickOn: (view, pos, node) => {
                if (node.type.name === 'fileAttachment' && node.attrs.href) {
                    window.open(node.attrs.href, '_blank', 'noopener,noreferrer');
                    return true;
                }
                return false;
            },
        },
    });

    async function insertFiles(files, pos) {
        setUploadError('');
        for (const file of files) {
            const isImage = IMAGE_TYPES.includes(file.type);
            const isFile = FILE_TYPES.includes(file.type);
            if (!isImage && !isFile) {
                setUploadError(`"${file.name}" can't be added. Images (PNG, JPEG, GIF, WebP) and PDFs only.`);
                continue;
            }
            if (file.size > MAX_FILE_BYTES) {
                setUploadError(`"${file.name}" is over 10 MB.`);
                continue;
            }
            setUploading((n) => n + 1);
            try {
                const attachment = await onUpload(file);
                const node = isImage
                    ? { type: 'image', attrs: { src: attachment.url, alt: attachment.filename, attachmentId: attachment.id } }
                    : {
                        type: 'fileAttachment',
                        attrs: {
                            href: attachment.url,
                            attachmentId: attachment.id,
                            filename: attachment.filename,
                            size: attachment.size_bytes,
                            mimeType: attachment.mime_type,
                        },
                    };
                const chain = editor.chain().focus();
                (pos !== undefined ? chain.insertContentAt(pos, node) : chain.insertContent(node)).run();
                // An inserted image/file ends up selected; typing (or the next file)
                // would replace it. Move the cursor to a new line below it instead.
                if (editor.state.selection.node) editor.commands.createParagraphNear();
            } catch (err) {
                setUploadError(err.message || `Couldn't upload "${file.name}".`);
            } finally {
                setUploading((n) => n - 1);
            }
        }
    }
    insertRef.current = insertFiles;
    // Lets the page move the cursor into the body (e.g. Enter in the title).
    if (editorRef) editorRef.current = editor;

    function onPicked(e) {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (files.length > 0) insertFiles(files);
    }

    if (!editor) return null;

    return (
        <div className="note-editor">
            <Toolbar
                editor={editor}
                isUploading={uploading > 0}
                onPickImage={() => imageInput.current?.click()}
                onPickFile={() => fileInput.current?.click()}
            />
            <input ref={imageInput} type="file" accept={IMAGE_TYPES.join(',')} multiple hidden onChange={onPicked} />
            <input ref={fileInput} type="file" accept={FILE_TYPES.join(',')} multiple hidden onChange={onPicked} />
            {(uploading > 0 || uploadError) && (
                <p className={`note-upload-status${uploadError ? ' is-error' : ''}`} role={uploadError ? 'alert' : 'status'}>
                    {uploading > 0 ? `Uploading ${uploading} file${uploading > 1 ? 's' : ''}…` : uploadError}
                </p>
            )}
            <NoteInk editor={editor}>
                <EditorContent editor={editor} />
            </NoteInk>
        </div>
    );
}

export default NoteEditor;
