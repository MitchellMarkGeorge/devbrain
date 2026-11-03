import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { SiGithub, SiLinear } from '@icons-pack/react-simple-icons';
import { Badge, Button, ColorBar, Icon, Progress, StatusIcon, glyph } from './primitives';
import { Flex, Text } from './layout';
import { RightClickMenu, Tooltip, type MenuItem } from './overlays';
import { ui, cx, colorValue } from './styles';
import type { TaskStatus } from './types';

export interface EntityPillProps extends Omit<ComponentProps<'button'>, 'type'> {
  type?: 'project' | 'note' | 'task' | 'event' | 'parent';
  color?: string;
  prefix?: string;
  icon?: ReactNode;
  status?: TaskStatus;
  muted?: boolean;
}
export const EntityPill = forwardRef<HTMLButtonElement, EntityPillProps>(function EntityPill(
  {
    type = 'task',
    color,
    prefix,
    icon,
    status = 'not-started',
    children,
    muted = true,
    className,
    ...props
  },
  ref,
) {
  const visual =
    icon ??
    (type === 'project' ? (
      <Icon name="folder" size={12} color={color} />
    ) : type === 'note' ? (
      <Icon name="file-text" size={12} />
    ) : type === 'event' ? (
      <ColorBar color={color} />
    ) : (
      <>
        {type === 'parent' && <Icon name="corner-down-right" size={12} />}
        <StatusIcon status={status} size={12} />
      </>
    ));
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={cx(ui('db-badge', 'db-entity', `db-entity-${type}`), className)}
      data-variant="outline"
      title={props.title ?? (typeof children === 'string' ? children : undefined)}
    >
      {glyph(visual, 12)}
      {prefix && <span className={ui('db-badge-muted')}>{prefix}</span>}
      <span className={ui('db-badge-text', muted && 'db-badge-muted')}>{children}</span>
    </button>
  );
});
export function ProviderLogo({
  provider = 'linear',
  size = 12,
}: {
  provider?: 'linear' | 'github';
  size?: number;
}) {
  const Logo = provider === 'github' ? SiGithub : SiLinear;
  return (
    <Logo
      size={size}
      color={`var(--platform-${provider})`}
      aria-label={provider === 'github' ? 'GitHub' : 'Linear'}
      role="img"
      className={ui('db-icon')}
    />
  );
}
export const SourcePill = forwardRef<
  HTMLButtonElement,
  Omit<ComponentProps<'button'>, 'type'> & { provider?: 'linear' | 'github'; compact?: boolean }
