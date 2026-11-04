import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useRender } from '@base-ui/react/use-render';
import { mergeProps } from '@base-ui/react/merge-props';
import { Collapsible } from '@base-ui/react/collapsible';
import { ChevronRight, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import { ColourBar } from '../ColourBar';
import { useAppShell } from '../AppShell/context';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../DropdownMenu';
import { Icon, renderIcon, type IconSource } from '../Icon';
import { Kbd } from '../Kbd';
import { Popover, PopoverContent, PopoverTrigger } from '../Popover';
import { ScrollThumb } from '../ScrollThumb';
import { Tooltip } from '../Tooltip';
import { TrafficLights, WindowControls } from '../WindowBar';
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
   * The 56px icon rail. Inside an `AppShell` the shell decides (the user's choice, or a compact
   * window) and this can be left out; the drawer always shows the full sidebar.
   */
  collapsed?: boolean;
  /**
   * The window's traffic lights and controls (sidebar toggle, back, forward) on a 44px row at the
   * top of the full sidebar. On by default inside an `AppShell`; the rail leaves them to the
   * `WindowBar`.
   */
  windowControls?: boolean;
}

/**
 * The app's sidebar: 256px on the page colour with a hairline at its right, or the 56px rail when
 * collapsed. Compose it from `SidebarHeader`, `SidebarContent` (scrolling `SidebarGroup`s of
 * `SidebarItem`s) and `SidebarFooter`; `SidebarSeparator`s show between the blocks in the rail.
 */
export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  {
    collapsed: collapsedProp,
    windowControls,
    className,
    children,
    'aria-label': ariaLabel = 'Main',
    ...props
  },
  ref,
) {
  const shell = useAppShell();
  const collapsed = shell.inDrawer ? false : (collapsedProp ?? shell.rail);
  const showControls = !collapsed && (windowControls ?? shell.inShell);
  const navRef = useRef<HTMLElement | null>(null);
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      navRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  useFadeOnToggle(navRef, collapsed);
  return (
    <SidebarContext.Provider value={{ collapsed }}>
      <nav
        ref={setRef}
        aria-label={ariaLabel}
        data-collapsed={collapsed ? '' : undefined}
        data-drawer={shell.inDrawer ? '' : undefined}
        className={cn(styles.sidebar, className)}
        {...props}
      >
        {showControls && (
          <div className={styles.windowRow}>
            <TrafficLights className={styles.lights} />
            <WindowControls />
          </div>
        )}
        {children}
        {/* the thin scrollbar, and `data-scrolled` for the header's shadow */}
        <ScrollThumb />
      </nav>
    </SidebarContext.Provider>
  );
});

/**
 * Fades the sidebar's content in when it switches between the full sidebar and the rail, as the
 * two lay out differently (the width slides in CSS, on `--ease-surface`). Played on the elements, so nothing remounts
 * and folded groups or open menus keep their state; not on the first render. The duration is the
 * `--duration-slow` token (0 under reduced motion) and the easing `--ease-surface`.
 */
function useFadeOnToggle(navRef: RefObject<HTMLElement | null>, collapsed: boolean) {
  const previous = useRef(collapsed);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (previous.current === collapsed || !nav) return;
    previous.current = collapsed;
    const style = getComputedStyle(nav);
    const duration = parseFloat(style.getPropertyValue('--duration-slow')) || 0;
    if (duration === 0 || typeof nav.animate !== 'function') return;
    const easing = style.getPropertyValue('--ease-surface').trim() || 'ease-out';
    for (const child of Array.from(nav.children)) {
      // not the scrollbar, which shows only while scrolling
      if (child.hasAttribute('data-scroll-thumb')) continue;
      child.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
    }
  }, [navRef, collapsed]);
}

/** The top row: the workspace switcher, then search and "new" (`SidebarHeaderActions`). */
export const SidebarHeader = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function SidebarHeader({ className, ...props }, ref) {
    return <div ref={ref} className={cn(styles.header, className)} {...props} />;
  },
);

/** The header's right side: search and "new" (`SidebarAction`s). In the rail, under the tile. */
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

/**
 * A header action (search, new): a 28px icon button beside the workspace, or a 40×32 rail item
 * under the tile in the rail. Both name themselves in a tooltip.
 */
