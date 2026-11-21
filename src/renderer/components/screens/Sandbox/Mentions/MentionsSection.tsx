/*
 * Sandbox mock: a "Mentioned in" section for a task, note, project or event, listing what
 * mentions it and the line that does. Mock data only; not part of the design system yet.
 */
import { Fragment, useState } from 'react';
import { Check, ChevronDown, FileText, Folder, Link, ListTodo } from 'lucide-react';
import { TaskStatus } from '@common/types';
import { Button } from '../../../ui/Button';
import { Checkbox } from '../../../ui/Checkbox';
import { ColourBar } from '../../../ui/ColourBar';
import { DetailSection } from '../../../detail/DetailSection';
import { EntityPill, type PillEntity } from '../../../entities/EntityPill';
import { Icon } from '../../../ui/Icon';
import { StatusIcon } from '../../../entities/StatusIcon';
import { ToggleGroup } from '../../../ui/ToggleGroup';
import { resolveColor } from '../../../types';
import styles from './MentionsSection.module.css';

/** What mentions the item: a note, a task's or project's description, an event's note. */
export type MentionSource =
  | { type: 'note'; title: string; project?: { title: string; color: string } }
  | { type: 'task'; title: string; status: TaskStatus }
  | { type: 'project'; title: string; color: string }
  | { type: 'event'; title: string; color: string };

/** One part of the mentioning line: text, the item itself, or another linked item. */
export type SnippetPart = string | { self: true } | { entity: PillEntity };

/**
 * Which block the mention is in, which is what gives it meaning: an open to-do is something
 * still to do about the item; a heading means a section is about it.
 */
export type MentionKind = 'text' | 'todo' | 'done' | 'heading';

export interface Mention {
  id: string;
  source: MentionSource;
  /** where in the source, when it isn't a note: "Description", "Event note" */
  where?: string;
  /** when the source changed: "2h ago", "Jun 12" */
  updated: string;
  kind: MentionKind;
  snippet: SnippetPart[];
  /** how many more times the source mentions it */
  more?: number;
}

export interface UnlinkedMention {
  id: string;
  source: MentionSource;
  updated: string;
  /** the line, with the plain-text title as `{ match }` */
  snippet: (string | { match: string })[];
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

function Snippet({
  parts,
  self,
  compact,
}: {
  parts: SnippetPart[];
  self: PillEntity;
  compact?: boolean;
}) {
  return (
    <span className={styles.text}>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {typeof part === 'string' ? (
            part
          ) : 'self' in part && compact ? (
            <span className={styles.selfText}>{self.title}</span>
          ) : 'self' in part ? (
            <EntityPill entity={self} className={styles.self} />
          ) : (
            <EntityPill entity={part.entity} />
          )}
        </Fragment>
      ))}
    </span>
  );
}

export function MentionCard({
  mention,
  self,
  density = 'comfortable',
}: {
  mention: Mention;
  self: PillEntity;
  density?: 'comfortable' | 'compact';
}) {
  const { source } = mention;
  return (
    <div className={styles.mention} data-density={density}>
      <div className={styles.source}>
        <span className={styles.glyph}>
          <SourceGlyph source={source} />
        </span>
        <span className={styles.title}>{source.title}</span>
        {mention.where && <span className={styles.where}>{mention.where}</span>}
        {density === 'comfortable' && source.type === 'note' && source.project && (
          <EntityPill entity={{ type: 'project', ...source.project }} />
        )}
        <span className={styles.time}>{mention.updated}</span>
      </div>
      <div className={styles.snippet} data-kind={mention.kind}>
        {(mention.kind === 'todo' || mention.kind === 'done') && (
          <Checkbox className={styles.check} checked={mention.kind === 'done'} readOnly />
        )}
        <Snippet parts={mention.snippet} self={self} compact={density === 'compact'} />
      </div>
      {mention.more != null && (
        <span className={styles.more}>
          +{mention.more} more {mention.more === 1 ? 'mention' : 'mentions'} in this{' '}
          {source.type === 'note' ? 'note' : source.type}
        </span>
      )}
    </div>
  );
}

