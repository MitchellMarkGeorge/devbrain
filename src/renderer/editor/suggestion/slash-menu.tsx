import type { Editor, Range } from '@tiptap/core';
import {
  BLOCK_TYPES,
  DEFAULT_TABLE_SIZE,
  filterSlashGroups,
  SLASH_GROUPS,
  SlashMenu as SlashMenuView,
  type BlockType,
  type SlashCommand,
  type SlashItem,
  type TableSize,
} from '@renderer/components';
import { applyBlockType } from '../block-types';
import { tableAround } from '../table-commands';
import { inTextBlock, openNewTaskFromLine } from '../turn-into-task';
import { openMention } from './entity-menu';
import { createSuggestionMenu } from './suggestion';

/**
 * The slash menu: "/" at the start of a word opens the design system's SlashMenu, and picking an
 * item turns the block into it or inserts it. "Link to note", "Link to task" and "Mention event"
 * open the "@" menu for that kind. "Task" opens the host's New task dialog, connected to what the
 * editor is for (a note, a project), with the rest of the line's text as its title; the "/task" is
 * removed and the text left as it is (turn-into-task.ts). It is offered when the host can open the
 * dialog. Table is left out in a table's cell; elsewhere it inserts the size picked beside it (`TableSizePicker`), 3 × 3 unless one was.
 */

const WITHOUT_TASK = SLASH_GROUPS.map((group) => ({
  ...group,
  items: group.items.filter((item) => item.value !== 'task'),
}));

// the menu's groups: Task only where the host can open New task, and Table not in a table's
// cell, as a Markdown table can't hold one
function groupsFor(editor: Editor) {
  const canOpen = editor.storage.editorHost.host.openNewTask !== undefined && inTextBlock(editor);
  const groups = canOpen ? SLASH_GROUPS : WITHOUT_TASK;
  if (!tableAround(editor.state)) return groups;
  return groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.value !== 'table'),
  }));
}

type Chain = ReturnType<Editor['chain']>;

// DevBrain's own items; the block types are the TurnIntoMenu's (block-types.ts)
const COMMANDS: Record<
  Exclude<SlashCommand, BlockType | 'task'>,
  (chain: Chain, editor: Editor, tableSize: TableSize) => void
> = {
  'link-note': (chain, editor) => openMention(chain, editor, 'note'),
  'link-task': (chain, editor) => openMention(chain, editor, 'task'),
  'mention-event': (chain, editor) => openMention(chain, editor, 'event'),
  divider: (chain) => chain.setHorizontalRule().run(),
  table: (chain, _editor, { rows, cols }) =>
    chain.insertTable({ rows, cols, withHeaderRow: true }).run(),
  collapsible: (chain) => chain.setDetails().run(),
  callout: (chain) => chain.setCallout('note').run(),
};

const isBlockType = (command: SlashCommand): command is BlockType =>
  BLOCK_TYPES.some((type) => type.value === command);

export function runSlashCommand(
  editor: Editor,
  range: Range,
  command: SlashCommand,
  // the size picked beside Table, 3 × 3 unless one was
  tableSize: TableSize = DEFAULT_TABLE_SIZE,
): void {
  if (command === 'task') {
    openNewTaskFromLine(editor, range);
    return;
  }
  const chain = editor.chain().focus().deleteRange(range);
  if (isBlockType(command)) applyBlockType(chain, command);
  else COMMANDS[command](chain, editor, tableSize);
}

export const SlashMenu = createSuggestionMenu<SlashItem>({
  name: 'slashMenu',
  char: '/',
  items: (query, editor) =>
    filterSlashGroups(groupsFor(editor), query).flatMap((group) => group.items),
  select: (editor, range, item) => runSlashCommand(editor, range, item.value, item.tableSize),
  render: ({ editor, query, onSelect, handleRef, id, onActiveDescendantChange }) => (
    <SlashMenuView
      id={id}
      query={query}
      groups={groupsFor(editor)}
      onSelect={onSelect}
      handleRef={handleRef}
      onActiveDescendantChange={onActiveDescendantChange}
    />
  ),
});
