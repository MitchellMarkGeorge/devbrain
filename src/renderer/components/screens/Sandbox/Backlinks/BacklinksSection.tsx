/*
 * Sandbox mock: "Linked from", the backlinks of a task, note, project or event. Each row is
 * something that links here, with the line that does. Mock data only; not in the design system.
 */
import { Fragment, useState } from 'react';
import { FileText, Folder } from 'lucide-react';
import { TaskStatus } from '@common/types';
import { ColourBar } from '../../../ui/ColourBar';
import { DetailSection } from '../../../detail/DetailSection';
import { Icon } from '../../../ui/Icon';
import { StatusIcon } from '../../../entities/StatusIcon';
import { resolveColor } from '../../../types';
import styles from './BacklinksSection.module.css';

/** What links here: a note, a task's or project's description, an event's note. */
export type BacklinkSource =
  | { type: 'note'; title: string }
  | { type: 'task'; title: string; status: TaskStatus }
  | { type: 'project'; title: string; color: string }
  | { type: 'event'; title: string; color: string };

export interface Backlink {
  id: string;
  source: BacklinkSource;
  /** when the source changed: "2h ago", "Jun 12" */
  updated: string;
  /** the line that links here, with `null` where it names this item */
  context: (string | null)[];
}

function SourceGlyph({ source }: { source: BacklinkSource }) {
  switch (source.type) {
    case 'note':
      return <Icon icon={FileText} size={16} />;
    case 'task':
      return <StatusIcon status={source.status} size={14} />;
    case 'project':
      return <Icon icon={Folder} size={16} style={{ color: resolveColor(source.color) }} />;
    case 'event':
      return <ColourBar color={resolveColor(source.color, 'green')} />;
  }
}

export interface BacklinksSectionProps {
  /** how a line names the item the page is for: "this task", "this note" */
  selfLabel: string;
  backlinks: Backlink[];
  /** `page`: the line beside each title; `sheet`: titles only */
  variant?: 'page' | 'sheet';
  /** how many to show before "Show n more" */
  limit?: number;
}

export function BacklinksSection({
  selfLabel,
  backlinks,
  variant = 'page',
  limit = 5,
}: BacklinksSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? backlinks : backlinks.slice(0, limit);
  const hidden = backlinks.length - visible.length;
  return (
    <DetailSection
      spacing={variant}
      title="Linked from"
      count={backlinks.length || undefined}
      data-variant={variant}
    >
      {backlinks.length === 0 ? (
        <div className={styles.empty}>Nothing links here yet</div>
      ) : (
        <div className={styles.list}>
          {visible.map((b) => (
            <div key={b.id} className={styles.row} role="button" tabIndex={0}>
              <span className={styles.glyph}>
                <SourceGlyph source={b.source} />
              </span>
              <span className={styles.title}>{b.source.title}</span>
              {variant === 'page' && (
                <span className={styles.context}>
                  {b.context.map((part, i) => (
                    <Fragment key={i}>
                      {part ?? <span className={styles.self}>{selfLabel}</span>}
                    </Fragment>
                  ))}
                </span>
              )}
              <span className={styles.time}>{b.updated}</span>
            </div>
          ))}
          {hidden > 0 && (
            <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
              Show {hidden} more
            </button>
          )}
        </div>
      )}
    </DetailSection>
  );
}
