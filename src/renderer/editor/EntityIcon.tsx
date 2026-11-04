import { Activity, Circle, CircleCheck, CircleSlash, File, Flag, Folder } from 'lucide-react';
import type { EditorEntity } from './types';
import styles from './EntityIcon.module.css';

// The glyph EntityPill shows for each kind of link: a task's status icon, a project's folder in its
// colour, a note's file, an event's bar in its calendar's colour (docs/design-system/components/
// EntityPill.md). The colours are already checked by the host, so they are safe to put in a style.
export function EntityIcon({
  entity,
}: {
  entity: Pick<EditorEntity, 'type' | 'color' | 'status'>;
}) {
  const props = { size: 12, strokeWidth: 1.75, 'aria-hidden': true };
  switch (entity.type) {
    case 'project':
      return <Folder {...props} style={{ color: entity.color ?? undefined }} />;
    case 'note':
      return <File {...props} />;
    case 'event':
      return (
        <span
          className={styles.bar}
          style={{ background: entity.color ?? undefined }}
          aria-hidden="true"
        />
      );
    case 'task':
      switch (entity.status) {
        case 'in-progress':
          return <Activity {...props} className={styles.inProgress} />;
        case 'completed':
          return <CircleCheck {...props} className={styles.completed} />;
        case 'cancelled':
          return <CircleSlash {...props} className={styles.cancelled} />;
        case 'overdue':
          return <Flag {...props} className={styles.overdue} />;
        default:
          return <Circle {...props} className={styles.notStarted} />;
      }
  }
}
