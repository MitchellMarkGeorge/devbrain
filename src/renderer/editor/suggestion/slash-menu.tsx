import type { Editor, Range } from '@tiptap/core';
import {
  BLOCK_TYPES,
  filterSlashGroups,
  SLASH_GROUPS,
  SlashMenu as SlashMenuView,
  type BlockType,
  type SlashCommand,
  type SlashItem,
} from '../../components';
import { applyBlockType } from '../block-types';
import { openMention } from './entity-menu';
import { createSuggestionMenu } from './suggestion';

/**
 * The slash menu: "/" at the start of a word opens the design system's SlashMenu, and picking an
 * item turns the block into it or inserts it. "Link to note", "Link to task" and "Mention event"
 * open the "@" menu for that kind. "Task" (making a task from the editor) waits for task creation,
 * so it is left out of the menu for now.
 */

const GROUPS = SLASH_GROUPS.map((group) => ({
  ...group,
  items: group.items.filter((item) => item.value !== 'task'),
}));

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
};

const isBlockType = (command: SlashCommand): command is BlockType =>
  BLOCK_TYPES.some((type) => type.value === command);

export function runSlashCommand(editor: Editor, range: Range, command: SlashCommand): void {
  if (command === 'task') return;
  const chain = editor.chain().focus().deleteRange(range);
  if (isBlockType(command)) applyBlockType(chain, command);
  else COMMANDS[command](chain, editor);
}

export const SlashMenu = createSuggestionMenu<SlashItem>({
  name: 'slashMenu',
  char: '/',
  items: (query) => filterSlashGroups(GROUPS, query).flatMap((group) => group.items),
  select: (editor, range, item) => runSlashCommand(editor, range, item.value),
  render: ({ query, onSelect, handleRef }) => (
    <SlashMenuView query={query} groups={GROUPS} onSelect={onSelect} handleRef={handleRef} />
  ),
});
