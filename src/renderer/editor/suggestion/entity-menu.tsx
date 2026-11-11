import type { Editor } from '@tiptap/core';
import { TaskStatus } from '@common/types';
import { MentionMenu, type MentionItem, type SuggestionGroup } from '../../components';
import { MENTION_TYPES, type EditorEntity, type MentionType } from '../types';
import { createSuggestionMenu } from './suggestion';

/**
 * "@" mentions: typing "@" and a few words searches the workspace through the host and shows the
 * design system's MentionMenu (Tasks, Notes, Events); the chosen one is inserted as an entity pill.
 * The slash menu's "Link to note", "Link to task" and "Mention event" open it for one kind.
 */

const GROUPS: { kind: MentionType; label: string }[] = [
  { kind: 'task', label: 'Tasks' },
  { kind: 'note', label: 'Notes' },
  { kind: 'event', label: 'Events' },
];

const PER_GROUP = 5;

function toMentionItem(entity: EditorEntity): MentionItem | null {
  const { id, title } = entity;
  switch (entity.type) {
    case 'task':
      return { kind: 'task', id, title, status: entity.status ?? TaskStatus.NOT_STARTED };
    case 'note':
      return { kind: 'note', id, title };
    case 'event':
      return { kind: 'event', id, title, color: entity.color ?? 'green' };
    default:
      return null;
  }
}

// the results as the menu's groups, in the host's order within each kind
export function mentionGroups(items: MentionItem[]): SuggestionGroup<MentionItem>[] {
  return GROUPS.map(({ kind, label }) => ({
    label,
    items: items.filter((item) => item.kind === kind).slice(0, PER_GROUP),
  }));
}

// types "@" to open the menu for one kind (the slash menu's "Link to note" and the like)
export function openMention(chain: ReturnType<Editor['chain']>, editor: Editor, type: MentionType) {
  editor.storage.editorHost.mentionTypes = [type];
  chain.insertContent('@').run();
}

export const EntityMenu = createSuggestionMenu<MentionItem>({
  name: 'entityMenu',
  char: '@',
  allowSpaces: true,
  async items(query, editor) {
    const { host, mentionTypes } = editor.storage.editorHost;
    if (!host.searchEntities || !query.trim()) return [];
    const entities = await host.searchEntities(query.trim(), [...(mentionTypes ?? MENTION_TYPES)]);
    return entities.map(toMentionItem).filter((item): item is MentionItem => item !== null);
  },
  select(editor, range, item) {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertEntityLink({ type: item.kind, id: item.id, label: item.title })
      .run();
  },
  render: ({ itemsQuery, items, onSelect, handleRef, id, onActiveDescendantChange }) => (
    <MentionMenu
      id={id}
      onActiveDescendantChange={onActiveDescendantChange}
      groups={mentionGroups(items)}
      onSelect={onSelect}
      handleRef={handleRef}
      empty={itemsQuery.trim() ? 'No results' : 'Type to search tasks, notes and events'}
    />
  ),
  onExit(editor) {
    editor.storage.editorHost.mentionTypes = null;
  },
});