export const SidebarAction = forwardRef<HTMLButtonElement, SidebarActionProps>(
  function SidebarAction({ icon, label, shortcut, className, ...props }, ref) {
    const { collapsed } = useSidebar();
    return (
      <Tooltip
        content={<TooltipLabel label={label} shortcut={shortcut} />}
        side={collapsed ? 'right' : 'bottom'}
      >
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
 * the workspace menu (pressed while open). In the rail, the tile alone.
 */
export function SidebarWorkspace({
  name,
  color,
  children,
  open,
  defaultOpen,
  onOpenChange,
}: SidebarWorkspaceProps) {
  const { collapsed } = useSidebar();
  const trigger = (
    <DropdownMenuTrigger className={styles.workspace} aria-label={`Workspace: ${name}`}>
      <WorkspaceTile letter={name} color={color} />
      <span className={styles.workspaceName}>{name}</span>
      <Icon icon={ChevronsUpDown} size={12} className={styles.chevron} />
    </DropdownMenuTrigger>
  );
  return (
    <DropdownMenu open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      {collapsed ? (
        <Tooltip content={name} side="right">
          {trigger}
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent align="start" side={collapsed ? 'right' : 'bottom'} width="lg">
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

/** A 24px hairline between the rail's blocks (tile and actions, pages, shortcuts). Hidden in the full sidebar. */
export function SidebarSeparator({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div role="separator" className={cn(styles.separator, className)} {...props} />;
}

export interface SidebarGroupProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** the group label: "Recents", "Favorites"; a group without one is the main navigation */
  label?: string;
  /** clicking the label folds the group away (default `true`; a group without a label never folds) */
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * The group's icon in the rail (Recents `Clock`, Favorites `Star`): one rail item that opens a
   * popover listing the group's items. A labelled group without one hides in the rail.
   */
  railIcon?: IconSource;
  /** show the group's items in the rail as they are (rail items) */
  showInRail?: boolean;
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
    railIcon,
    showInRail,
    className,
    children,
    ...props
  },
  ref,
) {
  const { collapsed } = useSidebar();
  if (collapsed && label && !showInRail) {
    if (!railIcon) return null;
    return (
      <div
        ref={ref}
        role="group"
        aria-label={label}
        className={cn(styles.group, className)}
        {...props}
      >
        <SidebarRailGroup label={label} icon={railIcon}>
          {children}
        </SidebarRailGroup>
      </div>
    );
  }
  const showLabel = label && !collapsed;
  const menu = <SidebarMenu data-main={label ? undefined : ''}>{children}</SidebarMenu>;

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

/** The rail's stand-in for a labelled group: one icon that lists the group in a popover. */
function SidebarRailGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon: IconSource;
  children: ReactNode;
}) {
  return (
    <SidebarMenu>
      <Popover>
        <Tooltip content={label} side="right">
          <PopoverTrigger className={styles.item} aria-label={label}>
            <span className={styles.itemIcon}>{renderIcon(icon, 16)}</span>
            <span className={styles.itemLabel}>{label}</span>
          </PopoverTrigger>
        </Tooltip>
        <PopoverContent
          size="auto"
          side="right"
          align="start"
          sideOffset={8}
          className={styles.railPopover}
        >
          <SidebarContext.Provider value={{ collapsed: false }}>
            <SidebarGroupLabel aria-hidden>{label}</SidebarGroupLabel>
            <SidebarMenu>{children}</SidebarMenu>
          </SidebarContext.Provider>
        </PopoverContent>
      </Popover>
    </SidebarMenu>
  );
}

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
  /** the page's go-to keys, shown in the rail's tooltip: "G T" */
  shortcut?: string;
}

/**
 * A 32px sidebar item: icon (or an event's bar) and label; in the rail a 40×32 icon with the
 * label (and shortcut) in a tooltip at its right. A `button` by default; pass
 * `render={<a href="…" />}` for navigation. Picking one in the compact window's drawer closes it.
 */
export const SidebarItem = forwardRef<HTMLButtonElement, SidebarItemProps>(function SidebarItem(
  { children, icon, iconColor, bar, active, shortcut, render, onClick, ...props },
  ref,
) {
  const { collapsed } = useSidebar();
  const shell = useAppShell();
  const glyph = bar ? (
    <span className={styles.itemBar}>
      <ColourBar color={bar} height={16} />
    </span>
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

  return collapsed ? (
    <Tooltip content={<TooltipLabel label={children} shortcut={shortcut} />} side="right">
      {element}
    </Tooltip>
  ) : (
    element
  );
});

/** The bottom of the sidebar: the sync status, then Trash, Settings and Help. */
export const SidebarFooter = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function SidebarFooter({ className, ...props }, ref) {
    return <div ref={ref} className={cn(styles.footer, className)} {...props} />;
  },
);