function UnlinkedRow({ mention }: { mention: UnlinkedMention }) {
  return (
    <div className={styles.unlinked}>
      <span className={styles.glyph} style={{ marginTop: 2 }}>
        <SourceGlyph source={mention.source} />
      </span>
      <div className={styles.unlinkedBody}>
        <div className={styles.source}>
          <span className={styles.title}>{mention.source.title}</span>
          <span className={styles.time}>{mention.updated}</span>
        </div>
        <span style={{ color: 'var(--muted-foreground)', fontSize: 14, lineHeight: '20px' }}>
          {mention.snippet.map((p, i) =>
            typeof p === 'string' ? (
              <Fragment key={i}>{p}</Fragment>
            ) : (
              <mark key={i}>{p.match}</mark>
            ),
          )}
        </span>
      </div>
      <Button size="xs" variant="ghost" icon={Link}>
        Link
      </Button>
    </div>
  );
}

type Filter = 'all' | 'todo' | 'note' | 'task' | 'event';

export interface MentionsSectionProps {
  /** the item the page is for, drawn as its pill wherever a line mentions it */
  self: PillEntity;
  mentions: Mention[];
  unlinked?: UnlinkedMention[];
  /** `page`: cards with the note's project and filters; `sheet`: compact, two lines of context */
  variant?: 'page' | 'sheet';
  /** how many to show before "Show n more" */
  limit?: number;
}

export function MentionsSection({
  self,
  mentions,
  unlinked = [],
  variant = 'page',
  limit = variant === 'page' ? 4 : 3,
}: MentionsSectionProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState(false);
  const openTodos = mentions.filter((m) => m.kind === 'todo').length;
  const counts = {
    note: mentions.filter((m) => m.source.type === 'note').length,
    task: mentions.filter((m) => m.source.type === 'task' || m.source.type === 'project').length,
    event: mentions.filter((m) => m.source.type === 'event').length,
  };
  const shown = mentions.filter((m) => {
    if (filter === 'all') return true;
    if (filter === 'todo') return m.kind === 'todo';
    if (filter === 'task') return m.source.type === 'task' || m.source.type === 'project';
    return m.source.type === filter;
  });
  const visible = expanded ? shown : shown.slice(0, limit);
  const hidden = shown.length - visible.length;
  const page = variant === 'page';

  const filters = [
    { value: 'all', label: `All ${mentions.length}` },
    ...(openTodos > 0 ? [{ value: 'todo', label: `Open to-dos ${openTodos}` }] : []),
    ...(counts.note > 0 ? [{ value: 'note', label: `Notes ${counts.note}` }] : []),
    ...(counts.task > 0 ? [{ value: 'task', label: `Tasks ${counts.task}` }] : []),
    ...(counts.event > 0 ? [{ value: 'event', label: `Events ${counts.event}` }] : []),
  ];

  return (
    <>
      <DetailSection
        spacing={page ? 'page' : 'sheet'}
        title="Mentioned in"
        count={mentions.length}
        action={
          !page && openTodos > 0 ? (
            <EntityPill glyph={ListTodo}>
              {openTodos} open {openTodos === 1 ? 'to-do' : 'to-dos'}
            </EntityPill>
          ) : undefined
        }
        style={page ? undefined : { gap: 8 }}
      >
        {mentions.length === 0 ? (
          <div className={styles.empty}>
            Nothing mentions this yet. Type @ in a note to mention it.
          </div>
        ) : (
          <div className={styles.list}>
            {page && mentions.length > limit && filters.length > 2 && (
              <ToggleGroup
                aria-label="Show mentions from"
                size="sm"
                value={filter}
                onValueChange={(v) => {
                  setFilter(v as Filter);
                  setExpanded(false);
                }}
                items={filters}
                style={{ alignSelf: 'flex-start', marginBottom: 4 }}
              />
            )}
            {visible.map((m) => (
              <MentionCard
                key={m.id}
                mention={m}
                self={self}
                density={page ? 'comfortable' : 'compact'}
              />
            ))}
            {hidden > 0 && (
              <div className={styles.footer}>
                <Button
                  size="xs"
                  variant="ghost"
                  icon={ChevronDown}
                  onClick={() => setExpanded(true)}
                >
                  Show {hidden} more
                </Button>
              </div>
            )}
          </div>
        )}
      </DetailSection>
      {unlinked.length > 0 && (
        <DetailSection
          collapsible
          defaultOpen={page}
          spacing={page ? 'page' : 'sheet'}
          title="Unlinked mentions"
          count={unlinked.length}
          action={
            page && (
              <Button size="xs" variant="ghost" icon={Check}>
                Link all
              </Button>
            )
          }
        >
          <div>
            {unlinked.map((u) => (
              <UnlinkedRow key={u.id} mention={u} />
            ))}
          </div>
        </DetailSection>
      )}
    </>
  );
}
