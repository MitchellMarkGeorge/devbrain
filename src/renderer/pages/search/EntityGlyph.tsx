import type { ReactNode } from 'react';
import { FileText, Folder } from 'lucide-react';
import { TaskStatus, type SearchEntityType } from '@common/types';
import { ColourBar, Icon, resolveColor, StatusIcon } from '../../components';
import styles from './SearchDialog.module.css';

/**
 * An entity's glyph in a list of results (⌘K, the pickers): a task's status, a note's page, a
 * project's folder in its colour, an event's bar in its colour. Colours from core are untrusted;
 * resolveColor parses them as #rrggbb.
 */
export function entityGlyph(
  type: SearchEntityType,
  status: TaskStatus | null,
  color: string | null,
): ReactNode {
  switch (type) {
    case 'task':
      return <StatusIcon status={status ?? TaskStatus.NOT_STARTED} />;
    case 'note':
      return <Icon icon={FileText} />;
    case 'project':
      return <Icon icon={Folder} style={{ color: resolveColor(color, 'blue') }} />;
    case 'event':
      return (
        <span className={styles.bar}>
          <ColourBar color={resolveColor(color, 'blue')} height={14} />
        </span>
      );
  }
}
