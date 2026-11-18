import type { Editor, Range } from '@tiptap/core';
import { Mapping } from '@tiptap/pm/transform';
import type { Transaction } from '@tiptap/pm/state';

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

/**
 * The text of the block the caret is in, less `skip` (the "/task" typed in it), as a new task's
 * title: the slash menu's Task. null outside a text block, in code, or when the rest is blank.
 */
export function blockTaskTitle(editor: Editor, skip: Range): string | null {
  const { $from } = editor.state.selection;
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  const start = $from.start();
  const end = $from.end();
  if (skip.from < start || skip.to > end) return null;
  const before = rangeTitle(editor, start, skip.from) ?? '';
  const after = rangeTitle(editor, skip.to, end) ?? '';
  return `${before} ${after}`.trim() || null;
}

/**
 * Makes a task titled with the text from `from` to `to` through the host's `createTask`, then puts
 * a link to it (its pill) in place of that text. Typing while the task is made moves the range with
 * it; if the text was deleted meanwhile, the task is made but nothing is replaced. A host that
 * fails (and says so to the user) leaves the text as it was. Returns whether the link went in.
 */
async function turnRangeIntoTask(editor: Editor, from: number, to: number): Promise<boolean> {
  const { createTask } = editor.storage.editorHost.host;
  const title = rangeTitle(editor, from, to);
  if (!createTask || title === null) return false;

  // follows the edits made while the task is being created
  const mapping = new Mapping();
  const follow = ({ transaction }: { transaction: Transaction }) => {
    mapping.appendMapping(transaction.mapping);
  };
  editor.on('transaction', follow);
  let task;
  try {
    task = await createTask(title);
  } finally {
    editor.off('transaction', follow);
  }
  if (!task || editor.isDestroyed) return false;

  const start = mapping.map(from, 1);
  const end = mapping.map(to, -1);
  if (end <= start) return false;
  return editor
    .chain()
    .focus()
    .insertContentAt(
      { from: start, to: end },
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
 * The slash menu's Task: removes the "/task" typed (`slash`), then the rest of the block's text
 * becomes a task, linked in its place.
 */
export function turnBlockIntoTask(editor: Editor, slash: Range): Promise<boolean> {
  if (blockTaskTitle(editor, slash) === null) return Promise.resolve(false);
  editor.chain().focus().deleteRange(slash).run();
  const { $from } = editor.state.selection;
  return turnRangeIntoTask(editor, $from.start(), $from.end());
}
