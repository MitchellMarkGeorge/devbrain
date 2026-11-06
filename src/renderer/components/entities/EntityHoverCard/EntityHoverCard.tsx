import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { PreviewCard } from '@base-ui/react/preview-card';
import { Clock, FileText, Folder, MapPin, Repeat } from 'lucide-react';
import type {
  Event,
  ExternalRef,
  NoteListItem,
  Project,
  ProjectStats,
  ProjectSummary,
  SubtaskProgress,
  Task,
} from '@common/types';
import { cn, mergeClassName } from '../../lib/cn';
import { dueText, useFormat } from '../../lib/format';
import { ColourBar } from '../../ui/ColourBar';
import { Icon, renderIcon, type IconSource } from '../../ui/Icon';
import { Progress } from '../../ui/Progress';
import { EntityPill } from '../EntityPill';
import { PriorityIcon } from '../PriorityIcon';
import { ProjectStatusIcon } from '../ProjectStatusIcon';
import { ProviderLogo } from '../ProviderLogo';
import { SourcePill } from '../SourcePill';
import { StatusIcon } from '../StatusIcon';
import { eventTimeRange, repeatLabel } from '../../event-text';
import {
  isOverdue,
  percentOf,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  PROVIDER_LABELS,
  providerOf,
  resolveColor,
  showsOverdueFlag,
} from '../../types';
import styles from './EntityHoverCard.module.css';

export type EntityHoverCardType = 'project' | 'event' | 'note' | 'task' | 'source';

/**
 * What a hover card previews: core's row for it, with its `type`. Each picks the fields it shows;
 * the card words them itself (`useFormat()`).
 */
export type HoverCardEntity =
  /** its status and due date as pills, and its tasks done (`stats`, from `projects.stats`) */
  | ({ type: 'project' } & Pick<Project, 'title' | 'color' | 'status' | 'dueDate'> & {
        stats?: Pick<ProjectStats, 'numOfCompleted' | 'totalTasks'>;
      })
  /** its priority, due date and key as pills, and its subtasks done */
  | ({ type: 'task' } & Pick<Task, 'title' | 'status' | 'priority' | 'dueDate'> & {
        subtaskProgress?: SubtaskProgress | null;
        external?: Pick<ExternalRef, 'provider' | 'key'> | null;
      })
  /** when it was edited, its project and its first lines */
  | ({ type: 'note' } & Pick<NoteListItem, 'title' | 'preview' | 'updatedAt'> & {
        project?: Pick<ProjectSummary, 'title'> | null;
      })
  /** its day and time, how it repeats and where */
  | ({ type: 'event' } & Pick<
      Event,
      'title' | 'color' | 'startAt' | 'endAt' | 'allDay' | 'location' | 'recurrenceRule'
    >)
  /** a synced task's key: its status in the provider and when it last synced */
  | ({ type: 'source' } & Pick<Task, 'title'> & {
        external: Pick<ExternalRef, 'provider' | 'key' | 'statusLabel' | 'lastSyncedAt'>;
      });

