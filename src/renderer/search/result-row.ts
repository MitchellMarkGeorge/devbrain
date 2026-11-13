import { hexColorSchema } from '@common/color';
import {
  LinkState,
  ProjectStatus,
  TaskStatus,
  type SearchEntityType,
  type SearchResult,
} from '@common/types';
import { highlightToText } from '../editor/highlight';

/**
 * A search result as a row draws it: what its glyph needs and its title. The one mapping from
 * `search.search`'s results, shared by the "@" menu (`toEditorEntity`), ⌘K and the pickers.
 */
export interface ResultRow {
  type: SearchEntityType;
  id: string;
  /**
   * core's highlighted title: escaped text with `<b>` around the matches. Drawn only by
   * `SearchHighlight` (docs/security/untrusted-content.md), never put into another string.
   */
  titleHtml: string;
  /** the title as text: an item's label, an inserted mention's */
  title: string;
  /** a task's status; null for every other type */
  status: TaskStatus | null;
  /** a project's or event's colour when it is #rrggbb; one from core that isn't is left out */
  color: string | null;
  /**
   * Whether a picker can't offer it: a closed task (completed or cancelled), a completed project.
   */
  closed: boolean;
  /** a subtask's parent; null for a top-level task and every other type */
  parentTaskId: string | null;
  /** a task, project or event its provider owns: its synced fields are read-only */
  synced: boolean;
}

export function toResultRow(result: SearchResult): ResultRow {
  const color = hexColorSchema.safeParse(result.color);
  return {
    type: result.entityType,
    id: result.entityId,
    titleHtml: result.title,
    title: highlightToText(result.title),
    status: result.status,
    color: color.success ? color.data : null,
    closed:
      result.status === TaskStatus.COMPLETED ||
      result.status === TaskStatus.CANCELLED ||
      result.projectStatus === ProjectStatus.COMPLETED,
    parentTaskId: result.parentTaskId,
    synced: result.external?.state === LinkState.SYNCED,
  };
}
