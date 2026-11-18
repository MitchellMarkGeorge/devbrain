import type { TaskStatus } from '@common/types';
import type { Swatch } from '@renderer/components';

// What the editor needs from the app. The editor never calls IPC itself: the page that shows it
// passes these in, so the same editor serves notes, task descriptions and read-only synced text.

export type EditorEntityType = 'task' | 'project' | 'note' | 'event';

// what "@" can mention, as the design system's MentionMenu shows it (a project link written in a
// note still shows as a pill)
export type MentionType = 'task' | 'note' | 'event';

export const MENTION_TYPES: readonly MentionType[] = ['task', 'note', 'event'];

export const EDITOR_ENTITY_TYPES: readonly EditorEntityType[] = [
  'task',
  'project',
  'note',
  'event',
];

// An entity as a pill shows it. `color` is a project's or event's colour: a swatch name, or a CSS
// colour already checked with hexColorSchema; `status` is a task's, for its icon.
export interface EditorEntity {
  type: EditorEntityType;
  id: string;
  title: string;
  color?: Swatch | string;
  status?: TaskStatus;
}

export interface EditorHost {
  // the tasks, notes and events matching what was typed after "@", best first
  searchEntities?: (query: string, types: MentionType[]) => Promise<EditorEntity[]>;
  // A hook giving the entity as it is now, to show its current title: undefined while unknown
  // (loading), and null when it is known to be gone (deleted, in the trash, or an id of no entity
  // of its type). The pill then shows the label stored in the markdown, drawn as missing when it is
  // gone. It should load the entity the first time a pill asks, and return the new value when the
  // entity changes, so the pill draws again.
  // Every pill calls it on every render, so it follows the rules of hooks: pass the same function
  // for the host's whole life (a module-level hook, not one made per render), and never switch
  // between passing one and leaving it out. A host without it shows every pill's stored label.
  useEntity?: (type: EditorEntityType, id: string) => EditorEntity | null | undefined;
  // a click on an entity pill
  onOpenEntity?: (type: EditorEntityType, id: string) => void;
  // a click on a link or image that safeExternalUrl accepted; the app passes it to
  // Workspace.openUrl, which checks again (docs/security/untrusted-content.md)
  onOpenUrl?: (url: string) => void;
}
