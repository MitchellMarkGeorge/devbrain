import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useEffect, useState } from 'react';
import { safeExternalUrl } from '@common/safe-url';
import {
  BLOCK_TYPES,
  FormatToolbar,
  LinkToolbar,
  TurnIntoMenu,
  type FormatMark,
} from '../components';
import { applyBlockType, currentBlockType } from './block-types';
import {
  FORMAT_TOOLBAR_KEY,
  repositionFormatToolbar,
  setLinkEditing,
} from './extensions/editor-host';

/**
 * The design system's FormatToolbar over a text selection, 8px above it: the block type (opening
 * the TurnIntoMenu), then Bold, Italic, Underline, Strikethrough, Code and Link. Link, or ⌘K,
 * swaps it for the LinkToolbar, 4px under the selection. The colour button and Turn into task
 * are left out: notes have no text colours (they are not in the note format, docs/editor.md), and
 * the editor can't make tasks yet.
 *
 * It shows only while the editor (or the toolbar) has focus, for a text selection outside code;
 * a read-only editor has none.
 */

// the toolbar's marks, by their names in the editor
const MARK_NAMES: Record<FormatMark, string> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strikethrough: 'strike',
  code: 'code',
};

const MARKS = Object.keys(MARK_NAMES) as FormatMark[];

// a link as typed: a bare address ("example.com") is taken as https; null when it can't be opened
export function linkHref(typed: string): string | null {
  const value = typed.trim();
  if (!value) return null;
  return safeExternalUrl(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
}

export function FormatBubble({
  editor,
  onOpenUrl,
}: {
  editor: Editor;
  onOpenUrl?: (url: string) => void;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      marks: Object.fromEntries(MARKS.map((mark) => [mark, editor.isActive(MARK_NAMES[mark])])),
      blockType: currentBlockType(editor),
      href: (editor.getAttributes('link').href as string | undefined) ?? '',
      linkEditing: editor.storage.editorHost.linkEditing,
    }),
  });
  // the address being typed; set from the link each time the link editor opens
  const [draft, setDraft] = useState<string | null>(null);
  const linkValue = draft ?? state.href;

  // the link toolbar is wider than the format toolbar and sits under the selection
  useEffect(() => {
    repositionFormatToolbar(editor);
  }, [editor, state.linkEditing]);

  const closeLink = () => {
    setDraft(null);
    setLinkEditing(editor, false);
    editor.commands.focus();
  };

  const applyLink = (typed: string) => {
    if (!typed.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      closeLink();
      return;
    }
    const href = linkHref(typed);
    // an address that can't be opened stays in the field to be fixed
    if (!href) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    closeLink();
  };

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={FORMAT_TOOLBAR_KEY}
      options={
        state.linkEditing
          ? { placement: 'bottom-start', offset: 4, flip: true }
          : { placement: 'top', offset: 8, flip: true }
      }
      shouldShow={({ editor, view, state: editorState, element, from, to }) => {
        if (!editor.isEditable) return false;
        const focused = view.hasFocus() || element.contains(document.activeElement);
        if (!focused) return false;
        if (editor.storage.editorHost.linkEditing) return true;
        const { selection, doc } = editorState;
        if (selection.empty || selection instanceof NodeSelection) return false;
        if (selection.$from.parent.type.spec.code) return false;
        return doc.textBetween(from, to).trim().length > 0;
      }}
    >
      {state.linkEditing ? (
        <LinkToolbar
          value={linkValue}
          autoFocus
          onValueChange={setDraft}
          onSubmit={applyLink}
          onOpenLink={() => {
            const href = linkHref(linkValue);
            if (href) onOpenUrl?.(href);
          }}
          onRemove={() => applyLink('')}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              closeLink();
            }
          }}
        />
      ) : (
        <FormatToolbar
          blockType={BLOCK_TYPES.find((type) => type.value === state.blockType)?.label}
          turnIntoMenu={
            <TurnIntoMenu
              value={state.blockType}
              onValueChange={(type) => applyBlockType(editor.chain().focus(), type)}
            />
          }
          marks={state.marks}
          onMarkChange={(mark) => editor.chain().focus().toggleMark(MARK_NAMES[mark]).run()}
          linked={state.href !== ''}
          onLink={() => {
            setDraft(null);
            setLinkEditing(editor, true);
          }}
          showColour={false}
          showTurnIntoTask={false}
        />
      )}
    </BubbleMenu>
  );
}
