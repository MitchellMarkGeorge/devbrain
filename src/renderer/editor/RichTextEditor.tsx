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
import { createDocumentExtensions } from './markdown';
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
 *   file alone. Undoing back to the start gives back `initialValue` exactly, not the editor's own
 *   spelling of it.
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
   * is still what it loaded (opened, or undone back to it); the editor's own markdown once edited.
   * It is what `onChange` sends.
   */
  markdown(): string;
}

// the text last loaded, as stored, and the editor's own markdown for it (see `baseline` below)
interface Baseline {
  value: string;
  markdown: string;
}

// the markdown the content stands for: the stored text while it is still what was loaded
function markdownOf(editor: Editor, baseline: Baseline | null): string {
  const markdown = editor.getMarkdown();
  return markdown === baseline?.markdown ? baseline.value : markdown;
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

    // The text last loaded, as stored, and the editor's own markdown for it. Markdown has several
    // spellings for one thing (`* one` and `- one`), and the editor writes back only its own, so
    // while the content is still what it loaded (opened, or undone back to it) it stands for the
    // stored text: a note only opened, or edited and undone, is saved as it was (docs/editor.md,
    // "What a save changes"). Read in effects and the handle, never while rendering.
    const baseline = useRef<Baseline | null>(null);
    // the first text, as loaded, before any edit can be sent; set once, so a later `initialValue`
    // changes nothing
    useEffect(() => {
      baseline.current ??= { value: initialValue, markdown: editor.getMarkdown() };
    }, [editor, initialValue]);

    useImperativeHandle(
      ref,
      () => ({
        load(text) {
          editor.commands.setContent(editor.storage.documentMarkdown.codec.parseDocument(text), {
            emitUpdate: false,
          });
          editor.view.dispatch(closeHistory(editor.state.tr));
          baseline.current = { value: text, markdown: editor.getMarkdown() };
        },
        markdown: () => markdownOf(editor, baseline.current),
      }),
      [editor],
    );

    useEffect(() => {
      // back to how it was loaded, it sends the stored text, unchanged
      const send = () => onChange?.(markdownOf(editor, baseline.current));
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
