import type { TaskStatus } from '@common/types';
import type { Swatch } from '@renderer/components';

// What the editor asks the app to do: the actions it can't take itself, called from TipTap and
// ProseMirror as much as from React. A page renders WorkspaceRichTextEditor, which passes the app's
// (src/renderer/shared/components); Storybook and tests pass their own. The pills read their
// entities themselves (use-entity-resolver.ts).

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

// An entity as a pill or the "@" menu shows it. `color` is a project's or event's colour: a swatch
// name, or a CSS colour already checked with hexColorSchema; `status` is a task's, for its icon;
// `startAt` an event's start, to open it on its day.
export interface EditorEntity {
  type: EditorEntityType;
  id: string;
  title: string;
  color?: Swatch | string;
  status?: TaskStatus;
  startAt?: Date | null;
}

export interface EditorHost {
  // the tasks, notes and events matching what was typed after "@", best first
  searchEntities?: (query: string, types: MentionType[]) => Promise<EditorEntity[]>;
  // a click on an entity pill, with its entity once the pill has loaded it
  onOpenEntity?: (type: EditorEntityType, id: string, entity?: EditorEntity) => void;
  // a click on a link or image that safeExternalUrl accepted; the app passes it to
  // Workspace.openUrl, which checks again (docs/security/untrusted-content.md)
  onOpenUrl?: (url: string) => void;
}
