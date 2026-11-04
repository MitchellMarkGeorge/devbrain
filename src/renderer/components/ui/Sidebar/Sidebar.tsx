import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { Collapsible } from '@base-ui/react/collapsible';
import { ScrollArea } from '@base-ui/react/scroll-area';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../DropdownMenu/DropdownMenu';
import { Icon, renderIcon, type IconSource } from '../Icon';
import { Tooltip } from '../Tooltip';
import { WorkspaceTile } from '../WorkspaceTile';
import { resolveColor, type Swatch } from '../types';
import styles from './Sidebar.module.css';

interface SidebarContextValue {
  collapsed: boolean;
}

const SidebarContext = createContext<SidebarContextValue>({ collapsed: false });

/** Whether the sidebar around this component is the collapsed icon rail. */
export function useSidebar(): SidebarContextValue {
  return useContext(SidebarContext);
}

export interface SidebarProps extends ComponentPropsWithoutRef<'nav'> {
  /**
   * the 56px icon rail: the workspace tile, then one icon button per page with a tooltip. The
   * page decides when (the user's choice, or a compact window).
   */
  collapsed?: boolean;
}

/**
 * The app's sidebar: 256px on the page colour, or the 56px rail when `collapsed`. Compose it from
 * `SidebarHeader`, `SidebarContent` (scrolling `SidebarGroup`s of `SidebarItem`s) and
 * `SidebarFooter`.
 */
export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { collapsed = false, className, 'aria-label': ariaLabel = 'Main', ...props },
  ref,
) {
  return (
    <SidebarContext.Provider value={{ collapsed }}>
      <nav
        ref={ref}
        aria-label={ariaLabel}
        data-collapsed={collapsed ? '' : undefined}
        className={cn(styles.sidebar, className)}
        {...props}
      />
    </SidebarContext.Provider>
  );
});

/** The top row: the workspace switcher, then search and "new" (`SidebarHeaderActions`). */
export const SidebarHeader = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function SidebarHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn(styles.header, className)} {...props} />;
  },
);

/** The header's right side: a search button and the 24px "new" button. */
export const SidebarHeaderActions = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function SidebarHeaderActions({ className, ...props }, ref) {
    return <div ref={ref} className={cn(styles.headerActions, className)} {...props} />;
  },
);

export interface SidebarWorkspaceProps {
  /** the workspace's name; its first letter goes on the tile */
  name: string;
  color?: Swatch;
  /** the workspace menu's items (`DropdownMenuItem`s): switch, create, settings */
  children?: ReactNode;
}

/**
 * The workspace switcher: the 20px tile, the name (14px medium) and a chevron that opens the
 * workspace menu. In the rail, the tile alone.
 */
export function SidebarWorkspace({ name, color, children }: SidebarWorkspaceProps) {
  const { collapsed } = useSidebar();
  const trigger = (
    <DropdownMenuTrigger className={styles.workspace} aria-label={`Workspace: ${name}`}>
      <WorkspaceTile letter={name} color={color} />
      <span className={styles.workspaceName}>{name}</span>
      <Icon icon={ChevronDown} size={12} className={styles.chevron} />
    </DropdownMenuTrigger>
  );
  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip content={name} side="right">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent align="start">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The scrolling middle: the main navigation, Recents and Favorites. */
export const SidebarContent = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function SidebarContent({ className, children, ...props }, ref) {
    return (
      <ScrollArea.Root ref={ref} className={cn(styles.content, className)} {...props}>
        <ScrollArea.Viewport className={styles.viewport}>
          <div className={styles.contentInner}>{children}</div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" className={styles.scrollbar}>
          <ScrollArea.Thumb className={styles.thumb} />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    );
  },
);

export interface SidebarGroupProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** the group label: "Recents", "Favorites"; a group without one is the main navigation */
  label?: string;
  /** the label folds the group away */
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** show the group in the rail too; labelled groups hide there by default */
  showInRail?: boolean;
  children?: ReactNode;
}

/** A group of items, with Nova's 32px label. Labelled groups can fold away (`collapsible`). */
export const SidebarGroup = forwardRef<HTMLDivElement, SidebarGroupProps>(function SidebarGroup(
  {
    label,
    collapsible = false,
    defaultOpen = true,
    open,
    onOpenChange,
    showInRail,
    className,
    children,
    ...props
  },
  ref,
) {
  const { collapsed } = useSidebar();
  if (collapsed && label && !showInRail) return null;
  const showLabel = label && !collapsed;
  const menu = <SidebarMenu>{children}</SidebarMenu>;

  if (collapsible && showLabel) {
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
      {showLabel && <SidebarGroupLabel aria-hidden>{label}</SidebarGroupLabel>}
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
  /** the page or item's name; the rail shows it in a tooltip */
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
 * `render={<a href="…" />}` (with `nativeButton` semantics left to the link) for navigation.
 */
export const SidebarItem = forwardRef<HTMLButtonElement, SidebarItemProps>(function SidebarItem(
  { children, icon, iconColor, bar, active, render, ...props },
  ref,
) {
  const { collapsed } = useSidebar();
  const glyph = bar ? (
    <span
      className={styles.itemBar}
      style={{ '--item-bar-color': resolveColor(bar) } as CSSProperties}
    />
  ) : (
    icon && (
      <span
        className={styles.itemIcon}
        data-coloured={iconColor ? '' : undefined}
        style={{ '--item-icon-color': resolveColor(iconColor) } as CSSProperties}
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

  return collapsed ? (
    <Tooltip content={children} side="right">
      {element}
    </Tooltip>
  ) : (
    element
  );
});

/** The bottom of the sidebar: Settings and Help. */
export const SidebarFooter = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function SidebarFooter({ className, ...props }, ref) {
    return <div ref={ref} className={cn(styles.footer, className)} {...props} />;
  },
);
