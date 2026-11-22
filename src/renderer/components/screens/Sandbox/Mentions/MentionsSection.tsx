/*
 * Sandbox mock: "Mentioned in", what mentions a task, note, project or event. Each row is
 * something that mentions it, with the line that does. Mock data only; not in the design system.
 */
import { Fragment, useState } from 'react';
import { FileText, Folder } from 'lucide-react';
import { TaskStatus } from '@common/types';
import { Badge } from '../../../ui/Badge';
import { ColourBar } from '../../../ui/ColourBar';
import { DetailSection } from '../../../detail/DetailSection';
import { Icon } from '../../../ui/Icon';
import { StatusIcon } from '../../../entities/StatusIcon';
import { resolveColor } from '../../../types';
import styles from './MentionsSection.module.css';

/** What mentions the item: a note, a task's or project's description, an event's note. */
export type MentionSource =
  | { type: 'note'; title: string }
  | { type: 'task'; title: string; status: TaskStatus }
  | { type: 'project'; title: string; color: string }
  | { type: 'event'; title: string; color: string };

export interface Mention {
  id: string;
  source: MentionSource;
  /** when the source changed: "2h ago", "Jun 12" */
  updated: string;
  /** the line that mentions it, with `null` where it names this item */
  context: (string | null)[];
}

function SourceGlyph({ source }: { source: MentionSource }) {
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

export interface MentionsSectionProps {
  /** how a line names the item the page is for: "this task", "this note" */
  selfLabel: string;
  mentions: Mention[];
  /** `page`: the line beside each title; `sheet`: titles only */
  variant?: 'page' | 'sheet';
  /** how many to show before "Show n more" */
  limit?: number;
  /**
   * folds away like the sections around it: on a note, under its Tasks, with the count as a
   * badge as Tasks has it
   */
  collapsible?: boolean;
}

export function MentionsSection({
  selfLabel,
  mentions,
  variant = 'page',
  limit = 5,
  collapsible,
}: MentionsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? mentions : mentions.slice(0, limit);
  const hidden = mentions.length - visible.length;
  return (
    <DetailSection
      spacing={variant}
      title="Mentioned in"
      count={
        mentions.length === 0 ? undefined : collapsible ? (
          <Badge variant="secondary">{mentions.length}</Badge>
        ) : (
          mentions.length
        )
      }
      collapsible={collapsible}
      data-variant={variant}
    >
      {mentions.length === 0 ? (
        <div className={styles.empty}>Nothing mentions this yet</div>
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
