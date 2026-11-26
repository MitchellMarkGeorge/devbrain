import { forwardRef, useEffect, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ellipsis, Star } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../ui/DropdownMenu';
import { IconButton } from '../../ui/IconButton';
import { ScrollArea } from '../../ui/ScrollArea';
import { useWorkspaceShell } from '../WorkspaceShell/context';
import styles from './Page.module.css';

export interface PageProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /**
   * Where you are, in a few words: "Tasks", a task's or note's title. Inside a `WorkspaceShell` it
   * shows in the title bar's search field (which opens search) and names the window; elsewhere it
   * isn't drawn. A page still loading leaves it out, and the field reads "Search or jump to…"
   */
  title?: string;
  /**
   * The page's actions, 8px apart: a detail page's `PageFavoriteButton` and `PageMenuButton`.
   * Inside a `WorkspaceShell` they go at the title bar's end (so they stay put while the page
   * scrolls, and take no room in the page); elsewhere the page draws them in a 48px bar at its top.
   * Toolbars (status, filters, Display) go in a `PageToolbar` in the page instead.
   */
  actions?: ReactNode;
  /** classes for the scroller's content (the ScrollArea's `contentClassName`) */
  scrollClassName?: string;
}

/**
 * A page in a `WorkspaceShell`: its title, in the title bar's search field; its actions, at the
 * title bar's end; and everything else (a `PageToolbar` and a `PageContent`, or a layout of the
 * page's own) in the page's scroller. Every page renders one. The actions are still the page's own
 * JSX, so they can use the page's state; the shell only gives them a place. A list or grid page's
 * content fills the scroller and scrolls itself; a Home or document page keeps its height, and the
 * scroller scrolls it whole.
 */
export const Page = forwardRef<HTMLDivElement, PageProps>(function Page(
  { title, actions, scrollClassName, className, children, ...props },
  ref,
) {
  const { titleBarContainer, locationContainer } = useWorkspaceShell();
  // in a shell, the page is the card under the title bar, actions or not
  const inShell = titleBarContainer !== null;
  // the window's title (Electron's, for the Window menu and Mission Control) follows the page's
  useEffect(() => {
    if (inShell && title) document.title = title;
  }, [inShell, title]);
  const bar = actions && <div className={styles.actions}>{actions}</div>;
  return (
    <div
      ref={ref}
      data-in-shell={inShell ? '' : undefined}
      className={cn(styles.page, className)}
      {...props}
    >
      {inShell && bar ? createPortal(bar, titleBarContainer) : bar}
      {title && locationContainer && createPortal(<span>{title}</span>, locationContainer)}
      {/*
       * a ScrollArea, whose scrollbar is drawn over the page's edge and takes no width; data-slot
       * on its scrolling element: the app's router restores it, and scrolls it to the top on a
       * new page
       */}
      <ScrollArea
        className={styles.scroll}
        contentClassName={cn(styles.scrollContent, scrollClassName)}
        viewportProps={{ 'data-slot': 'page-scroll' } as object}
      >
        {children}
      </ScrollArea>
    </div>
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

/** The detail page's "…" menu, aligned to the actions' right edge. */
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
  /** the left side: which items are shown (Status, the filters, a search field) */
  start?: ReactNode;
  /** the right side: how the items are drawn (Display) */
  end?: ReactNode;
}

/**
 * The toolbar row at the page's top: 32px controls 8px apart, the left group and the right group
 * pushed apart, 12px above the content. In compact windows the toolbar buttons hide their values
 * (`Button value`), which is the buttons' own job.
 */
export const PageToolbar = forwardRef<HTMLDivElement, PageToolbarProps>(function PageToolbar(
  { start, end, className, children, ...props },
  ref,
) {
  return (
    <div ref={ref} className={cn(styles.toolbar, className)} {...props}>
      {start && <div className={cn(styles.group, styles.start)}>{start}</div>}
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
