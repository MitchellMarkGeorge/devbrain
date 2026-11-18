/**
 * A proposal for the sidebar, drawn with the design system's Sidebar parts plus a few mock-only
 * extras (SidebarRedesign.module.css). Nothing in the app uses it.
 *
 * - Today and Upcoming lead: time is how the day is organised, not entity type.
 * - Pinned replaces Favorites: no cap, ordered by hand (drag), stable under the cursor.
 * - Projects is the spine: active projects with their colour and open-task count, "+" on hover.
 * - Saved views: task filters (the tasks page's search params) saved by name.
 * - Recents moves to ⌘K's empty state; Tasks, Notes and Calendar stay as rows under Upcoming.
 * - The footer is one line: sync dot, Settings and Help (Trash moves into Settings).
 */
import type { ReactNode } from 'react';
import {
  CalendarClock,
  Calendar,
  CircleCheck,
  CircleHelp,
  FileText,
  Filter,
  Folder,
  GripVertical,
  Plus,
  Settings,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { TaskStatus } from '@common/types';
import { Sidebar, SidebarContent, SidebarGroup, SidebarItem } from '../../shell/Sidebar';
import { StatusIcon } from '../../entities/StatusIcon';
import { Icon } from '../../ui/Icon';
import { Tooltip } from '../../ui/Tooltip';
import type { Swatch } from '../../types';
import styles from './SidebarRedesign.module.css';

export type RedesignPage =
  | 'Today'
  | 'Upcoming'
  | 'Tasks'
  | 'Notes'
  | 'Calendar'
  | `project:${string}`
  | `view:${string}`;

interface Row {
  label: string;
  icon?: ReactNode | LucideIcon;
  iconColor?: Swatch;
  bar?: Swatch;
  count?: number;
  urgent?: boolean;
}

const PINNED: Row[] = [
  { label: 'Implement OAuth2 PKCE flow', icon: <StatusIcon status={TaskStatus.IN_PROGRESS} /> },
  { label: 'Auth provider eval matrix', icon: FileText },
  { label: 'Sprint Planning', bar: 'green' },
  { label: 'Release checklist', icon: FileText },
];

const PROJECTS: Row[] = [
  { label: 'Auth Overhaul', iconColor: 'blue', count: 5 },
  { label: 'API Gateway v2', iconColor: 'amber', count: 8 },
  { label: 'User Interface Revamp', iconColor: 'indigo', count: 12 },
  { label: 'Billing migration', iconColor: 'pink', count: 3 },
];

const VIEWS: Row[] = [
  { label: 'Overdue · high priority', icon: Filter, count: 2, urgent: true },
  { label: 'Linear issues', icon: Filter, count: 9 },
];

export interface RedesignSidebarProps {
  active?: RedesignPage;
  /** draw a row as pointed at, to show its hover action */
  hover?: string;
  /** show a pinned row mid-drag, with the line where it will land */
  dragging?: boolean;
  sync?: 'synced' | 'syncing' | 'error';
  /** Tasks, Notes and Calendar: ordinary rows under Upcoming (default), or a row of tiles at the end */
  library?: 'rows' | 'tiles';
}

const LIBRARY = [
  ['Tasks', CircleCheck],
  ['Notes', FileText],
  ['Calendar', Calendar],
] as const;

function CountedItem({
  row,
  active,
  hover,
  action,
  grip,
  dragging,
}: {
  row: Row;
  active?: boolean;
  hover?: boolean;
  action?: string;
  grip?: boolean;
  dragging?: boolean;
}) {
  return (
    <div
      className={styles.row}
      data-hover={hover ? '' : undefined}
      data-dragging={dragging ? '' : undefined}
      data-trailing={row.count !== undefined || action ? '' : undefined}
    >
      <SidebarItem
        icon={row.icon ?? (row.iconColor ? Folder : undefined)}
        iconColor={row.iconColor}
        bar={row.bar}
        active={active}
      >
        {row.label}
      </SidebarItem>
      {grip && (
        <span className={styles.grip}>
          <Icon icon={GripVertical} size={12} />
        </span>
      )}
      <span className={styles.trailing}>
        {row.count !== undefined && (
          <span className={styles.count} data-urgent={row.urgent ? '' : undefined}>
            {row.count}
          </span>
        )}
        {action && (
          <span className={styles.hoverAction} aria-label={action}>
            <Icon icon={Plus} size={14} />
          </span>
        )}
      </span>
    </div>
  );
}

function LabelRow({ label, action }: { label: string; action?: string }) {
  return (
    <div className={styles.labelRow}>
      <span>{label}</span>
      {action && (
        <Tooltip content={action}>
          <button type="button" className={styles.labelAction} aria-label={action}>
            <Icon icon={Plus} size={14} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

export function RedesignSidebar({
  active = 'Today',
  hover,
  dragging,
  sync = 'synced',
  library = 'rows',
}: RedesignSidebarProps) {
  const pinned = dragging
    ? [PINNED[0], PINNED[2], PINNED[1], PINNED[3]] // "Sprint Planning" lifted, moving up
    : PINNED;
  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <CountedItem
            row={{ label: 'Today', icon: Sun, count: 3, urgent: true }}
            active={active === 'Today'}
          />
          <CountedItem
            row={{ label: 'Upcoming', icon: CalendarClock, count: 14 }}
            active={active === 'Upcoming'}
          />
          {library === 'rows' && <div className={styles.separator} role="separator" />}
          {library === 'rows' &&
            LIBRARY.map(([label, icon]) => (
              <SidebarItem key={label} icon={icon} active={active === label}>
                {label}
              </SidebarItem>
            ))}
        </SidebarGroup>

        <SidebarGroup label="Pinned">
          {pinned.map((row, i) => (
            <div key={row.label}>
              {dragging && i === 1 && <div className={styles.dropLine} />}
              <CountedItem
                row={row}
                grip
                hover={hover === row.label}
                dragging={dragging && row.label === 'Sprint Planning'}
              />
            </div>
          ))}
        </SidebarGroup>

        <div>
          <LabelRow label="Projects" action="New project" />
          {PROJECTS.map((row) => (
            <CountedItem
              key={row.label}
              row={row}
              action="New task in project"
              hover={hover === row.label}
              active={active === `project:${row.label}`}
            />
          ))}
        </div>

        <div>
          <LabelRow label="Saved views" action="Save current filters" />
          {VIEWS.map((row) => (
            <CountedItem key={row.label} row={row} active={active === `view:${row.label}`} />
          ))}
        </div>

        {library === 'tiles' && (
          <div className={styles.library} role="group" aria-label="All items">
            {LIBRARY.map(([label, icon]) => (
              <button
                key={label}
                type="button"
                className={styles.libraryItem}
                data-active={active === label ? '' : undefined}
              >
                <Icon icon={icon} size={16} />
                {label}
              </button>
            ))}
          </div>
        )}
      </SidebarContent>

      <div className={styles.footer}>
        <Tooltip content="Linear and Google Calendar · open Integrations">
          <span className={styles.sync}>
            <span className={styles.dot} data-state={sync} />
            {sync === 'error'
              ? 'Sync failed · Retry'
              : sync === 'syncing'
                ? 'Syncing…'
                : 'Synced 2 min ago'}
          </span>
        </Tooltip>
        <Tooltip content="Settings" shortcut="⌘,">
          <button type="button" className={styles.labelAction} aria-label="Settings">
            <Icon icon={Settings} size={16} />
          </button>
        </Tooltip>
        <Tooltip content="Help" shortcut="?">
          <button type="button" className={styles.labelAction} aria-label="Help">
            <Icon icon={CircleHelp} size={16} />
          </button>
        </Tooltip>
      </div>
    </Sidebar>
  );
}
