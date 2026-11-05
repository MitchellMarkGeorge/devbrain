import type { Swatch, TaskStatus } from '../components';

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
  // the entity as it is now, to show its current title; undefined while unknown or when deleted,
  // and the pill then shows the label stored in the markdown
  resolveEntity?: (type: EditorEntityType, id: string) => EditorEntity | undefined;
  // a click on an entity pill
  onOpenEntity?: (type: EditorEntityType, id: string) => void;
  // a click on a link or image that safeExternalUrl accepted; the app passes it to
  // Workspace.openUrl, which checks again (docs/security/untrusted-content.md)
  onOpenUrl?: (url: string) => void;
}
