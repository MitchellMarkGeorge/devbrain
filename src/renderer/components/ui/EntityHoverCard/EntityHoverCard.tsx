import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { PreviewCard } from '@base-ui/react/preview-card';
import { FileText, Folder } from 'lucide-react';
import { cn, mergeClassName } from '../../lib/cn';
import { ColourBar } from '../ColourBar';
import { Icon, renderIcon, type IconSource } from '../Icon';
import { Progress } from '../Progress';
import { ProviderLogo } from '../ProviderLogo';
import { StatusIcon } from '../StatusIcon';
import { resolveColor, type Provider, type Swatch, type TaskStatus } from '../types';
import styles from './EntityHoverCard.module.css';

export type EntityHoverCardType = 'project' | 'event' | 'note' | 'task' | 'source';

export interface EntityHoverCardContentProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'title'
> {
  /** picks the header glyph, matching the pill: folder, bar, file, status icon or provider logo */
  type: EntityHoverCardType;
  /** the item's name; ends in "…" when it runs out of room */
  title: string;
  /** a project's folder or an event's bar: a swatch name or a CSS colour */
  color?: Swatch | string;
  /** the task's status (`task`) */
  status?: TaskStatus;
  /** the provider of a synced task (`source`) */
  provider?: Provider;
  /** status, priority and date pills */
  pills?: ReactNode;
  /** quiet 12px lines: due date, time, how it repeats, edited, sync. Use `EntityHoverCardMeta` for a line with an icon. */
  meta?: ReactNode[];
  /** a note's first lines, clamped to two */
  preview?: ReactNode;
  /** a progress bar with its percentage and a label: `{ value: 25, label: '3 of 12 tasks done' }` */
  progress?: { value: number; label: ReactNode };
  /** one or two xs buttons: Join, Open in Linear, Copy URL */
  actions?: ReactNode;
}

function HeaderGlyph({
  type,
  color,
  status,
  provider,
}: Pick<EntityHoverCardContentProps, 'type' | 'color' | 'status' | 'provider'>) {
  switch (type) {
    case 'event':
      return <ColourBar color={color} height={16} className={styles.bar} />;
    case 'note':
      return <Icon icon={FileText} size={16} className={styles.mutedGlyph} />;
    case 'task':
      return <StatusIcon status={status ?? 'in-progress'} size={16} />;
    case 'source':
      return <ProviderLogo provider={provider} size={16} />;
    case 'project':
      return <Icon icon={Folder} size={16} className={styles.projectGlyph} />;
  }
}

/**
 * What the hover card shows: a header (the pill's glyph and the item's name), then pills, meta
 * lines, a two-line preview, progress and actions, 10px apart. `EntityHoverCard` puts it in the
 * popup; use it on its own only for static pictures.
 */
export const EntityHoverCardContent = forwardRef<HTMLDivElement, EntityHoverCardContentProps>(
  function EntityHoverCardContent(
    {
      type,
      title,
      color,
      status,
      provider,
      pills,
      meta,
      preview,
      progress,
      actions,
      className,
      style,
      children,
      ...props
    },
    ref,
  ) {
    const vars = color ? ({ '--entity-color': resolveColor(color) } as CSSProperties) : undefined;
    return (
      <div
        ref={ref}
        data-entity={type}
        className={cn(styles.card, className)}
        style={{ ...vars, ...style }}
        {...props}
      >
        <div className={styles.head}>
          <HeaderGlyph type={type} color={color} status={status} provider={provider} />
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
 * <EntityHoverCard type="project" title="Website redesign" color="blue" progress={…}>
 *   <EntityPill type="project" color="blue">Website redesign</EntityPill>
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
            aria-label={content.title}
            className={mergeClassName(styles.popup, popupClassName)}
          >
            <EntityHoverCardContent {...content} />
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
