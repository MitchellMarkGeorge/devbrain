import { forwardRef, useEffect, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ellipsis, Star } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../ui/DropdownMenu';
import { IconButton } from '../../ui/IconButton';
import { ScrollArea } from '../../ui/ScrollArea';
import { useWorkspaceShell } from '../WorkspaceShell/context';
import styles from './PageHeader.module.css';

export interface PageProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  /**
   * Where you are, in a few words: "Tasks", a task's or note's title. Inside a `WorkspaceShell` it
   * shows in the title bar's search field (which opens search), so the window always says which
   * page this is; elsewhere it isn't drawn. A page still loading leaves it out, and the field reads
   * "Search or jump to…"
   */
  title?: ReactNode;
  /**
   * The page's header: a `PageHeader` with the page's actions (a detail page's star and "…" menu).
   * Inside a `WorkspaceShell` it goes at the title bar's end (so it stays put while the page
   * scrolls, and takes no room in the page); elsewhere the page draws it at its top. Leave it out
   * for a page with no actions there
   */
  header?: ReactNode;
  /** classes for the scrolling element (the ScrollArea's viewport) */
  scrollClassName?: string;
}

/**
 * A page in a `WorkspaceShell`: its title, in the title bar's search field; its header (its
 * actions), at the title bar's end; and everything else (a
 * `PageToolbar` and a `PageContent`, or a layout of the page's own) in the page's scroller. Every
 * page renders one, so each decides its own header, or none. The header is still the page's own
 * JSX, so it can use the page's state; the shell only gives it a place. A list or grid page's content fills the scroller and
 * scrolls itself; a Home or document page keeps its height, and the scroller scrolls it whole.
 */
export const Page = forwardRef<HTMLDivElement, PageProps>(function Page(
  { title, header, scrollClassName, className, children, ...props },
  ref,
) {
  const { titleBarContainer, locationContainer } = useWorkspaceShell();
  // in a shell, the page is the card under the title bar, header or not
  const inShell = titleBarContainer !== null;
  const inTitleBar = header != null && inShell;
  useDocumentTitle(inShell && typeof title === 'string' ? title : null);
  return (
    <div
      ref={ref}
      data-in-shell={inShell ? '' : undefined}
      className={cn(styles.page, className)}
      {...props}
    >
      {inTitleBar ? createPortal(header, titleBarContainer) : header}
      {title != null && locationContainer && createPortal(<span>{title}</span>, locationContainer)}
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

/** the window's title before any page named it (index.html's "DevBrain"), put back when none does */
let appTitle: string | null = null;

/**
 * The window's title (`document.title`, which Electron gives the window: the Window menu, Mission
 * Control) follows the page in the shell. A page kept mounted under the next one's loading doesn't
 * take it back: a page only restores the title while it is still the one it set.
 */
function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (title === null) return;
    appTitle ??= document.title;
    document.title = title;
    return () => {
      if (document.title === title) document.title = appTitle ?? '';
    };
  }, [title]);
}

export interface PageHeaderProps extends Omit<ComponentPropsWithoutRef<'header'>, 'title'> {
  /**
   * Something at the left, before the actions. Pages in a `WorkspaceShell` leave it out: their
   * title shows in the title bar's search field (`Page`'s `title`)
   */
  children?: ReactNode;
  /**
   * The page's actions at the right, 8px apart: a detail page's `PageFavoriteButton` and
   * `PageMenuButton`, a sheet toggle. Toolbars (filter, sort, view, "New Task") go in the
   * `PageToolbar` under the header instead.
   */
  actions?: ReactNode;
}

/**
 * A page's header (its `Page`'s `header`): the page's actions at the right, 24px in from the
 * side, and anything passed as children at the left. Inside a `WorkspaceShell` it sits at the
 * title bar's end, as tall as the bar (its buttons don't drag the window; the bar around them
 * does); elsewhere it tops the page, 48px tall.
 */
export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  { actions, className, children, ...props },
  ref,
) {
  return (
    <header ref={ref} className={cn(styles.header, className)} {...props}>
      {children != null && <div className={styles.place}>{children}</div>}
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
  return (
    <div ref={ref} className={cn(styles.toolbar, className)} {...props}>
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
