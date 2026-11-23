import { Extension, type Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';

declare module '@tiptap/core' {
  interface Storage {
    // baseline: the markdown last loaded into the editor (its first text, or one loadMarkdown gave
    // it), and the editor's own spelling of it, so undoing back to it gives the loaded text exactly
    loadedMarkdown: { baseline: { value: string; markdown: string } | null };
  }
}

/** Remembers the markdown last loaded into the editor (see `markdownOf`). */
export const LoadedMarkdown = Extension.create({
  name: 'loadedMarkdown',

  addStorage() {
    return { baseline: null as { value: string; markdown: string } | null };
  },
});

/** Notes `value` as the text the editor now holds as loaded, in the editor's spelling. */
export function setBaseline(editor: Editor, value: string): void {
  editor.storage.loadedMarkdown.baseline = { value, markdown: editor.getMarkdown() };
}

/**
 * The markdown the editor's content stands for: the text last loaded, exactly as given, while the
 * content is still what it loaded (opened, or undone back to it), and the editor's own markdown
 * once it was edited.
 */
export function markdownOf(editor: Editor): string {
  const markdown = editor.getMarkdown();
  const baseline = editor.storage.loadedMarkdown.baseline;
  return markdown === baseline?.markdown ? baseline.value : markdown;
}

/**
 * Replaces the editor's content with `value`, a text from outside it (a sync, a reattach), without
 * counting as an edit: `onChange` doesn't hear it. The next edit starts an undo step of its own,
 * and undoing back to `value` gives it exactly.
 */
export function loadMarkdown(editor: Editor, value: string): void {
  editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
  editor.view.dispatch(closeHistory(editor.state.tr));
  setBaseline(editor, value);
}
