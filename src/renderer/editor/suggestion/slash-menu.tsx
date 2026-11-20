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
import { inTextBlock, openNewTaskFromLine } from '../turn-into-task';
import { openMention } from './entity-menu';
import { createSuggestionMenu } from './suggestion';

/**
 * The slash menu: "/" at the start of a word opens the design system's SlashMenu, and picking an
 * item turns the block into it or inserts it. "Link to note", "Link to task" and "Mention event"
 * open the "@" menu for that kind. "Task" opens the host's New task dialog, connected to what the
 * editor is for (a note, a project), with the rest of the line's text as its title; the "/task" is
 * removed and the text left as it is (turn-into-task.ts). It is offered when the host can open the
 * dialog.
 */

const WITHOUT_TASK = SLASH_GROUPS.map((group) => ({
  ...group,
  items: group.items.filter((item) => item.value !== 'task'),
}));

// the menu's groups: Task only where the host can open New task
function groupsFor(editor: Editor) {
  const canOpen = editor.storage.editorHost.host.openNewTask !== undefined && inTextBlock(editor);
  return canOpen ? SLASH_GROUPS : WITHOUT_TASK;
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
    openNewTaskFromLine(editor, range);
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
    filterSlashGroups(groupsFor(editor), query).flatMap((group) => group.items),
  select: (editor, range, item) => runSlashCommand(editor, range, item.value),
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
