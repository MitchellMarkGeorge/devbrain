// What the editor needs from the app. The editor never calls IPC itself: the page that shows it
// passes these in, so the same editor serves notes, task descriptions and read-only synced text.

export type EditorEntityType = 'task' | 'project' | 'note' | 'event';

export const EDITOR_ENTITY_TYPES: readonly EditorEntityType[] = [
  'task',
  'project',
  'note',
  'event',
];

// An entity as a pill shows it. `color` is a project's or event's colour, already checked with
// hexColorSchema (or a theme variable); `status` is a task's status, for its icon.
export interface EditorEntity {
  type: EditorEntityType;
  id: string;
  title: string;
  color?: string | null;
  status?: string | null;
}

export interface EditorHost {
  // the entities matching what was typed after "@", best first
  searchEntities?: (query: string) => Promise<EditorEntity[]>;
  // the entity as it is now, to show its current title; undefined while unknown or when deleted,
  // and the pill then shows the label stored in the markdown
  resolveEntity?: (type: EditorEntityType, id: string) => EditorEntity | undefined;
  // a click on an entity pill
  onOpenEntity?: (type: EditorEntityType, id: string) => void;
  // a click on a link or image that safeExternalUrl accepted; the app passes it to
  // Workspace.openUrl, which checks again (docs/security/untrusted-content.md)
  onOpenUrl?: (url: string) => void;
}
