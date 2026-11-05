import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import { Ellipsis, Star } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { useAppShell } from '../AppShell/context';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../ui/DropdownMenu';
import { IconButton } from '../../ui/IconButton';
import styles from './PageHeader.module.css';

/** Set by `AppShell` while the header is drawn inside the window bar (the sidebar is hidden). */
export const PageHeaderInWindowBar = createContext(false);

export interface PageHeaderProps extends Omit<ComponentPropsWithoutRef<'header'>, 'title'> {
  /** the page's place, at the left: a `Breadcrumb` ("Tasks › List"), or its title */
  children?: ReactNode;
  /**
   * The page's actions at the right, 8px apart: a detail page's `PageFavoriteButton` and
   * `PageMenuButton`, a sheet toggle. Toolbars (filter, sort, view, "New Task") go in the
   * `PageToolbar` under the header instead.
   */
  actions?: ReactNode;
}

/**
 * The top of every page: a 48px bar with the breadcrumb at the left and the page's actions at the
 * right, 24px in from the sides. It spans the page even where the content is a capped column.
 * While the sidebar is hidden, `AppShell` moves it into the `WindowBar`.
 */
export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  { actions, className, children, ...props },
  ref,
) {
  const inWindowBar = useContext(PageHeaderInWindowBar);
  return (
    <header
      ref={ref}
      data-in-window-bar={inWindowBar ? '' : undefined}
      className={cn(styles.header, className)}
      {...props}
    >
      <div className={styles.place}>{children}</div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
});

export interface PageFavoriteButtonProps {
  favorite: boolean;
  onFavoriteChange?: (favorite: boolean) => void;
}

/** The detail page's star: adds the page to the sidebar's Favorites. */
export function PageFavoriteButton({ favorite, onFavoriteChange }: PageFavoriteButtonProps) {
  return (
    <IconButton
      size="sm"
      tone="muted"
      icon={Star}
      label={favorite ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={favorite}
      data-favorite={favorite ? '' : undefined}
      className={styles.favorite}
      onClick={() => onFavoriteChange?.(!favorite)}
    />
  );
}

export interface PageMenuButtonProps {
  /** the "…" menu's items (`DropdownMenuItem`s), in the README's order: the page's own, then Copy as Markdown, then Move to trash */
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** The detail page's "…" menu, aligned to the header's right edge. */
export function PageMenuButton({ children, open, defaultOpen, onOpenChange }: PageMenuButtonProps) {
  return (
    <DropdownMenu open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={<IconButton size="sm" tone="muted" icon={Ellipsis} label="More actions" />}
      />
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface PageToolbarProps extends ComponentPropsWithoutRef<'div'> {
  /** the left side: Filter, a search field */
  start?: ReactNode;
  /** the right side: Sort, the view switcher, the page's "New …" button */
  end?: ReactNode;
}

/**
 * The toolbar row under the header: 32px controls 8px apart, the left group and the right group
 * pushed apart, 12px above the content. In compact windows the toolbar buttons hide their values
 * (`Button value`), which is the buttons' own job.
 */
export const PageToolbar = forwardRef<HTMLDivElement, PageToolbarProps>(function PageToolbar(
  { start, end, className, children, ...props },
  ref,
) {
  const { sidebarHidden } = useAppShell();
  return (
    <div
      ref={ref}
      data-under-window-bar={sidebarHidden ? '' : undefined}
      className={cn(styles.toolbar, className)}
      {...props}
    >
      {start && <div className={styles.group}>{start}</div>}
      {children}
      {end && <div className={cn(styles.group, styles.end)}>{end}</div>}
    </div>
  );
});

export const pageContentVariants = cva(styles.content, {
  variants: {
    /**
     * `list`: rows 16px in from the sides (Tasks, Trash). `grid`: cards 24px in (Notes cards,
     * Projects). `home`: Home's 800px column (`home-max-width`), centred across the page and,
     * where it fits, down it. `document`:
     * a note, a task, Settings and Integrations: a 720px column (`content-max-width`) centred
     * 48px under the header.
     */
    layout: {
      list: styles.list,
      grid: styles.grid,
      home: styles.home,
      document: styles.document,
    },
  },
  defaultVariants: { layout: 'list' },
});

export interface PageContentProps
  extends ComponentPropsWithoutRef<'div'>, VariantProps<typeof pageContentVariants> {}

/**
 * The page under its header and toolbar. Workspace pages use the full width; document pages cap
 * their column and centre it (README "Page widths"), so on a wide window the margins grow.
 */
export const PageContent = forwardRef<HTMLDivElement, PageContentProps>(function PageContent(
  { layout, className, children, ...props },
  ref,
) {
  const capped = layout === 'document' || layout === 'home';
  return (
    <div ref={ref} className={cn(pageContentVariants({ layout }), className)} {...props}>
      {capped ? <div className={styles.column}>{children}</div> : children}
    </div>
  );
});