>(function SourcePill({ provider = 'linear', compact, children, className, ...props }, ref) {
  return (
    <EntityPill
      ref={ref}
      {...props}
      icon={<ProviderLogo provider={provider} />}
      className={cx(ui('db-source', compact && 'db-source-compact'), className)}
    >
      {children}
    </EntityPill>
  );
});
export interface PropertyRowProps {
  properties: ReactNode[];
  links?: ReactNode[];
  addable?: boolean;
  note?: string;
  onAdd?: () => void;
}
export function PropertyRow({ properties, links, addable = true, note, onAdd }: PropertyRowProps) {
  return (
    <div className={ui('db-prop-rows')}>
      <div className={ui('db-prop-line')}>
        {properties.map((property, index) => (
          <span key={index}>{property}</span>
        ))}
        {addable && (
          <EntityPill icon="plus" onClick={onAdd}>
            Add
          </EntityPill>
        )}
      </div>
      {(links?.length || note) && (
        <div className={ui('db-prop-line')}>
          {links?.map((link, index) => (
            <span key={index}>{link}</span>
          ))}
          {note && <span className={ui('db-prop-note')}>{note}</span>}
        </div>
      )}
    </div>
  );
}
export function DateRange({
  start,
  due,
  onStartClick,
  onDueClick,
}: {
  start?: string;
  due: string;
  onStartClick?: () => void;
  onDueClick?: () => void;
}) {
  return (
    <span className={ui('db-date-range')}>
      {start && (
        <>
          <EntityPill icon="calendar" onClick={onStartClick}>
            {start}
          </EntityPill>
          <Icon name="arrow-right" size={12} />
        </>
      )}
      <EntityPill icon="calendar" onClick={onDueClick}>
        {due}
      </EntityPill>
      {!start && (
        <EntityPill icon="plus" onClick={onStartClick}>
          Start date
        </EntityPill>
      )}
    </span>
  );
}
export interface CardProps extends Omit<ComponentProps<'section'>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  size?: 'default' | 'compact';
}
export function Card({
  title,
  description,
  action,
  size = 'default',
  children,
  className,
  ...props
}: CardProps) {
  return (
    <section {...props} data-size={size} className={cx(ui('db-card'), className)}>
      {(title || description || action) && (
        <header className={ui('db-card-header')}>
          <div>
            {title && <h3 className={ui('db-card-title')}>{title}</h3>}
            {description && <p className={ui('db-card-desc')}>{description}</p>}
          </div>
          {action && <div className={ui('db-card-action')}>{action}</div>}
        </header>
      )}
      {children && <div className={ui('db-card-body')}>{children}</div>}
    </section>
  );
}
export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}
export function Breadcrumb({
  items,
  icon,
  iconColor,
  label = 'Breadcrumb',
}: {
  items: (string | BreadcrumbItem)[];
  icon?: ReactNode;
  iconColor?: string;
  label?: string;
}) {
  return (
    <nav aria-label={label}>
      <ol className={ui('db-crumbs', 'breadcrumb-list')}>
        {items.map((item, index) => {
          const entry = typeof item === 'string' ? { label: item } : item;
          const last = index === items.length - 1;
          return (
            <li key={index} className={ui('db-crumb', last && 'db-crumb-page')}>
              {index > 0 && <Icon name="chevron-right" size={12} />}
              {last && glyph(icon, 16, iconColor)}
              {last ? (
                <span aria-current="page">{entry.label}</span>
              ) : entry.href ? (
                <a href={entry.href}>{entry.label}</a>
              ) : entry.onClick ? (
                <button type="button" className={ui('text-button')} onClick={entry.onClick}>
                  {entry.label}
                </button>
              ) : (
                <span>{entry.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
export interface SettingsGroupProps {
  rows: { label: string; description?: string; value?: string; control?: ReactNode }[];
  label?: string;
}
export function SettingsGroup({ rows, label = 'Settings' }: SettingsGroupProps) {
  return (
    <section aria-label={label} className={ui('db-card', 'settings-group')}>
      {rows.map((row) => (
        <div key={row.label} className={ui('db-settings-row')}>
          <div className={ui('db-settings-text')}>
            <Text variant="label" size="xs">
              {row.label}
            </Text>
            {row.description && (
              <Text variant="meta" tone="muted">
                {row.description}
              </Text>
            )}
          </div>
          {row.value && <span className={ui('db-settings-value')}>{row.value}</span>}
          {row.control}
        </div>
      ))}
    </section>
  );
}
export interface GroupHeadingProps {
  label: string;
  subtitle?: string;
  icon?: string;
  iconColor?: string;
  bar?: string;
  tint?: string;
  done?: number;
  total?: number;
  count?: number;
  collapsed?: boolean;
  onToggle?: () => void;
  onAdd?: () => void;
}
export function GroupHeading({
  label,
  subtitle,
  icon = 'folder',
  iconColor,
  bar,
  tint,
  done = 0,
  total = 0,
  count,
  collapsed,
  onToggle,
  onAdd,
}: GroupHeadingProps) {
  return (
    <header className={ui('dbl-group')}>
      <Button
        variant="ghost"
        size="icon-xs"
        icon={collapsed ? 'chevron-right' : 'chevron-down'}
        aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
        aria-expanded={!collapsed}
        onClick={onToggle}
      />
      <span
        className={ui('dbl-tile')}
        style={{
          color: colorValue(iconColor),
          background:
            tint ??
            (iconColor || bar
              ? `color-mix(in oklab, ${colorValue(iconColor ?? bar)} 15%, transparent)`
              : undefined),
        }}
      >
        {bar ? <ColorBar color={bar} /> : <Icon name={icon} color={iconColor} />}
      </span>
      <div className={ui('dbl-gtitle')}>
        <span className={ui('dbl-glabel')}>{label}</span>
        {subtitle && <span className={ui('dbl-gsub')}>{subtitle}</span>}
      </div>
      {!collapsed ? (
        <Button size="xs" variant="ghost" icon="plus" onClick={onAdd}>
          Add Task
        </Button>
      ) : (
        <span />
      )}
      <span className={ui('dbl-gcount')}>{count ?? `${done}/${total}`}</span>
      <Progress value={total ? (done / total) * 100 : 0} label={`${label} completion`} />
    </header>
  );
}
export interface EventRowProps {
  event: {
    title: string;
    time: string;
    repeats?: string;
    meeting?: boolean;
    relative: string;
    tone?: 'today' | 'overdue';
    color?: string;
  };
  onOpen?: () => void;
  onJoin?: () => void;
}
export function EventRow({ event, onOpen, onJoin }: EventRowProps) {
  return (
    <div className={ui('db-row')}>
      <ColorBar color={event.color} />
      <button type="button" className={ui('text-button', 'event-row-title')} onClick={onOpen}>
        <span className={ui('db-row-name')}>{event.title}</span>
        <span className={ui('db-row-time')}>
          {event.time}
          {event.repeats && ` · ${event.repeats}`}
        </span>
      </button>
      <div className={ui('db-row-side')}>
        {event.meeting && (
          <Button size="xs" icon="video" onClick={onJoin}>
            Join
          </Button>
        )}
        <span className={ui('db-date')} data-tone={event.tone}>
          {event.relative}
        </span>
      </div>
    </div>
  );
}
export interface ScheduleCardProps {
  title: string;
  time: string;
  duration?: string;
  soon?: string;
  color?: string;
  join?: boolean;
  onJoin?: () => void;
  onOpen?: () => void;
}
export function ScheduleCard({
  title,
  time,
  duration,
  soon,
  color,
  join,
  onJoin,
  onOpen,
}: ScheduleCardProps) {
  return (
    <Card size="compact">
      <Flex gap={3}>
        <ColorBar color={color} />
        <button type="button" className={ui('text-button', 'grow')} onClick={onOpen}>
          <Text variant="label" tone="strong" as="div" truncate>
            {title}
          </Text>
          <Text variant="meta" tone="muted">
            <span className={ui('db-date')} data-tone={soon ? 'today' : undefined}>
              {soon}
            </span>
            {soon && ' · '}
            {time}
            {duration && ` · ${duration}`}
          </Text>
        </button>
        {join && (
          <Button size="xs" icon="video" onClick={onJoin}>
            Join
          </Button>
        )}
      </Flex>
    </Card>
  );
}
export interface NoteCardProps {
  title: string;
  updated: string;
  preview: string;
  link?: ReactNode;
  onOpen?: () => void;
  menuItems?: MenuItem[];
}
export function NoteCard({ title, updated, preview, link, onOpen, menuItems }: NoteCardProps) {
  const card = (
    <article
      className={ui('db-card', 'db-note-card')}
      data-size="compact"
      data-has-link={link ? '' : undefined}
    >
      <button type="button" className={ui('note-card-button')} onClick={onOpen}>
        <Flex gap={2} justify="space-between">
          <Icon name="file-text" />
          <Text variant="meta" tone="muted">
            {updated}
          </Text>
        </Flex>
        <Text as="div" variant="label" tone="strong" truncate>
          {title}
        </Text>
        <p className={ui('db-note-preview')}>{preview}</p>
      </button>
      {link}
    </article>
  );
  return menuItems ? <RightClickMenu items={menuItems}>{card}</RightClickMenu> : card;
}
export interface EventBlockProps {
  title: string;
  time: string;
  color?: string;
  meeting?: boolean;
  height?: number;
  onClick?: () => void;
}
export function EventBlock({ title, time, color, meeting, height = 76, onClick }: EventBlockProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={ui('db-event', 'event-block')}
      style={{ height }}
    >
      <ColorBar color={color} />
      <div className={ui('grow')}>
        <Text as="div" variant="label" size="xs" truncate>
          {title}
        </Text>
        <div className={ui('db-event-time')}>
          {time}
          {meeting && <Icon name="video" size={12} />}
        </div>
      </div>
    </button>
  );
}
export function TruncatedPill({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Tooltip content={label}>
      <span tabIndex={0}>{children}</span>
    </Tooltip>
  );
}
export function CountBadge({ value }: { value: number }) {
  return <Badge variant="secondary">{value}</Badge>;
}
