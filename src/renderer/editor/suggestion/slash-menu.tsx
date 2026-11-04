import type { Editor, Range } from '@tiptap/core';
import {
  filterSlashGroups,
  SLASH_GROUPS,
  SlashMenu as SlashMenuView,
  type SlashCommand,
  type SlashItem,
} from '../../components';
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

const COMMANDS: Record<Exclude<SlashCommand, 'task'>, (chain: Chain, editor: Editor) => void> = {
  text: (chain) => chain.setParagraph().run(),
  'heading-1': (chain) => chain.setHeading({ level: 1 }).run(),
  'heading-2': (chain) => chain.setHeading({ level: 2 }).run(),
  'heading-3': (chain) => chain.setHeading({ level: 3 }).run(),
  code: (chain) => chain.setCodeBlock().run(),
  quote: (chain) => chain.setBlockquote().run(),
  'bulleted-list': (chain) => chain.toggleBulletList().run(),
  'numbered-list': (chain) => chain.toggleOrderedList().run(),
  'todo-list': (chain) => chain.toggleTaskList().run(),
  'link-note': (chain, editor) => openMention(chain, editor, 'note'),
  'link-task': (chain, editor) => openMention(chain, editor, 'task'),
  'mention-event': (chain, editor) => openMention(chain, editor, 'event'),
  divider: (chain) => chain.setHorizontalRule().run(),
  table: (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  collapsible: (chain) => chain.setDetails().run(),
};

export function runSlashCommand(editor: Editor, range: Range, command: SlashCommand): void {
  if (command === 'task') return;
  COMMANDS[command](editor.chain().focus().deleteRange(range), editor);
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
