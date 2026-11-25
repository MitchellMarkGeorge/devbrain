/*
 * Sandbox mock: "Mentioned in", what mentions a task, note, project or event. Each row is
 * something that mentions it: its glyph, its title and when it changed. Mock data only; not in
 * the design system.
 */
import { useState, type ReactNode } from 'react';
import { AtSign, CircleCheck, FileText, Folder, Link, Plus } from 'lucide-react';
import { TaskStatus } from '@common/types';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { LinkedTaskRow, type LinkedTaskRowData } from '../../../lists/LinkedTaskRow';
import { ColourBar } from '../../../ui/ColourBar';
import { DetailSection } from '../../../detail/DetailSection';
import { EntityPill } from '../../../entities/EntityPill';
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/Popover';
import { Icon, type IconSource } from '../../../ui/Icon';
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
  /** collapsible only: open at first (the default) or folded to its heading */
  defaultOpen?: boolean;
}

export function MentionsSection({
  mentions,
  variant = 'page',
  limit = 5,
  collapsible,
  defaultOpen,
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
      defaultOpen={defaultOpen}
    >
      <MentionList mentions={mentions} limit={limit} />
    </DetailSection>
  );
}

/**
 * A pill on a page ("2 tasks", "7 mentions") that opens a short list in a popover under it,
 * headed by `title`, with the list's actions on the right. A page shows its links this way,
 * so the page doesn't grow by them.
 */
export function PillPopover({
  glyph,
  label,
  title,
  action,
  defaultOpen,
  children,
}: {
  glyph: IconSource;
  label: ReactNode;
  title: string;
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger render={<EntityPill glyph={glyph} />}>{label}</PopoverTrigger>
      <PopoverContent size="auto" initialFocus={false} className={styles.popover}>
        <div className={styles.popoverHeading}>
          <span>{title}</span>
          {action}
        </div>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** "7 mentions", opening what mentions the item */
export function MentionsPill({
  mentions,
  defaultOpen,
}: {
  mentions: Mention[];
  defaultOpen?: boolean;
}) {
  return (
    <PillPopover
      glyph={AtSign}
      label={`${mentions.length} ${mentions.length === 1 ? 'mention' : 'mentions'}`}
      title="Mentioned in"
      defaultOpen={defaultOpen}
    >
      <MentionList mentions={mentions} limit={50} />
    </PillPopover>
  );
}

/** "2 tasks · 1 in progress", opening a note's tasks, with Link and New */
export function TasksPill({
  tasks,
  label,
  defaultOpen,
}: {
  tasks: LinkedTaskRowData[];
  label: string;
  defaultOpen?: boolean;
}) {
  return (
    <PillPopover
      glyph={CircleCheck}
      label={label}
      title="Tasks"
      defaultOpen={defaultOpen}
      action={
        <>
          <Button size="xs" variant="ghost" icon={Link}>
            Link
          </Button>
          <Button size="xs" variant="ghost" icon={Plus}>
            New
          </Button>
        </>
      }
    >
      <div>
        {tasks.map((task) => (
          <LinkedTaskRow key={task.title} task={task} onOpen={() => undefined} />
        ))}
      </div>
    </PillPopover>
  );
}
