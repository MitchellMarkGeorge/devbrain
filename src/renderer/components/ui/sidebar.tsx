import { useState, type ReactElement } from 'react';
import { Drawer } from '@base-ui/react/drawer';
import { Collapsible } from '@base-ui/react/collapsible';
import { ScrollArea } from '@base-ui/react/scroll-area';
import { Button, ColorBar, Icon, WorkspaceTile } from './primitives';
import { DropdownMenu, Tooltip, useCompact, type MenuItem } from './overlays';
import { ui } from './styles';
import type { Swatch } from './types';
export interface SidebarEntry {
  id?: string;
  label: string;
  icon?: string;
  color?: string;
  bar?: string;
  href?: string;
  onClick?: () => void;
}
export interface SidebarProps {
  workspace?: string;
  workspaceColor?: Swatch;
  active?: string;
  recents?: SidebarEntry[];
  favorites?: SidebarEntry[];
  navigation?: SidebarEntry[];
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onNavigate?: (entry: SidebarEntry) => void;
  onSearch?: () => void;
  onCreate?: () => void;
  workspaceActions?: MenuItem[];
}
const defaultNavigation: SidebarEntry[] = [
  { label: 'Home', icon: 'house' },
  { label: 'Tasks', icon: 'circle-check' },
  { label: 'Projects', icon: 'folder' },
  { label: 'Notes', icon: 'file-text' },
  { label: 'Calendar', icon: 'calendar' },
];
export function Sidebar({
  workspace = 'Workspace',
  workspaceColor = 'blue',
  active = 'Home',
  recents = [],
  favorites = [],
  navigation = defaultNavigation,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  onNavigate,
  onSearch,
  onCreate,
  workspaceActions = [],
}: SidebarProps) {
  const compact = useCompact();
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isCollapsed = (collapsed ?? internalCollapsed) || compact;
  const setCollapsed = (next: boolean) => {
    setInternalCollapsed(next);
    onCollapsedChange?.(next);
  };
  const navigate = (entry: SidebarEntry) => {
    entry.onClick?.();
    onNavigate?.(entry);
    setDrawerOpen(false);
  };
  function entryButton(entry: SidebarEntry, rail = false): ReactElement {
    const current = active === (entry.id ?? entry.label);
    const content = (
      <>
        {entry.bar ? (
          <ColorBar color={entry.bar} />
        ) : (
          <Icon name={entry.icon ?? 'file-text'} color={entry.color} />
        )}
        {!rail && <span>{entry.label}</span>}
      </>
    );
    const props = {
      className: ui('db-sidebar-btn'),
      'data-active': current ? '' : undefined,
      'aria-current': current ? ('page' as const) : undefined,
      'aria-label': rail ? entry.label : undefined,
      onClick: () => navigate(entry),
    };
    const button = entry.href ? (
      <a {...props} href={entry.href}>
        {content}
      </a>
    ) : (
      <button type="button" {...props}>
        {content}
      </button>
    );
    return rail ? <Tooltip content={entry.label}>{button}</Tooltip> : button;
  }
  function group(label: string, entries: SidebarEntry[]) {
    return (
      entries.length > 0 && (
        <Collapsible.Root defaultOpen className={ui('db-sidebar-group')}>
          <Collapsible.Trigger className={ui('db-sidebar-group-label', 'sidebar-group-trigger')}>
            {label}
            <Icon name="chevron-down" size={12} />
          </Collapsible.Trigger>
          <Collapsible.Panel>
            <div className={ui('db-sidebar-menu')}>
              {entries.map((entry) => (
                <div key={entry.id ?? entry.label}>{entryButton(entry)}</div>
              ))}
            </div>
          </Collapsible.Panel>
        </Collapsible.Root>
      )
    );
  }
  const expanded = (
    <>
      <header className={ui('db-sidebar-header')}>
        <DropdownMenu
          trigger={
            <Button
              variant="ghost"
              title={`${workspace} workspace menu`}
              trailingIcon="chevron-down"
              icon={
                <span aria-hidden="true">
                  <WorkspaceTile letter={workspace} color={workspaceColor} />
                </span>
              }
            >
              {workspace}
            </Button>
          }
          items={workspaceActions}
        />
        <div className={ui('db-sidebar-header-actions')}>
          <Button
            variant="ghost"
            size="icon-xs"
            icon="search"
            aria-label="Search"
            onClick={onSearch}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            icon="plus"
            aria-label="Create new"
            onClick={onCreate}
          />
        </div>
      </header>
      <ScrollArea.Root className={ui('sidebar-scroll')}>
        <ScrollArea.Viewport>
          <ScrollArea.Content>
            <nav aria-label="Main navigation" className={ui('db-sidebar-menu')}>
              {navigation.map((entry) => (
                <div key={entry.id ?? entry.label}>{entryButton(entry)}</div>
              ))}
            </nav>
            {group('Favorites', favorites)}
            {group('Recents', recents)}
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className={ui('scrollbar')}>
          <ScrollArea.Thumb className={ui('scrollbar-thumb')} />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
      <footer className={ui('sidebar-footer')}>
        {entryButton({ label: 'Settings', icon: 'settings' })}
        {entryButton({ label: 'Help', icon: 'circle-question-mark' })}
        <Button
          variant="ghost"
          icon="panel-left-close"
          onClick={() => (compact ? setDrawerOpen(false) : setCollapsed(true))}
        >
          Collapse Sidebar
        </Button>
      </footer>
    </>
  );
  return (
    <>
      <aside
        aria-label="Workspace sidebar"
        className={ui('db-sidebar', isCollapsed && 'sidebar-rail')}
      >
        {isCollapsed ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Expand sidebar"
              onClick={() => (compact ? setDrawerOpen(true) : setCollapsed(false))}
              icon={
                <span aria-hidden="true">
                  <WorkspaceTile letter={workspace} color={workspaceColor} />
                </span>
              }
            />
            <nav aria-label="Main navigation" className={ui('db-sidebar-menu')}>
              {navigation.map((entry) => (
                <div key={entry.id ?? entry.label}>{entryButton(entry, true)}</div>
              ))}
            </nav>
            <div className={ui('sidebar-footer')}>
              {entryButton({ label: 'Settings', icon: 'settings' }, true)}
              <Tooltip content="Search">
                <Button
                  variant="ghost"
                  size="icon"
                  icon="search"
                  aria-label="Search"
                  onClick={onSearch}
                />
              </Tooltip>
            </div>
          </>
        ) : (
          expanded
        )}
      </aside>
      {compact && (
        <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen} swipeDirection="left">
          <Drawer.Portal>
            <Drawer.Backdrop className={ui('backdrop')} />
            <Drawer.Popup className={ui('db-sidebar', 'sidebar-drawer')}>
              <Drawer.Title className={ui('sr-only')}>Workspace navigation</Drawer.Title>
              {expanded}
            </Drawer.Popup>
          </Drawer.Portal>
        </Drawer.Root>
      )}
    </>
  );
}
