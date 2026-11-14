import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { Ellipsis, Star } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { useWorkspaceShell } from '../WorkspaceShell/context';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../ui/DropdownMenu';
import { IconButton } from '../../ui/IconButton';
import { ScrollArea } from '../../ui/ScrollArea';
import styles from './PageHeader.module.css';

export interface PageProps extends ComponentPropsWithoutRef<'div'> {
  /**
   * The page's top bar, which stays put while the page scrolls: a `PageHeader` with its
   * breadcrumb and actions, or any 48px bar of the page's own. Leave it out for a page with no
   * header (Settings, Integrations): a bare 48px strip takes its place, to drag the window by and
   * to keep the content clear of the `WindowBar`
   */
  header?: ReactNode;
  /** classes for the scrolling element (the ScrollArea's viewport) */
  scrollClassName?: string;
}

/**
 * A page in a `WorkspaceShell`: its header, then everything under it (a `PageToolbar` and a
 * `PageContent`, or a layout of the page's own) in the page's scroller. Every page renders one, so
 * each decides its own header, or none. A list or grid page's content fills the scroller and
 * scrolls itself; a Home or document page keeps its height, and the scroller scrolls it whole.
 */
export const Page = forwardRef<HTMLDivElement, PageProps>(function Page(
  { header, scrollClassName, className, children, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn(styles.page, className)} {...props}>
      {header ?? <div aria-hidden className={styles.bare} />}
      {/*
       * a ScrollArea, whose scrollbar is drawn over the page's edge and takes no width; data-slot
       * on its scrolling element: the app's router restores it, and scrolls it to the top on a
       * new page
       */}
      <ScrollArea
        className={styles.scroll}
        viewportClassName={cn(styles.scrollViewport, scrollClassName)}
        viewportProps={{ 'data-slot': 'page-scroll' } as object}
      >
        {children}
      </ScrollArea>
    </div>
  );
});

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
 * A page's top bar (its `Page`'s `header`): a 48px bar with the breadcrumb at the left and the
 * page's actions at the right, 24px in from the sides. It spans the page even where the content is
 * a capped column. While the sidebar is hidden it starts after the `WindowBar`
 * (`--window-bar-inset`, set by `WorkspaceShell`).
 */
export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  { actions, className, children, ...props },
  ref,
) {
  return (
    <header ref={ref} className={cn(styles.header, className)} {...props}>
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
  const { sidebarHidden } = useWorkspaceShell();
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
