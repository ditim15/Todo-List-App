import { Node, mergeAttributes } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import Drawing from './drawing/drawingExtension';

export function formatFileSize(bytes) {
    if (!Number.isFinite(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// A node attribute (`key`) written to the DOM as data-<domName>, so it survives
// copy/paste between notes.
const dataAttribute = (key, domName, parse = (v) => v) => ({
    default: null,
    parseHTML: (el) => {
        const value = el.getAttribute(`data-${domName}`);
        return value === null ? null : parse(value);
    },
    renderHTML: (attrs) => (attrs[key] === null || attrs[key] === undefined ? {} : { [`data-${domName}`]: attrs[key] }),
});

// Images remember which uploaded attachment they show; the server swaps in a fresh
// signed link (src) each time the note loads.
const NoteImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            attachmentId: dataAttribute('attachmentId', 'attachment-id', Number),
        };
    },
}).configure({ inline: false, allowBase64: false });

// A PDF (or other file) shown as a chip with its name and size. Clicking it opens the
// file in a new tab (see handleClickOn in NoteEditor).
const FileAttachment = Node.create({
    name: 'fileAttachment',
    group: 'block',
    atom: true,
    draggable: true,
    selectable: true,

    addAttributes() {
        return {
            attachmentId: dataAttribute('attachmentId', 'attachment-id', Number),
            href: { default: null, parseHTML: (el) => el.getAttribute('href'), renderHTML: (a) => (a.href ? { href: a.href } : {}) },
            filename: dataAttribute('filename', 'filename'),
            size: dataAttribute('size', 'size', Number),
            mimeType: dataAttribute('mimeType', 'mime-type'),
        };
    },

    parseHTML() {
        return [{ tag: 'a[data-file-attachment]' }];
    },

    renderHTML({ node, HTMLAttributes }) {
        const isPdf = node.attrs.mimeType === 'application/pdf';
        return [
            'a',
            mergeAttributes(HTMLAttributes, {
                'data-file-attachment': '',
                class: 'note-file',
                target: '_blank',
                rel: 'noopener noreferrer',
                contenteditable: 'false',
                title: `Open ${node.attrs.filename ?? 'file'}`,
            }),
            ['span', { class: 'note-file-badge' }, isPdf ? 'PDF' : 'FILE'],
            ['span', { class: 'note-file-name' }, node.attrs.filename ?? 'File'],
            ['span', { class: 'note-file-size' }, formatFileSize(node.attrs.size)],
        ];
    },
});

export function noteExtensions() {
    return [
        // StarterKit (v3) includes underline and links, configured here.
        StarterKit.configure({
            heading: { levels: [1, 2, 3] },
            link: {
                openOnClick: false,
                autolink: true,
                linkOnPaste: true,
                defaultProtocol: 'https',
                // Only web and mail links; never javascript: and friends.
                isAllowedUri: (url, ctx) => ctx.defaultValidate(url) && /^(https?:\/\/|mailto:)/i.test(url),
                HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
            },
        }),
        Placeholder.configure({ placeholder: 'Start typing, or paste an image or PDF…' }),
        TaskList,
        TaskItem.configure({ nested: true }),
        NoteImage,
        FileAttachment,
        Drawing,
    ];
}

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const FILE_TYPES = ['application/pdf'];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
