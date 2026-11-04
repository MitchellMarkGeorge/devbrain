import { Extension, type Editor } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { safeExternalUrl } from '@common/safe-url';
import type { EditorHost } from '../types';

declare module '@tiptap/core' {
  interface Storage {
    editorHost: { host: EditorHost };
  }
}

/**
 * Holds the editor's host (RichTextEditor keeps it current), for the parts that run inside the
 * editor: the "@" menu's search and link clicks.
 *
 * A click on a link or image chip never navigates the window. It opens the URL through
 * host.onOpenUrl when safeExternalUrl accepts it: on ⌘/Ctrl-click while editing, so a plain click
 * can still place the caret, and on a plain click when read-only.
 */
export const EditorHostExtension = Extension.create({
  name: 'editorHost',

  addStorage() {
    return { host: {} as EditorHost };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        props: {
          handleClick(view, _pos, event) {
            const link = (event.target as HTMLElement).closest<HTMLElement>(
              'a[href], [data-image-src]',
            );
            if (!link) return false;
            event.preventDefault();
            if (view.editable && !(event.metaKey || event.ctrlKey)) return false;
            const url = safeExternalUrl(link.getAttribute('href') ?? link.dataset.imageSrc);
            if (url) storage.host.onOpenUrl?.(url);
            return true;
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
