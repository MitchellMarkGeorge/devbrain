import { EditorContent as TiptapEditorContent, useEditor, type Editor } from '@tiptap/react';
import { EditorContent } from '../components';
import { Placeholder } from '@tiptap/extensions';
import { useEffect, useRef, useState } from 'react';
import { CalloutView } from './CalloutView';
import { EditorHostContext, EntityLinkView, ImageLinkView } from './EntityPillView';
import { FormatBubble } from './FormatBubble';
import { MarkdownClipboard } from './extensions/clipboard';
import { EditorHostExtension, setEditorHost } from './extensions/editor-host';
import { createDocumentExtensions } from './markdown';
import { EntityMenu } from './suggestion/entity-menu';
import { SlashMenu } from './suggestion/slash-menu';
import type { EditorHost } from './types';
import styles from './RichTextEditor.module.css';

/**
 * DevBrain's rich text editor: markdown in, markdown out. Used for note bodies, task, project and
 * event descriptions, and (read-only) synced descriptions.
 *
 * - `value` is the markdown as stored. `onChange` hears the markdown after each edit, and never on
 *   load: opening a note and closing it again leaves its file alone. Undoing back to the start
 *   gives back `value` exactly, not the editor's own spelling of it.
 * - A new `value` from outside (the file changed on disk, a sync) replaces the content unless it is
 *   what the editor last sent.
 * - Links open through `onOpenUrl` (safe http/https only), with ⌘/Ctrl-click while editing and a
 *   plain click when read-only. Entity pills open through `onOpenEntity`.
 */

export interface RichTextEditorProps extends EditorHost {
  value: string;
  onChange?: (markdown: string) => void;
  editable?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  // the accessible name, such as "Note" or "Description"
  label: string;
  className?: string;
  // the editor, for a toolbar or tests
  onReady?: (editor: Editor) => void;
}

export function RichTextEditor({
  value,
  onChange,
  editable = true,
  placeholder = 'Start writing, or press / for commands…',
  autoFocus = false,
  label,
  className,
  onReady,
  ...host
}: RichTextEditorProps) {
  // built once: the placeholder is fixed for an editor's life
  const [extensions] = useState(() => [
    ...createDocumentExtensions({
      entityLink: EntityLinkView,
      imageLink: ImageLinkView,
      callout: CalloutView,
    }),
    EditorHostExtension,
    MarkdownClipboard,
    Placeholder.configure({ placeholder }),
    SlashMenu,
    EntityMenu,
  ]);
  // the markdown the editor holds as `value` gave it, and the value it came from
  const baseline = useRef<{ value: string; markdown: string } | null>(null);
  // the markdown the content stands for: `value` as loaded, or the last sent through onChange, so
  // the parent passing it back is not loaded again
  const shown = useRef(value);

  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    editable,
    autofocus: autoFocus ? 'end' : false,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        class: styles.content,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        spellcheck: 'true',
      },
    },
  });

  // the parts inside the editor (the "@" menu, link clicks) read the host from its storage
  useEffect(() => {
    setEditorHost(editor, host);
  });

  useEffect(() => {
    const send = () => {
      const markdown = editor.getMarkdown();
      // back to how it was loaded: the stored text, unchanged
      const next = markdown === baseline.current?.markdown ? baseline.current.value : markdown;
      shown.current = next;
      onChange?.(next);
    };
    editor.on('update', send);
    return () => {
      editor.off('update', send);
    };
  }, [editor, onChange]);

  // a value from outside replaces the content, without counting as an edit
  useEffect(() => {
    if (value !== shown.current) {
      editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
      shown.current = value;
      baseline.current = null;
    }
    baseline.current ??= { value, markdown: editor.getMarkdown() };
  }, [editor, value]);

  useEffect(() => {
    onReady?.(editor);
  }, [editor, onReady]);

  useEffect(() => {
    editor.setEditable(editable, false);
  }, [editor, editable]);

  return (
    <EditorHostContext.Provider value={host}>
      <EditorContent className={className} data-readonly={editable ? undefined : ''}>
        <TiptapEditorContent editor={editor} />
      </EditorContent>
      {editable && <FormatBubble editor={editor} onOpenUrl={host.onOpenUrl} />}
    </EditorHostContext.Provider>
  );
}
