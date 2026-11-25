import { EditorContent as TiptapEditorContent, useEditor, type Editor } from '@tiptap/react';
import { cn, EditorContent, toast } from '@renderer/components';
import { Placeholder } from '@tiptap/extensions';
import { closeHistory } from '@tiptap/pm/history';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { CalloutView } from './CalloutView';
import { CodeBlockView } from './CodeBlockView';
import { TaskItemView } from './TaskItemView';
import { EditorHostContext, EntityLinkView, ImageLinkView } from './EntityPillView';
import { FormatBubble } from './FormatBubble';
import { MarkdownClipboard } from './extensions/clipboard';
import { EditorHostExtension, setEditorHost } from './extensions/editor-host';
import { TableControlsExtension } from './extensions/table-controls';
import { createDocumentExtensions } from './markdown';
import type { MarkdownProblem } from './markdown/extension';
import { EntityMenu } from './suggestion/entity-menu';
import { SlashMenu } from './suggestion/slash-menu';
import { TableControls } from './TableControls';
import type { EditorHost, EntityLinkPill } from './types';
import styles from './RichTextEditor.module.css';

/**
 * DevBrain's rich text editor: markdown in, markdown out. Used for note bodies, task, project and
 * event descriptions, and (read-only) synced descriptions.
 *
 * - `initialValue` is the markdown as stored, read once, when the editor is made: the editor holds
 *   its text from then on, and a later `initialValue` changes nothing. `onChange` hears the
 *   markdown after each edit, and never on load: opening a note and closing it again leaves its
 *   file alone. An edit rewrites only the blocks it changed: the rest of the markdown is the
 *   stored text, as written (docs/editor.md, "What a save changes"). Undoing back to the start
 *   gives back `initialValue` exactly.
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
   * its own, and undoing back to `markdown` sends it exactly.
   */
  load(markdown: string): void;
  /**
   * The markdown the content stands for: the text last loaded, exactly as given, while the content
   * is still what it loaded (opened, or undone back to it); once edited, that text with the
   * blocks that changed written anew. It is what `onChange` sends.
   */
  markdown(): string;
}

// what the user is told when the markdown layer fails; the note's file is safe either way
const PROBLEM_TOASTS: Record<MarkdownProblem, { title: string; description: string }> = {
  unreadable: {
    title: 'This text can’t be shown as rich text',
    description: 'It’s shown as plain text and can’t be edited here. Nothing was changed.',
  },
  unsaveable: {
    title: 'Your last change couldn’t be saved',
    description: 'What was saved before is kept. Copy your changes before you leave.',
  },
};

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
      // after the menus, so ↵ in a cell picks a menu item while one is open
      TableControlsExtension,
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

    // The markdown the content stands for is the editor's to give (DocumentMarkdown): it holds
    // the text last loaded and writes the content keeping it, so a note only opened, or edited
    // and undone, is saved as it was, and an edit rewrites only its own blocks.
    useImperativeHandle(
      ref,
      () => ({
        load(text) {
          editor.commands.setContent(text, { contentType: 'markdown', emitUpdate: false });
          editor.view.dispatch(closeHistory(editor.state.tr));
        },
        markdown: () => editor.saveMarkdown(),
      }),
      [editor],
    );

    useEffect(() => {
      // back to how it was loaded, it sends the stored text, unchanged
      const send = () => onChange?.(editor.saveMarkdown());
      editor.on('update', send);
      return () => {
        editor.off('update', send);
      };
    }, [editor, onChange]);

    useEffect(() => {
      onReady?.(editor);
    }, [editor, onReady]);

    // A text the layer could not read is shown as plain text, read-only, and one it could not
    // write keeps its last saved text (DocumentMarkdown): either way the user is told once.
    const [problem, setProblem] = useState(() => editor.storage.documentMarkdown.problem);
    useEffect(() => {
      const storage = editor.storage.documentMarkdown;
      storage.onProblem = setProblem;
      return () => {
        storage.onProblem = null;
      };
    }, [editor]);
    useEffect(() => {
      if (problem) toast({ tone: 'error', timeout: 0, ...PROBLEM_TOASTS[problem] });
    }, [problem]);

    const canEdit = editable && problem !== 'unreadable';
    useEffect(() => {
      editor.setEditable(canEdit, false);
    }, [editor, canEdit]);

    return (
      <EditorHostContext.Provider value={host}>
        <EditorContent
          className={cn(styles.host, className)}
          data-readonly={canEdit ? undefined : ''}
        >
          <TiptapEditorContent editor={editor} />
          {canEdit && <TableControls editor={editor} />}
        </EditorContent>
        {canEdit && (
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
