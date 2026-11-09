import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { Collapsible } from '@base-ui/react/collapsible';
import { ChevronRight, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import { ColourBar } from '../../ui/ColourBar';
import { useWorkspaceShell } from '../WorkspaceShell/context';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../ui/DropdownMenu';
import { Icon, renderIcon, type IconSource } from '../../ui/Icon';
import { Kbd } from '../../ui/Kbd';
import { ScrollArea } from '../../ui/ScrollArea';
import { Tooltip } from '../../ui/Tooltip';
import { WindowControls, WindowStart } from '../WindowBar';
import { WorkspaceTile } from '../../entities/WorkspaceTile';
import { cssColor, type Swatch } from '../../types';
import styles from './Sidebar.module.css';

export interface SidebarProps extends ComponentPropsWithoutRef<'nav'> {
  /**
   * The title bar's start (traffic lights on macOS, the menu button on Windows, nothing on Linux)
   * and the window controls beside it (sidebar toggle, back, forward) on a 48px row at the top of
   * the sidebar, laid out as the `WindowBar` is, so the toggle never moves. On by default inside a `WorkspaceShell`, docked and in the drawer alike.
   */
  windowControls?: boolean;
}

/**
 * The app's sidebar: 256px on the page colour with a hairline at its right. Compose it from
 * `SidebarHeader`, `SidebarContent` (scrolling `SidebarGroup`s of `SidebarItem`s) and
 * `SidebarFooter`. Inside a `WorkspaceShell` the shell docks it, or hides it and opens it as a drawer.
 */
export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { windowControls, className, children, 'aria-label': ariaLabel = 'Main', ...props },
  ref,
) {
  const shell = useWorkspaceShell();
  const showControls = windowControls ?? shell.inShell;
  return (
    <nav
      ref={ref}
      aria-label={ariaLabel}
      data-drawer={shell.inDrawer ? '' : undefined}
      className={cn(styles.sidebar, className)}
      {...props}
    >
      {/* everything scrolls in it, under the pinned rows, with the thin scrollbar */}
      <ScrollArea className={styles.area} viewportClassName={styles.scroller}>
        {showControls && (
          <div className={styles.windowRow}>
            <WindowStart />
            <WindowControls />
          </div>
        )}
        {children}
      </ScrollArea>
    </nav>
  );
});

/** The top row: the workspace switcher, then search and "new" (`SidebarHeaderActions`). */
export const SidebarHeader = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function SidebarHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn(styles.header, className)} {...props} />;
  },
);

/** The header's right side: search and "new" (`SidebarAction`s). */
export const SidebarHeaderActions = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function SidebarHeaderActions({ className, ...props }, ref) {
    return <div ref={ref} className={cn(styles.headerActions, className)} {...props} />;
  },
);

export interface SidebarActionProps extends Omit<ComponentPropsWithoutRef<'button'>, 'children'> {
  icon: IconSource;
  /** what it does: its name and tooltip ("Search", "New task") */
  label: string;
  /** its shortcut in the tooltip: "⌘K" */
  shortcut?: string;
}

/** A header action (search, new): a 28px icon button beside the workspace, named in a tooltip. */
export const SidebarAction = forwardRef<HTMLButtonElement, SidebarActionProps>(
  function SidebarAction({ icon, label, shortcut, className, ...props }, ref) {
    return (
      <Tooltip content={<TooltipLabel label={label} shortcut={shortcut} />} side="bottom">
        <button
          ref={ref}
          type="button"
          aria-label={label}
          className={cn(styles.action, className)}
          {...props}
        >
          {renderIcon(icon, 16)}
        </button>
      </Tooltip>
    );
  },
);

function TooltipLabel({ label, shortcut }: { label: string; shortcut?: string }) {
  if (!shortcut) return <>{label}</>;
  return (
    <span className={styles.tooltipLabel}>
      {label}
      <Kbd>{shortcut}</Kbd>
    </span>
  );
}

