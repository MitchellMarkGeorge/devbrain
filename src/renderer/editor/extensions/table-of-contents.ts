import { TableOfContents } from '@tiptap/extension-table-of-contents';
import type { EditorView } from '@tiptap/pm/view';

/**
 * TipTap's table of contents, for the editor only (not in `createDocumentExtensions`): it gives
 * each heading an id and keeps `editor.storage.tableOfContents.content`, the headings with their
 * levels, up to date as the note changes. Pages read it with `useEditorOutline`.
 *
 * Changed from TipTap's:
 * - Giving the loaded note's headings their ids is not an edit: TipTap does it in a transaction
 *   when the editor is made, which would send `onChange` (saving a note just opened) and be the
 *   first step Undo takes back. It is dispatched without `update` and outside the history.
 * - The id is only `data-toc-id`, never the element's `id` (no ids from a note in the window's
 *   DOM), and it is never read from pasted HTML: a pasted heading gets a new one.
 * - It doesn't watch scrolling (`scrollParent`): its active heading assumes the window scrolls,
 *   and the page's scroller is an element. `useEditorOutline` finds the active heading itself.
 */
export const HeadingAnchors = TableOfContents.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.anchorTypes ?? ['heading'],
        attributes: {
          id: { default: null, rendered: false, parseHTML: () => null },
          'data-toc-id': {
            default: null,
            parseHTML: () => null,
            renderHTML: (attributes) => ({ 'data-toc-id': attributes['data-toc-id'] }),
          },
        },
      },
    ];
  },

  onCreate(event) {
    const view: EditorView = this.editor.view;
    const dispatch = view.dispatch.bind(view);
    view.dispatch = (tr) =>
      dispatch(tr.setMeta('preventUpdate', true).setMeta('addToHistory', false));
    try {
      this.parent?.(event);
    } finally {
      // back to EditorView's own method
      delete (view as Partial<EditorView>).dispatch;
    }
  },
}).configure({ scrollParent: undefined });
