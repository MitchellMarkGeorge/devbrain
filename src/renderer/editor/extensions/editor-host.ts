import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { safeExternalUrl } from '@common/safe-url';
import type { EditorHost, MentionType } from '../types';

declare module '@tiptap/core' {
  interface Storage {
    // mentionTypes: the kinds the open "@" menu searches, when a slash command picked one
    // linkEditing: the format toolbar shows the LinkToolbar for the selection (⌘K, or its Link)
    editorHost: { host: EditorHost; mentionTypes: MentionType[] | null; linkEditing: boolean };
  }
}

/**
 * Holds the editor's host (RichTextEditor keeps it current), for the parts that run inside the
 * editor: the "@" menu's search and link clicks.
 *
 * A click on a link or image pill never navigates the window. It opens the URL through
 * host.onOpenUrl when safeExternalUrl accepts it: on ⌘/Ctrl-click while editing, so a plain click
 * can still place the caret, and on a plain click when read-only.
 */
export const EditorHostExtension = Extension.create({
  name: 'editorHost',

  addStorage() {
    return {
      host: {} as EditorHost,
      mentionTypes: null as MentionType[] | null,
      linkEditing: false,
    };
  },

  addKeyboardShortcuts() {
    return {
      // ⌘K edits the link of the selection, or of the link the caret is in; with neither it is
      // left to the app's ⌘K search
      'Mod-k': ({ editor }) => {
        if (editor.state.selection.empty && !editor.isActive('link')) return false;
        setLinkEditing(editor, true);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        props: {
          // the DOM's own click, not ProseMirror's handleClick: the browser follows a link on
          // `click`, after ProseMirror has handled the mouseup, so only this can stop it
          handleDOMEvents: {
            click(view, event) {
              const link = (event.target as HTMLElement | null)?.closest<HTMLElement>(
                'a[href], [data-image-src]',
              );
              if (!link) return false;
              event.preventDefault();
              // a plain click while editing places the caret
              if (view.editable && !(event.metaKey || event.ctrlKey)) return false;
              const url = safeExternalUrl(link.getAttribute('href') ?? link.dataset.imageSrc);
              if (url) storage.host.onOpenUrl?.(url);
              return true;
            },
          },
        },
      }),
    ];
  },
});

// gives the editor its current host; RichTextEditor calls it after each render
export function setEditorHost(editor: Editor, host: EditorHost): void {
  editor.storage.editorHost.host = host;
}

// the format toolbar's bubble menu (FormatBubble.tsx), which takes 'show' and 'updatePosition'
export const FORMAT_TOOLBAR_KEY = new PluginKey('formatToolbar');

// opens or closes the link editor in the format toolbar. Opening shows the toolbar even with
// only a caret in a link; closing leaves it to the selection, once the editor has focus again.
export function setLinkEditing(editor: Editor, editing: boolean): void {
  if (editor.storage.editorHost.linkEditing === editing) return;
  editor.storage.editorHost.linkEditing = editing;
  editor.view.dispatch(
    editor.state.tr.setMeta(FORMAT_TOOLBAR_KEY, editing ? 'show' : 'updatePosition'),
  );
}

// places the toolbar again, once its content has changed size
export function repositionFormatToolbar(editor: Editor): void {
  editor.view.dispatch(editor.state.tr.setMeta(FORMAT_TOOLBAR_KEY, 'updatePosition'));
}
