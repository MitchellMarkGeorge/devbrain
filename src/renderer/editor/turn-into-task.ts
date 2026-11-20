import type { Editor, Range } from '@tiptap/core';

// The text between two positions as a task's title: its entity links read as their labels and its
// spaces collapsed; null when there is none.
function rangeTitle(editor: Editor, from: number, to: number): string | null {
  if (to <= from) return null;
  const title = editor.state.doc
    .textBetween(from, to, ' ', (leaf) => (leaf.attrs.label as string | undefined) ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return title || null;
}

/**
 * The selected text as a new task's title (the format toolbar's Turn into task): one text block's
 * selection outside code. null when the selection can't become a task (empty, across blocks, in
 * code, or only blanks).
 */
export function selectionTaskTitle(editor: Editor): string | null {
  const { selection } = editor.state;
  const { $from, $to, from, to } = selection;
  if (selection.empty || !$from.parent.isTextblock || !$from.sameParent($to)) return null;
  if ($from.parent.type.spec.code) return null;
  return rangeTitle(editor, from, to);
}

/** Whether the caret is in a block of text outside code, where "/task" can make a task. */
export function inTextBlock(editor: Editor): boolean {
  const { parent } = editor.state.selection.$from;
  return parent.isTextblock && !parent.type.spec.code;
}

/**
 * The text of the block the caret is in, less `skip` (the "/task" typed in it), as the slash
 * menu's New task title. null outside a text block, in code, or when the rest is blank.
 */
export function blockTaskTitle(editor: Editor, skip: Range): string | null {
  if (!inTextBlock(editor)) return null;
  const { $from } = editor.state.selection;
  const start = $from.start();
  const end = $from.end();
  if (skip.from < start || skip.to > end) return null;
  const before = rangeTitle(editor, start, skip.from) ?? '';
  const after = rangeTitle(editor, skip.to, end) ?? '';
  return `${before} ${after}`.trim() || null;
}

/**
 * Makes a task titled with the text from `from` to `to` through the host's `createTask`, then puts
 * a link to it (its pill) in place of that text. If the note changed while the task was made, the
 * positions may no longer be that text, so the task is kept but nothing is replaced. A host that
 * fails (and says so to the user) leaves the text as it was. Returns whether the link went in.
 */
async function turnRangeIntoTask(editor: Editor, from: number, to: number): Promise<boolean> {
  const { createTask } = editor.storage.editorHost.host;
  const title = rangeTitle(editor, from, to);
  if (!createTask || title === null) return false;

  // the note as it was: any edit makes a new doc, a move of the caret doesn't
  const before = editor.state.doc;
  const task = await createTask(title);
  if (!task || editor.isDestroyed || editor.state.doc !== before) return false;

  return editor
    .chain()
    .focus()
    .insertContentAt(
      { from, to },
      { type: 'entityLink', attrs: { type: 'task', id: task.id, label: task.title } },
    )
    .run();
}

/** The format toolbar's Turn into task: the selected text becomes a task, linked in its place. */
export function turnSelectionIntoTask(editor: Editor): Promise<boolean> {
  if (selectionTaskTitle(editor) === null) return Promise.resolve(false);
  const { from, to } = editor.state.selection;
  return turnRangeIntoTask(editor, from, to);
}

/**
 * The slash menu's Task: removes the "/task" typed (`slash`) and opens the host's New task dialog,
 * its title the rest of the line's text when there is some. The text stays as it is: the task is
 * made in the dialog, connected to what the editor is for (a note, a project), not linked in it.
 * Returns whether the dialog was opened.
 */
export function openNewTaskFromLine(editor: Editor, slash: Range): boolean {
  const { openNewTask } = editor.storage.editorHost.host;
  if (!openNewTask || !inTextBlock(editor)) return false;
  const title = blockTaskTitle(editor, slash) ?? undefined;
  // "Call Ana /task" leaves "Call Ana", without the space before the "/task" when it ended the line
  const { doc, selection } = editor.state;
  let from = slash.from;
  if (slash.to === selection.$from.end()) {
    while (from > selection.$from.start() && doc.textBetween(from - 1, from) === ' ') from -= 1;
  }
  editor.chain().focus().deleteRange({ from, to: slash.to }).run();
  openNewTask(title);
  return true;
}
