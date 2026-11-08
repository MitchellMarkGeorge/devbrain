import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { cn } from '../../lib/cn';
import { useWindowFrame } from '../../lib/platform';
import { PageHeaderInWindowBar } from '../PageHeader/context';
import { TooltipProvider } from '../../ui/Tooltip';
import { CaptionButtons, WindowBar } from '../WindowBar';
import { WorkspaceShellContext, type WorkspaceShellContextValue, type WindowSize } from './context';
import { PEEK_CLOSE_DELAY, PEEK_OPEN_DELAY, windowSizeFor } from './layout';
import styles from './WorkspaceShell.module.css';

export interface WorkspaceShellProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** the app's `Sidebar`; the shell docks it at the left, or opens it as a drawer while it's hidden */
  sidebar: ReactNode;
  /** the page's `PageHeader`; moves into the `WindowBar` while the sidebar is hidden */
  header?: ReactNode;
  /** the page under its header: a `PageToolbar` and a `PageContent` */
  children?: ReactNode;
  /**
   * A docked sheet is open: the shell opens a `sheet-width` column at the right for it. Portal the
   * `SheetContent` into `useWorkspaceShell().sheetContainer`. In compact windows sheets float instead.
   */
  sheetOpen?: boolean;
  /** the user's choice: hide the sidebar at any size (⌘\) */
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** the drawer the hidden sidebar opens as, over the page (opened this way, it's pinned) */
  drawerOpen?: boolean;
  defaultDrawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
  /** pin the window size instead of measuring the shell (stories, tests) */
  size?: WindowSize;
  onBack?: () => void;
  onForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (value: T) => void,
): [T, (value: T) => void] {
  const [own, setOwn] = useState(defaultValue);
  const current = value ?? own;
  const set = useCallback(
    (next: T) => {
      setOwn(next);
      onChange?.(next);
    },
    [onChange],
  );
  return [current, set];
}

/**
 * The window inside a workspace, the frame every page in it shares (outside one it's an
 * `AppShell`): the sidebar at the left, the page (header, toolbar, content) and
 * a docked sheet at the right. It measures its own width and follows the README's window sizes:
 * below 1080px the sidebar rests hidden and sheets float. The sidebar is either docked or hidden
 * (the user's choice, ⌘\, at any size). While it's hidden the window bar runs across the top with
 * the page's header in it, and the sidebar opens as a drawer over the page: pointing at the toggle
 * or the window's left edge peeks at it, and clicking the toggle or ⌘\ pins it open (or docks it,
 * where there's room).
 *
 * It follows the window frame (`WindowFrameProvider`): on Windows, whose caption buttons sit over
 * the top right, the page's header runs the full width beside the docked sidebar too, and a docked
 * sheet starts under it, so nothing of the sheet's sits by the caption buttons.
 */
