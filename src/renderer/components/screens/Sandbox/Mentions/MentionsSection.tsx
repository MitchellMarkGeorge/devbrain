/*
 * Sandbox mock: "Mentioned in", what mentions a task, note, project or event. Each row is
 * something that mentions it: its glyph, its title and when it changed. Mock data only; not in
 * the design system.
 */
import { useState } from 'react';
import { FileText, Folder } from 'lucide-react';
import { TaskStatus } from '@common/types';
import { Badge } from '../../../ui/Badge';
import { ColourBar } from '../../../ui/ColourBar';
import { DetailSection } from '../../../detail/DetailSection';
import { Icon } from '../../../ui/Icon';
import { StatusIcon } from '../../../entities/StatusIcon';
import { resolveColor } from '../../../types';
import styles from './MentionsSection.module.css';

/** What mentions the item: a note, or a task's, project's or event's description. */
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

export interface MentionListProps {
  mentions: Mention[];
  /** how many to show before "Show n more" */
  limit?: number;
}

/** The rows alone, for a section, a side panel, a popover or a sheet. */
export function MentionList({ mentions, limit = 5 }: MentionListProps) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? mentions : mentions.slice(0, limit);
  const hidden = mentions.length - visible.length;
  if (mentions.length === 0) {
    return <div className={styles.empty}>Nothing mentions this yet</div>;
  }
  return (
    <div className={styles.list}>
      {visible.map((m) => (
        <div key={m.id} className={styles.row} role="button" tabIndex={0}>
          <span className={styles.glyph}>
            <SourceGlyph source={m.source} />
          </span>
          <span className={styles.title}>{m.source.title}</span>
          <span className={styles.time}>{m.updated}</span>
        </div>
      ))}
      {hidden > 0 && (
        <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
          Show {hidden} more
        </button>
      )}
    </div>
  );
}

export interface MentionsSectionProps {
  mentions: Mention[];
  /** `page`: the content 8px under the heading; `sheet`: 4px */
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
  mentions,
  variant = 'page',
  limit = 5,
  collapsible,
}: MentionsSectionProps) {
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
    >
      <MentionList mentions={mentions} limit={limit} />
    </DetailSection>
  );
}