export interface EntityHoverCardContentProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'title'
> {
  /** the item previewed */
  entity: HoverCardEntity;
  /** one or two xs buttons: Join, Open in Linear, Copy URL */
  actions?: ReactNode;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function HeaderGlyph({ entity, now }: { entity: HoverCardEntity; now: Date }) {
  switch (entity.type) {
    case 'event':
      return (
        <ColourBar color={resolveColor(entity.color, 'green')} height={16} className={styles.bar} />
      );
    case 'note':
      return <Icon icon={FileText} size={16} className={styles.mutedGlyph} />;
    case 'task': {
      const flag = showsOverdueFlag(entity.status, isOverdue(entity.status, entity.dueDate, now));
      return <StatusIcon status={entity.status} overdue={flag} size={16} />;
    }
    case 'source':
      return <ProviderLogo provider={providerOf(entity.external)} size={16} />;
    case 'project':
      return <Icon icon={Folder} size={16} className={styles.projectGlyph} />;
  }
}

/** The header's name: a synced task reads "ENG-124 · Fix the token refresh race". */
function titleOf(entity: HoverCardEntity): string {
  if (entity.type === 'source' && entity.external.key) {
    return `${entity.external.key} · ${entity.title}`;
  }
  return entity.title;
}

interface Parts {
  pills?: ReactNode;
  meta?: ReactNode[];
  preview?: ReactNode;
  progress?: { value: number; label: ReactNode };
}

/** What the card shows below its header, worded from the entity. */
function usePartsOf(entity: HoverCardEntity): Parts {
  const format = useFormat();
  switch (entity.type) {
    case 'project': {
      const stats = entity.stats;
      return {
        pills: (
          <>
            <EntityPill glyph={<ProjectStatusIcon status={entity.status} size={12} />}>
              {PROJECT_STATUS_LABELS[entity.status]}
            </EntityPill>
            {entity.dueDate && (
              <EntityPill glyph={Clock}>{dueText(entity.dueDate, format)}</EntityPill>
            )}
          </>
        ),
        progress: stats && {
          value: percentOf(stats.numOfCompleted, stats.totalTasks),
          label: `${stats.numOfCompleted} of ${stats.totalTasks} tasks done`,
        },
      };
    }
    case 'task': {
      const progress = entity.subtaskProgress;
      return {
        pills: (
          <>
            <EntityPill glyph={<PriorityIcon priority={entity.priority} size={12} />}>
              {PRIORITY_LABELS[entity.priority]}
            </EntityPill>
            {entity.dueDate && (
              <EntityPill glyph={Clock}>{dueText(entity.dueDate, format)}</EntityPill>
            )}
            {entity.external?.key && (
              <SourcePill provider={providerOf(entity.external)}>{entity.external.key}</SourcePill>
            )}
          </>
        ),
        progress: progress
          ? {
              value: percentOf(progress.completed, progress.total),
              label: `${progress.completed} of ${progress.total} subtasks done`,
            }
          : undefined,
      };
    }
    case 'note': {
      const edited = `Edited ${lowerFirst(format.formatRelative(entity.updatedAt))}`;
      return {
        meta: [entity.project ? `${edited} · ${entity.project.title}` : edited],
        preview: entity.preview ?? undefined,
      };
    }
    case 'event': {
      const repeats = repeatLabel(entity.recurrenceRule, 'long');
      return {
        meta: [
          <EntityHoverCardMeta key="time" icon={Clock}>
            {format.formatDue(entity.startAt)}, {eventTimeRange(entity, format)}
          </EntityHoverCardMeta>,
          repeats && (
            <EntityHoverCardMeta key="repeat" icon={Repeat}>
              {repeats}
            </EntityHoverCardMeta>
          ),
          entity.location && (
            <EntityHoverCardMeta key="location" icon={MapPin}>
              {entity.location}
            </EntityHoverCardMeta>
          ),
        ].filter(Boolean),
      };
    }
    case 'source': {
      const { external } = entity;
      const provider = providerOf(external);
      const name = provider ? PROVIDER_LABELS[provider] : undefined;
      return {
        meta: [
          external.statusLabel &&
            (name ? `${external.statusLabel} in ${name}` : external.statusLabel),
          `Synced ${lowerFirst(format.formatRelative(external.lastSyncedAt))}`,
        ].filter(Boolean),
      };
    }
  }
}

/**
 * What the hover card shows: a header (the pill's glyph and the item's name), then pills, meta
 * lines, a two-line preview, progress and actions, 10px apart, each worded from the `entity`.
 * `EntityHoverCard` puts it in the popup; use it on its own only for static pictures.
 */
export const EntityHoverCardContent = forwardRef<HTMLDivElement, EntityHoverCardContentProps>(
  function EntityHoverCardContent({ entity, actions, className, style, children, ...props }, ref) {
    const { now } = useFormat();
    const { pills, meta, preview, progress } = usePartsOf(entity);
    const color =
      entity.type === 'project' || entity.type === 'event' ? resolveColor(entity.color) : undefined;
    const vars = color ? ({ '--entity-color': color } as CSSProperties) : undefined;
    const title = titleOf(entity);
    return (
      <div
        ref={ref}
        data-entity={entity.type}
        className={cn(styles.card, className)}
        style={{ ...vars, ...style }}
        {...props}
      >
        <div className={styles.head}>
          <HeaderGlyph entity={entity} now={now} />
          <span className={styles.title} title={title}>
            {title}
          </span>
        </div>
        {pills != null && <div className={styles.pills}>{pills}</div>}
        {meta?.map((line, i) => (
          <div key={i} className={styles.meta}>
            {line}
          </div>
        ))}
        {preview != null && <p className={styles.preview}>{preview}</p>}
        {progress && (
          <div className={styles.progress}>
            <Progress value={progress.value} aria-label="Progress" />
            <div className={cn(styles.meta, styles.progressLabel)}>
              <span className={styles.progressValue}>{Math.round(progress.value)}%</span>
              <span className={styles.metaText}>{progress.label}</span>
            </div>
          </div>
        )}
        {children}
        {actions != null && <div className={styles.actions}>{actions}</div>}
      </div>
    );
  },
);

export interface EntityHoverCardMetaProps {
  /** a 12px icon before the text: `Clock`, `Repeat`, `MapPin` */
  icon?: IconSource;
  children: ReactNode;
}

/** A meta line with its icon: `<EntityHoverCardMeta icon={Clock}>Today, 10:00 – 10:30 AM</EntityHoverCardMeta>` */
export function EntityHoverCardMeta({ icon, children }: EntityHoverCardMetaProps) {
  return (
    <>
      {renderIcon(icon, 12)}
      <span className={styles.metaText}>{children}</span>
    </>
  );
}

export interface EntityHoverCardProps extends EntityHoverCardContentProps {
  /** the pill that opens the card: it is rendered as the trigger, and clicking it still opens the item */
  children: ReactElement;
  /** ms of pointing before it opens; about 400 so moving across a row doesn't flash cards */
  delay?: number;
  /** ms before it closes once the pointer leaves the pill and the card */
  closeDelay?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** below the pill by default, flipping above near the window's edge */
  side?: PreviewCard.Positioner.Props['side'];
  align?: PreviewCard.Positioner.Props['align'];
  /** extra classes for the popup surface */
  popupClassName?: PreviewCard.Popup.Props['className'];
}

/**
 * Wraps an entity pill so pointing at it (or focusing it) for about 400ms opens a preview 4px
 * below it. It stays while the pointer is on the pill or the card, and closes on leaving or Esc.
 * ```tsx
 * <EntityHoverCard entity={{ type: 'project', ...project, stats }}>
 *   <EntityPill entity={{ type: 'project', ...project }} />
 * </EntityHoverCard>
 * ```
 */
export function EntityHoverCard({
  children,
  delay = 400,
  closeDelay = 200,
  open,
  defaultOpen,
  onOpenChange,
  side = 'bottom',
  align = 'start',
  popupClassName,
  ...content
}: EntityHoverCardProps) {
  return (
    <PreviewCard.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}
    >
      <PreviewCard.Trigger delay={delay} closeDelay={closeDelay} render={children} />
      <PreviewCard.Portal>
        <PreviewCard.Positioner
          side={side}
          align={align}
          sideOffset={4}
          collisionPadding={8}
          className={styles.positioner}
        >
          <PreviewCard.Popup
            aria-label={titleOf(content.entity)}
            className={mergeClassName(styles.popup, popupClassName)}
          >
            <EntityHoverCardContent {...content} />
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
