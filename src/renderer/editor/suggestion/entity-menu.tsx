import { EntityIcon } from '../EntityIcon';
import type { EditorEntity, EditorEntityType } from '../types';
import { createSuggestionMenu } from './suggestion';
import type { SuggestionItem } from './SuggestionMenu';

/**
 * "@" links: typing "@" and a few words searches the workspace through the host and inserts the
 * chosen task, project, note or event as an entity pill. Results are grouped by type, in the
 * order the host ranked them within each type.
 */

interface EntityItem extends SuggestionItem {
  entity: EditorEntity;
}

const GROUPS: Record<EditorEntityType, string> = {
  task: 'Tasks',
  project: 'Projects',
  note: 'Notes',
  event: 'Events',
};

const GROUP_ORDER: EditorEntityType[] = ['task', 'project', 'note', 'event'];

export const EntityMenu = createSuggestionMenu<EntityItem>({
  name: 'entityMenu',
  char: '@',
  allowSpaces: true,
  emptyLabel: 'No matches',
  async items(query, editor) {
    const search = editor.storage.editorHost.host.searchEntities;
    if (!search || !query.trim()) return [];
    const entities = await search(query.trim());
    return GROUP_ORDER.flatMap((type) =>
      entities
        .filter((entity) => entity.type === type)
        .slice(0, 5)
        .map((entity) => ({
          key: `${entity.type}:${entity.id}`,
          label: entity.title,
          group: GROUPS[type],
          icon: <EntityIcon entity={entity} />,
          entity,
        })),
    );
  },
  select(editor, range, { entity }) {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertEntityLink({ type: entity.type, id: entity.id, label: entity.title })
      .run();
  },
});
