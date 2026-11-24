import { EditorContent as TiptapEditorContent, useEditor, type Editor } from '@tiptap/react';
import { EditorContent } from '@renderer/components';
import { Placeholder } from '@tiptap/extensions';
import { closeHistory } from '@tiptap/pm/history';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { CalloutView } from './CalloutView';
import { CodeBlockView } from './CodeBlockView';
import { TaskItemView } from './TaskItemView';
import { EditorHostContext, EntityLinkView, ImageLinkView } from './EntityPillView';
import { FormatBubble } from './FormatBubble';
import { MarkdownClipboard } from './extensions/clipboard';
import { EditorHostExtension, setEditorHost } from './extensions/editor-host';
import {
  createDocumentExtensions,
  editorMarkdown,
  readEditorSource,
  type MarkdownSource,
} from './markdown';
import { EntityMenu } from './suggestion/entity-menu';
import { SlashMenu } from './suggestion/slash-menu';
import type { EditorHost, EntityLinkPill } from './types';
import styles from './RichTextEditor.module.css';

/**
 * DevBrain's rich text editor: markdown in, markdown out. Used for note bodies, task, project and
 * event descriptions, and (read-only) synced descriptions.
 *
 * - `initialValue` is the markdown as stored, read once, when the editor is made: the editor holds
 *   its text from then on, and a later `initialValue` changes nothing. `onChange` hears the
 *   markdown after each edit, and never on load: opening a note and closing it again leaves its
 *   file alone. The markdown it sends keeps each block unchanged since it was loaded as it was
 *   written there, and writes only the edited blocks in the editor's own spelling: undoing back to
 *   the start gives back `initialValue` exactly.
 * - A text from outside (a sync, a reattach) is loaded through the editor's handle, its `ref`
 *   (`RichTextEditorHandle.load`), which `onChange` doesn't hear either. In the app
 *   `useEditorAutosave` does it, for a change its content query reports (docs/editor.md).
 * - Links open through `onOpenUrl` (safe http/https only), with ⌘/Ctrl-click while editing and a
 *   plain click when read-only. Entity pills open through `onOpenEntity`.
 * - Each entity link is drawn by `entityPill`, which finds its entity (the app's reads React
 *   Query); without one, a pill shows the label stored in the markdown.
 */

export interface RichTextEditorProps extends EditorHost {
  // the text it starts with, read once
  initialValue: string;
  onChange?: (markdown: string) => void;
  editable?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  // the accessible name, such as "Note" or "Description"
  label: string;
  className?: string;
  // the editor, for a toolbar or tests
  onReady?: (editor: Editor) => void;
  // draws each entity link: it finds the entity and draws it with EditorEntityPill. Read once,
  // when the editor is made, like the placeholder.
  entityPill?: EntityLinkPill;
}

/** What a page does with its editor, through its `ref`. */
export interface RichTextEditorHandle {
  /**
   * Replaces the content with `markdown`, a text from outside the editor (a sync, a reattach),
   * without counting as an edit: `onChange` doesn't hear it. The next edit starts an undo step of
   * its own, and the blocks unchanged since are sent as `markdown` has them.
   */
  load(markdown: string): void;
  /**
   * The markdown the content stands for, as `onChange` sends it: each block unchanged since the
   * text last loaded as it was written there, the edited ones in the editor's spelling; the text
   * itself, exactly, while nothing changed (opened, or undone back to it).
   */
  markdown(): string;
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor(
    {
      initialValue,
      onChange,
      editable = true,
      placeholder = 'Start writing, or press / for commands…',
      autoFocus = false,
      label,
      className,
      onReady,
      entityPill,
      ...host
    }: RichTextEditorProps,
    ref,
  ) {
    // built once: the placeholder and the entity pill are fixed for an editor's life
    const [extensions] = useState(() => [
      ...createDocumentExtensions({
        entityLink: EntityLinkView.configure({ pill: entityPill }),
        imageLink: ImageLinkView,
        callout: CalloutView,
        codeBlock: CodeBlockView,
        taskItem: TaskItemView,
      }),
      EditorHostExtension,
      MarkdownClipboard,
      Placeholder.configure({ placeholder }),
      SlashMenu,
      EntityMenu,
    ]);
    const editor = useEditor({
      extensions,
      content: initialValue,
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

    // The text last loaded, block by block. Markdown has several spellings for one thing (`* one`
    // and `- one`) and the editor writes only its own, so a save writes the blocks unchanged since
    // as they were in that text, and only the edited ones in the editor's spelling: a note only
    // opened, or edited and undone, is saved as it was (docs/editor.md, "What a save changes").
    // Undefined until the first text is read; null when it couldn't be lined up with the document.
    // Read in effects and the handle, never while rendering.
    const source = useRef<MarkdownSource | null | undefined>(undefined);
    useEffect(() => {
      if (source.current === undefined) source.current = readEditorSource(editor, initialValue);
    }, [editor, initialValue]);

    useImperativeHandle(
      ref,
      () => ({
        load(text) {
          editor.commands.setContent(text, { contentType: 'markdown', emitUpdate: false });
          editor.view.dispatch(closeHistory(editor.state.tr));
          source.current = readEditorSource(editor, text);
        },
        markdown: () => editorMarkdown(editor, source.current ?? null),
      }),
      [editor],
    );

    useEffect(() => {
      const send = () => onChange?.(editorMarkdown(editor, source.current ?? null));
      editor.on('update', send);
      return () => {
        editor.off('update', send);
      };
    }, [editor, onChange]);

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
        {editable && (
          <FormatBubble
            editor={editor}
            onOpenUrl={host.onOpenUrl}
            canCreateTask={host.createTask !== undefined}
          />
        )}
      </EditorHostContext.Provider>
    );
  },
);
