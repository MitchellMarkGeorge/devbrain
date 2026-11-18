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
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { ColourBar } from '../../ui/ColourBar';
import { useWorkspaceShell } from '../WorkspaceShell/context';
import { Icon, renderIcon, type IconSource } from '../../ui/Icon';
import { Kbd } from '../../ui/Kbd';
import { ScrollArea } from '../../ui/ScrollArea';
import { Tooltip } from '../../ui/Tooltip';
import { cssColor, type Swatch } from '../../types';
import styles from './Sidebar.module.css';

export interface SidebarProps extends ComponentPropsWithoutRef<'nav'> {
  /**
   * A row pinned at the top, staying put while the rest scrolls: a `SidebarHeader`, or the settings'
   * Back to app. The app's sidebar has none: its workspace switcher, search and New are in the
   * `WorkspaceShell`'s title bar, with the window's controls.
   */
  header?: ReactNode;
}

/**
 * The app's sidebar: 256px on the page colour with a hairline at its right. Compose it from a
 * `SidebarHeader` (its `header`), `SidebarContent` (scrolling `SidebarGroup`s of `SidebarItem`s) and
 * `SidebarFooter`. Inside a `WorkspaceShell` the shell docks it, or hides it and opens it as a drawer.
 */
export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { header, className, children, 'aria-label': ariaLabel = 'Main', ...props },
  ref,
) {
  const shell = useWorkspaceShell();
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
        {header && <div className={styles.top}>{header}</div>}
        <div className={styles.body}>{children}</div>
      </ScrollArea>
    </nav>
  );
});

/**
 * The top row, passed as the sidebar's `header`: the workspace switcher, then search and "new"
 * (`SidebarHeaderActions`).
 */
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

export interface SidebarActionProps extends Omit<useRender.ComponentProps<'button'>, 'children'> {
  icon: IconSource;
  /** what it does: its name and tooltip ("Search", "New task", "Settings") */
  label: string;
  /** its shortcut in the tooltip: "⌘K" */
  shortcut?: string;
  /** the current page (a footer action that is a link): filled, as a current item is */
  active?: boolean;
  /** where the tooltip opens: below in the header (default), above in the footer */
  tooltipSide?: 'top' | 'bottom';
}

/**
 * An icon-only action, named in a tooltip: in the header (search, new) a 28px button beside the
 * workspace; in the footer (`SidebarFooterActions`: Trash, Settings, Help) 24px, after the sync
 * line. A `button` by default; pass `render={<a href="…" />}` for a page. Picking one in the
 * drawer closes it.
 */
export const SidebarAction = forwardRef<HTMLButtonElement, SidebarActionProps>(
  function SidebarAction(
    { icon, label, shortcut, active, tooltipSide = 'bottom', render, onClick, className, ...props },
    ref,
  ) {
    const shell = useWorkspaceShell();
    const element = useRender({
      ref,
      defaultTagName: 'button',
      render,
      props: mergeProps<'button'>(
        {
          className: cn(styles.action, className),
          type: render ? undefined : 'button',
          'aria-label': label,
          'aria-current': active ? 'page' : undefined,
          onClick: (event: MouseEvent<HTMLButtonElement>) => {
            onClick?.(event);
            if (shell.inDrawer && !event.defaultPrevented) shell.closeDrawer();
          },
          children: renderIcon(icon, 16),
          ...({ 'data-active': active ? '' : undefined } as object),
        },
        props,
      ),
    });
    return (
      <Tooltip content={<TooltipLabel label={label} shortcut={shortcut} />} side={tooltipSide}>
        {element}
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

/**
 * A line of 12px `subtle-foreground` text in a group, in line with its items' icons: what the
 * group would hold while it holds nothing ("Star a task, note or project to keep it here").
 */
export const SidebarHint = forwardRef<HTMLParagraphElement, ComponentPropsWithoutRef<'p'>>(
  function SidebarHint({ className, ...props }, ref) {
    return <p ref={ref} className={cn(styles.hint, className)} {...props} />;
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

/**
 * The bottom of the sidebar, one row: the sync line (`SyncStatus`) taking the room, then
 * `SidebarFooterActions` at the end.
 */
export const SidebarFooter = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function SidebarFooter({ className, ...props }, ref) {
    return <div ref={ref} className={cn(styles.footer, className)} {...props} />;
  },
);

/** The footer's icon actions (Trash, Settings, Help: `SidebarAction`s), at the row's end. */
export const SidebarFooterActions = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<'div'>>(
  function SidebarFooterActions({ className, ...props }, ref) {
    return <div ref={ref} className={cn(styles.footerActions, className)} {...props} />;
  },
);
