import type { Editor } from '@tiptap/core';
import { Mapping } from '@tiptap/pm/transform';
import type { Transaction } from '@tiptap/pm/state';

/**
 * The selected text as a new task's title: one text block's selection outside code, its entity
 * links read as their labels and its spaces collapsed. null when the selection can't become a task
 * (empty, across blocks, in code, or only blanks).
 */
export function selectionTaskTitle(editor: Editor): string | null {
  const { selection, doc } = editor.state;
  const { $from, $to, from, to } = selection;
  if (selection.empty || !$from.parent.isTextblock || !$from.sameParent($to)) return null;
  if ($from.parent.type.spec.code) return null;
  const title = doc
    .textBetween(from, to, ' ', (leaf) => (leaf.attrs.label as string | undefined) ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return title || null;
}

/**
 * Turn into task: makes a task titled with the selected text through the host's `createTask`, then
 * puts a link to it (its pill) in place of the text. Typing while the task is made moves the range
 * with it; if the text was deleted meanwhile, the task is made but nothing is replaced. A host that
 * fails (and says so to the user) leaves the text as it was. Returns whether the link went in.
 */
export async function turnSelectionIntoTask(editor: Editor): Promise<boolean> {
  const { createTask } = editor.storage.editorHost.host;
  const title = selectionTaskTitle(editor);
  if (!createTask || title === null) return false;
  const { from, to } = editor.state.selection;

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