export const WorkspaceShell = forwardRef<HTMLDivElement, WorkspaceShellProps>(
  function WorkspaceShell(
    {
      sidebar,
      header,
      children,
      sheetOpen = false,
      collapsed: collapsedProp,
      defaultCollapsed = false,
      onCollapsedChange,
      drawerOpen: drawerOpenProp,
      defaultDrawerOpen = false,
      onDrawerOpenChange,
      size: sizeProp,
      onBack,
      onForward,
      canGoBack = true,
      canGoForward = false,
      className,
      ...props
    },
    ref,
  ) {
    const root = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => root.current as HTMLDivElement);
    const sheetContainer = useRef<HTMLDivElement>(null);
    const drawerPopup = useRef<HTMLDivElement>(null);

    const [measured, setMeasured] = useState<WindowSize>(() =>
      typeof window === 'undefined' ? 'wide' : windowSizeFor(window.innerWidth),
    );
    useLayoutEffect(() => {
      if (sizeProp || !root.current) return;
      const el = root.current;
      setMeasured(windowSizeFor(el.getBoundingClientRect().width));
      const observer = new ResizeObserver(([entry]) => {
        setMeasured(windowSizeFor(entry.contentRect.width));
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, [sizeProp]);
    const size = sizeProp ?? measured;
    const compact = size === 'compact';

    const [collapsed, setCollapsed] = useControllable(
      collapsedProp,
      defaultCollapsed,
      onCollapsedChange,
    );
    const [drawerOpen, setDrawerOpen] = useControllable(
      drawerOpenProp,
      defaultDrawerOpen,
      onDrawerOpenChange,
    );
    // opened by hover and not yet pinned: no focus moves into it, and it closes when the pointer leaves
    const [peeking, setPeeking] = useState(false);
    // docking from the drawer swaps one for the other where it stands, with no motion
    const [instant, setInstant] = useState(false);
    const hidden = collapsed || compact;
    const drawerShown = hidden && drawerOpen;
    // however the drawer closed, it opens next time as pinned unless a peek opens it
    if (peeking && !drawerShown) setPeeking(false);

    // docking the sidebar (a wider window, or the user's toggle) closes the drawer
    useEffect(() => {
      if (!hidden && drawerOpen) setDrawerOpen(false);
    }, [hidden, drawerOpen, setDrawerOpen]);
    useEffect(() => {
      if (!instant) return;
      // two frames: the swap has been drawn without transitions before they come back
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setInstant(false));
      });
      return () => cancelAnimationFrame(frame);
    }, [instant]);

    const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const clearTimers = useCallback(() => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    }, []);
    useEffect(() => clearTimers, [clearTimers]);

    const closeDrawer = useCallback(() => {
      clearTimers();
      setPeeking(false);
      setDrawerOpen(false);
    }, [clearTimers, setDrawerOpen]);

    const toggleSidebar = useCallback(() => {
      clearTimers();
      if (!hidden) {
        setCollapsed(true);
      } else if (!compact) {
        if (drawerShown) setInstant(true);
        setPeeking(false);
        setDrawerOpen(false);
        setCollapsed(false);
      } else if (drawerOpen && !peeking) {
        setDrawerOpen(false);
      } else {
        setPeeking(false);
        setDrawerOpen(true);
      }
    }, [
      clearTimers,
      hidden,
      compact,
      drawerShown,
      drawerOpen,
      peeking,
      setCollapsed,
      setDrawerOpen,
    ]);

    const peekSidebar = useCallback(() => {
      clearTimeout(closeTimer.current);
      if (!hidden || drawerShown) return;
      clearTimeout(openTimer.current);
      openTimer.current = setTimeout(() => {
        setPeeking(true);
        setDrawerOpen(true);
      }, PEEK_OPEN_DELAY);
    }, [hidden, drawerShown, setDrawerOpen]);
    const cancelPeek = useCallback(() => clearTimeout(openTimer.current), []);

    // ⌘\ toggles the sidebar
    useEffect(() => {
      const onKey = (event: KeyboardEvent) => {
        if (event.key === '\\' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          toggleSidebar();
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [toggleSidebar]);

    const base = useMemo<WorkspaceShellContextValue>(
      () => ({
        inShell: true,
        size,
        sidebarHidden: hidden,
        inDrawer: false,
        drawerOpen: drawerShown,
        peeking: drawerShown && peeking,
        toggleSidebar,
        closeDrawer,
        peekSidebar,
        cancelPeek,
        onBack,
        onForward,
        canGoBack,
        canGoForward,
        sheetContainer,
      }),
      [
        size,
        hidden,
        drawerShown,
        peeking,
        toggleSidebar,
        closeDrawer,
        peekSidebar,
        cancelPeek,
        onBack,
        onForward,
        canGoBack,
        canGoForward,
      ],
    );
    const drawer = useMemo<WorkspaceShellContextValue>(() => ({ ...base, inDrawer: true }), [base]);

    const frame = useWindowFrame();
    const windows = frame.platform === 'windows';
    // On Windows the header beside the docked sidebar gets a row of its own across the page and
    // the sheet; elsewhere it tops the page column only, and a sheet runs full height
    const headerRow = windows && !hidden;

    return (
      <WorkspaceShellContext.Provider value={base}>
        <TooltipProvider>
          <div
            ref={root}
            data-size={size}
            data-sidebar-hidden={hidden ? '' : undefined}
            data-instant={instant ? '' : undefined}
            data-platform={frame.platform}
            className={cn(styles.shell, className)}
            {...props}
          >
            {hidden && (
              <PageHeaderInWindowBar.Provider value>
                <WindowBar className={styles.windowBar}>{header}</WindowBar>
              </PageHeaderInWindowBar.Provider>
            )}
            {/* kept mounted while hidden (folded groups keep their state), out of reach */}
            <div className={styles.sidebar} {...{ inert: hidden ? '' : undefined }}>
              {sidebar}
            </div>
            {headerRow && <div className={styles.header}>{header}</div>}
            <main className={styles.main}>
              {!hidden && !headerRow && header}
              {/* data-slot: the app's router scrolls this to the top on a new page */}
              <div className={styles.scroll} data-slot="page-scroll">
                {children}
              </div>
            </main>
            <div
              ref={sheetContainer}
              className={styles.sheet}
              data-open={sheetOpen && !compact ? '' : undefined}
            />
            {hidden && !drawerShown && (
              <div
                aria-hidden
                className={styles.edge}
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') peekSidebar();
                }}
                onPointerLeave={cancelPeek}
              />
            )}
            {windows && frame.controls === 'drawn' && (
              <CaptionButtons className={styles.captionButtons} />
            )}
          </div>
          {hidden && (
            <Dialog.Root
              open={drawerShown}
              onOpenChange={(open) => (open ? setDrawerOpen(true) : closeDrawer())}
              // a peek leaves focus where it was, so typing carries on; pinning it traps focus
              modal={!peeking}
            >
              <Dialog.Portal container={root}>
                <Dialog.Backdrop className={styles.backdrop} />
                <Dialog.Popup
                  ref={drawerPopup}
                  initialFocus={peeking ? false : drawerPopup}
                  className={styles.drawer}
                  aria-label="Sidebar"
                  onPointerEnter={() => clearTimeout(closeTimer.current)}
                  onPointerLeave={(event) => {
                    if (!peeking || event.pointerType !== 'mouse') return;
                    clearTimeout(closeTimer.current);
                    closeTimer.current = setTimeout(closeDrawer, PEEK_CLOSE_DELAY);
                  }}
                  onPointerDown={() => clearTimeout(closeTimer.current)}
                  // using it pins it, so a menu it opens never closes it. On the click's way back up,
                  // after the drawer's own toggle has read the peek; and only keyboard focus, as a
                  // pressed button takes focus before its click
                  onClick={() => setPeeking(false)}
                  onFocus={(event) => {
                    if (event.target.matches(':focus-visible')) setPeeking(false);
                  }}
                >
                  <WorkspaceShellContext.Provider value={drawer}>
                    {sidebar}
                  </WorkspaceShellContext.Provider>
                </Dialog.Popup>
              </Dialog.Portal>
            </Dialog.Root>
          )}
        </TooltipProvider>
      </WorkspaceShellContext.Provider>
    );
  },
);
