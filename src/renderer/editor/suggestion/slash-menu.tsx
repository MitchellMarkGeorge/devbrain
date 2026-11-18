import type { Editor, Range } from '@tiptap/core';
import {
  BLOCK_TYPES,
  filterSlashGroups,
  SLASH_GROUPS,
  SlashMenu as SlashMenuView,
  type BlockType,
  type SlashCommand,
  type SlashItem,
} from '@renderer/components';
import { applyBlockType } from '../block-types';
import { blockTaskTitle, inTextBlock, linkNewTasks, turnBlockIntoTask } from '../turn-into-task';
import { openMention } from './entity-menu';
import { createSuggestionMenu } from './suggestion';

/**
 * The slash menu: "/" at the start of a word opens the design system's SlashMenu, and picking an
 * item turns the block into it or inserts it. "Link to note", "Link to task" and "Mention event"
 * open the "@" menu for that kind. "Task" turns the line it is typed on into a task: the rest of
 * the block's text is its title, replaced by a link to it (turn-into-task.ts). On a line with no
 * other text it opens the host's New task dialog instead, and links each task made there. It is
 * offered when the host can do the one the line needs.
 */

const WITHOUT_TASK = SLASH_GROUPS.map((group) => ({
  ...group,
  items: group.items.filter((item) => item.value !== 'task'),
}));

// the "/" and what is typed after it, which ends at the caret
function slashRange(editor: Editor, query: string): Range {
  const to = editor.state.selection.from;
  return { from: to - query.length - 1, to };
}

// the menu's groups: Task only where it can make one
function groupsFor(editor: Editor, query: string) {
  const { host } = editor.storage.editorHost;
  if (!inTextBlock(editor)) return WITHOUT_TASK;
  const canMake =
    blockTaskTitle(editor, slashRange(editor, query)) === null
      ? host.openNewTask !== undefined
      : host.createTask !== undefined;
  return canMake ? SLASH_GROUPS : WITHOUT_TASK;
}

type Chain = ReturnType<Editor['chain']>;

// DevBrain's own items; the block types are the TurnIntoMenu's (block-types.ts)
const COMMANDS: Record<
  Exclude<SlashCommand, BlockType | 'task'>,
  (chain: Chain, editor: Editor) => void
> = {
  'link-note': (chain, editor) => openMention(chain, editor, 'note'),
  'link-task': (chain, editor) => openMention(chain, editor, 'task'),
  'mention-event': (chain, editor) => openMention(chain, editor, 'event'),
  divider: (chain) => chain.setHorizontalRule().run(),
  table: (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  collapsible: (chain) => chain.setDetails().run(),
  callout: (chain) => chain.setCallout('note').run(),
};

const isBlockType = (command: SlashCommand): command is BlockType =>
  BLOCK_TYPES.some((type) => type.value === command);

export function runSlashCommand(editor: Editor, range: Range, command: SlashCommand): void {
  if (command === 'task') {
    if (blockTaskTitle(editor, range) === null) linkNewTasks(editor, range);
    else void turnBlockIntoTask(editor, range);
    return;
  }
  const chain = editor.chain().focus().deleteRange(range);
  if (isBlockType(command)) applyBlockType(chain, command);
  else COMMANDS[command](chain, editor);
}

export const SlashMenu = createSuggestionMenu<SlashItem>({
  name: 'slashMenu',
  char: '/',
  items: (query, editor) =>
    filterSlashGroups(groupsFor(editor, query), query).flatMap((group) => group.items),
  select: (editor, range, item) => runSlashCommand(editor, range, item.value),
  render: ({ editor, query, onSelect, handleRef, id, onActiveDescendantChange }) => (
    <SlashMenuView
      id={id}
      query={query}
      groups={groupsFor(editor, query)}
      onSelect={onSelect}
      handleRef={handleRef}
      onActiveDescendantChange={onActiveDescendantChange}
    />
  ),
});