export interface SidebarWorkspaceProps {
  /** the workspace's name; its first letter goes on the tile */
  name: string;
  color?: Swatch;
  /** the workspace menu (`WorkspaceSwitcher`, or `DropdownMenuItem`s) */
  children?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * The workspace switcher: the 20px tile, the name (14px medium) and an up-down chevron that opens
 * the workspace menu (pressed while open).
 */
export function SidebarWorkspace({
  name,
  color,
  children,
  open,
  defaultOpen,
  onOpenChange,
}: SidebarWorkspaceProps) {
  return (
    <DropdownMenu open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger className={styles.workspace} aria-label={`Workspace: ${name}`}>
        <WorkspaceTile letter={name} color={color} />
        <span className={styles.workspaceName}>{name}</span>
        <Icon icon={ChevronsUpDown} size={12} className={styles.chevron} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" width="lg">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The middle: the main navigation, Recents and Favorites. It scrolls with the footer, under the
 * pinned header, when the window is too short.
 */
export const SidebarContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function SidebarContent({ className, children, ...props }, ref) {
    return (
      <div ref={ref} className={cn(styles.content, className)} {...props}>
        <div className={styles.contentInner}>{children}</div>
      </div>
    );
  },
);

export interface SidebarGroupProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** the group label: "Recents", "Favorites"; a group without one is the main navigation */
  label?: string;
  /** clicking the label folds the group away (default `true`; a group without a label never folds) */
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

/**
 * A group of items, with Nova's 32px label. A labelled group (Recents, Favorites) folds away from
 * its label, its chevron showing on hover; pass `collapsible={false}` to keep one open.
 */
export const SidebarGroup = forwardRef<HTMLDivElement, SidebarGroupProps>(function SidebarGroup(
  {
    label,
    collapsible = true,
    defaultOpen = true,
    open,
    onOpenChange,
    className,
    children,
    ...props
  },
  ref,
) {
  const menu = <SidebarMenu data-main={label ? undefined : ''}>{children}</SidebarMenu>;

  if (collapsible && label) {
    return (
      <Collapsible.Root
        ref={ref}
        defaultOpen={defaultOpen}
        open={open}
        onOpenChange={onOpenChange}
        className={cn(styles.group, className)}
        {...props}
      >
        <Collapsible.Trigger className={styles.groupLabel}>
          {label}
          <Icon icon={ChevronRight} size={12} className={styles.groupChevron} />
        </Collapsible.Trigger>
        <Collapsible.Panel className={styles.panel}>{menu}</Collapsible.Panel>
      </Collapsible.Root>
    );
  }
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn(styles.group, className)}
      {...props}
    >
      {label && <SidebarGroupLabel aria-hidden>{label}</SidebarGroupLabel>}
      {menu}
    </div>
  );
});

/** A group's 12px label, for groups composed by hand. */
export const SidebarGroupLabel = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function SidebarGroupLabel({ className, ...props }, ref) {
    return <div ref={ref} className={cn(styles.groupLabel, className)} {...props} />;
  },
);

/** The list of items in a group. */
export const SidebarMenu = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function SidebarMenu({ className, ...props }, ref) {
    return <div ref={ref} className={cn(styles.menu, className)} {...props} />;
  },
);

export interface SidebarItemProps extends Omit<useRender.ComponentProps<'button'>, 'children'> {
  /** the page or item's name */
  children: string;
  /** a Lucide icon or a node, 16px */
  icon?: IconSource;
  /** the icon's colour: a project's folder in its swatch colour */
  iconColor?: Swatch | string;
  /** an event's calendar colour, drawn as a bar instead of an icon */
  bar?: Swatch | string;
  /** the current page: `sidebar-accent` with a `border-strong` outline */
  active?: boolean;
}

/**
 * A 32px sidebar item: icon (or an event's bar) and label. A `button` by default; pass
 * `render={<a href="…" />}` for navigation. Picking one in the drawer closes it.
 */
export const SidebarItem = forwardRef<HTMLButtonElement, SidebarItemProps>(function SidebarItem(
  { children, icon, iconColor, bar, active, render, onClick, ...props },
  ref,
) {
  const shell = useWorkspaceShell();
  const glyph = bar ? (
    <span className={styles.itemBar}>
      <ColourBar color={bar} height={16} />
    </span>
  ) : (
    icon && (
      <span
        className={styles.itemIcon}
        data-coloured={iconColor ? '' : undefined}
        style={{ '--item-icon-color': cssColor(iconColor) } as CSSProperties}
      >
        {renderIcon(icon, 16)}
      </span>
    )
  );

  const element = useRender({
    ref,
    defaultTagName: 'button',
    render,
    props: mergeProps<'button'>(
      {
        className: styles.item,
        type: render ? undefined : 'button',
        'aria-current': active ? 'page' : undefined,
        onClick: (event: MouseEvent<HTMLButtonElement>) => {
          onClick?.(event);
          if (shell.inDrawer && !event.defaultPrevented) shell.closeDrawer();
        },
        children: (
          <>
            {glyph}
            <span className={styles.itemLabel}>{children}</span>
          </>
        ),
        ...({ 'data-active': active ? '' : undefined } as object),
      },
      props,
    ),
  });

  return element;
});

/** The bottom of the sidebar: the sync status, then Trash, Settings and Help. */
export const SidebarFooter = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function SidebarFooter({ className, ...props }, ref) {
    return <div ref={ref} className={cn(styles.footer, className)} {...props} />;
  },
);
