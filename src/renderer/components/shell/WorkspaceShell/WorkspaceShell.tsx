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
  type Ref,
} from 'react';
import { Drawer } from '@base-ui/react/drawer';
import { Search } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useWindowFrame } from '../../lib/platform';
import { TooltipProvider } from '../../ui/Tooltip';
import { useFormatKeys } from '../../lib/platform';
import { Inert } from '../../layout/Inert';
import { Kbd } from '../../ui/Kbd';
import { CaptionButtons, HistoryControls, WindowBar } from '../WindowBar';
import { WorkspaceShellContext, type WorkspaceShellContextValue, type WindowSize } from './context';
import { PEEK_CLOSE_DELAY, PEEK_OPEN_DELAY, windowSizeFor } from './layout';
import { useStillPointer } from './use-still-pointer';
import styles from './WorkspaceShell.module.css';

export interface WorkspaceShellProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** the app's `Sidebar`: docked at the left, or in a drawer over the page while hidden */
  sidebar: ReactNode;
  /** the page: a `Page`, which draws its own header (or none) and scrolls, in the card under the title bar */
  children?: ReactNode;
  /** the user's choice: hide the sidebar at any size (⌘\) */
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** open the hidden sidebar's drawer, pinned, on first render (stories) */
  defaultDrawerOpen?: boolean;
  /** pin the window size instead of measuring the shell (stories, tests) */
  size?: WindowSize;
  onBack?: () => void;
  onForward?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  /**
   * the open workspace, at the title bar's start between the window's start and the sidebar toggle:
   * a `WorkspaceButton`, opening the workspace menu
   */
  workspace?: ReactNode;
  /** the title bar's search field was pressed: open search (the app's ⌘K) */
  onSearch?: () => void;
  /** after the search field: the app's New menu (a `DropdownMenu` on a "+" `IconButton`) */
  create?: ReactNode;
  /**
   * What the code that renders the shell can ask of it: the app's keymap toggles the sidebar on ⌘\
   * through it. Inside the shell, `useWorkspaceShell()` gives the same
   */
  controlsRef?: Ref<WorkspaceShellControls>;
}

/** The shell's actions, for the code that renders it (`controlsRef`). */
export interface WorkspaceShellControls {
  /** hides the sidebar, docks it again, or opens and closes its drawer in a compact window */
  toggleSidebar: () => void;
  /** closes the hidden sidebar's drawer, peeking or pinned: the app does when a dialog opens */
  closeDrawer: () => void;
}

/** The hidden sidebar's drawer: shut, peeked at by pointing, or pinned open. */
type DrawerState = 'closed' | 'peek' | 'open';

/**
 * The window inside a workspace, the frame every page in it shares (outside one it's an
 * `AppShell`). A CSS grid places its parts: the title bar (`WindowBar`) across the top, always
 * there, so its controls never move; under it the sidebar's column, and the page and the docked
 * sheet in a card beside it. The sidebar is docked, or hidden: its column slides shut, the card
 * widens, and the sidebar opens as a drawer over the page. It measures its own width and follows
 * the README's window sizes: below 1080px the sidebar rests hidden and sheets float. It binds no
 * keys: the app's keymap runs `toggleSidebar` (through `controlsRef`) on ⌘\.
 *
 * A `Page` puts its header in the title bar, through `useWorkspaceShell().titleBarContainer`.
 * A page docks a sheet by portalling its `SheetContent` into `useWorkspaceShell().sheetContainer`:
 * the column at the right slides open while an open sheet is in it.
 */
export const WorkspaceShell = forwardRef<HTMLDivElement, WorkspaceShellProps>(
  function WorkspaceShell(
    {
      sidebar,
      children,
      collapsed: collapsedProp,
      defaultCollapsed = false,
      onCollapsedChange,
      defaultDrawerOpen = false,
      size: sizeProp,
      onBack,
      onForward,
      canGoBack = true,
      canGoForward = false,
      workspace,
      onSearch,
      create,
      controlsRef,
      className,
      ...props
    },
    ref,
  ) {
    const root = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => root.current as HTMLDivElement);
    // state, not a ref: a page portalling a sheet into it renders again once it's there
    const [sheetContainer, setSheetContainer] = useState<HTMLElement | null>(null);
    // the title bar's slot for the page's header, likewise
    const [titleBarContainer, setTitleBarContainer] = useState<HTMLElement | null>(null);
    // the search field's slot for the page's title, likewise
    const [locationContainer, setLocationContainer] = useState<HTMLElement | null>(null);
    const formatKeys = useFormatKeys();
    const drawerPopup = useRef<HTMLDivElement>(null);

    const [measured, setMeasured] = useState<WindowSize>(() => windowSizeFor(window.innerWidth));
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

    const [ownCollapsed, setOwnCollapsed] = useState(defaultCollapsed);
    const collapsed = collapsedProp ?? ownCollapsed;
    const setCollapsed = useCallback(
      (next: boolean) => {
        setOwnCollapsed(next);
        onCollapsedChange?.(next);
      },
      [onCollapsedChange],
    );

    const hidden = collapsed || compact;
    const [drawer, setDrawer] = useState<DrawerState>(defaultDrawerOpen ? 'open' : 'closed');
    // a docked sidebar has no drawer
    if (!hidden && drawer !== 'closed') setDrawer('closed');

    /*
     * The docked sidebar stays mounted while its column slides shut, then goes, and the drawer
     * (which renders the sidebar again) takes over: one copy at a time, except during the slide.
     * Docking mounts it at once and the column slides open.
     */
    const [docked, setDocked] = useState(!hidden);
    if (!hidden && !docked) setDocked(true);
    useEffect(() => {
      if (!hidden || !docked) return;
      // the column's slide time (the shell's transition); 0 under reduced motion
      const shell = root.current;
      const seconds = shell ? parseFloat(getComputedStyle(shell).transitionDuration) || 0 : 0;
      const timer = setTimeout(() => setDocked(false), seconds * 1000);
      return () => clearTimeout(timer);
    }, [hidden, docked]);
    /*
     * Docking from an open drawer: the sidebar is already showing where it docks, so the column
     * opens at once instead of sliding in from nothing
     */
    const [instant, setInstant] = useState(false);

    const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const clearTimers = useCallback(() => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    }, []);
    useEffect(() => clearTimers, [clearTimers]);

    const closeDrawer = useCallback(() => {
      clearTimers();
      setDrawer('closed');
    }, [clearTimers]);

    const pointer = useStillPointer(root);
    const toggleSidebar = useCallback(() => {
      clearTimers();
      pointer.mark();
      setInstant(hidden && drawer !== 'closed');
      if (!hidden) setCollapsed(true);
      // where the window is wide enough, the toggle docks the sidebar (from the drawer too)
      else if (!compact) setCollapsed(false);
      else setDrawer((state) => (state === 'open' ? 'closed' : 'open'));
    }, [clearTimers, pointer, hidden, drawer, compact, setCollapsed]);
    useImperativeHandle(controlsRef, () => ({ toggleSidebar, closeDrawer }), [
      toggleSidebar,
      closeDrawer,
    ]);

    const peekSidebar = useCallback(() => {
      clearTimeout(closeTimer.current);
      // the toggle that hid the sidebar (or closed the drawer) appeared under a pointer at rest
      if (!hidden || drawer !== 'closed' || pointer.still()) return;
      clearTimeout(openTimer.current);
      openTimer.current = setTimeout(() => setDrawer('peek'), PEEK_OPEN_DELAY);
    }, [hidden, drawer, pointer]);
    const cancelPeek = useCallback(() => clearTimeout(openTimer.current), []);

    const context = useMemo<WorkspaceShellContextValue>(
      () => ({
        inShell: true,
        size,
        sidebarHidden: hidden,
        inDrawer: false,
        drawerOpen: drawer !== 'closed',
        peeking: drawer === 'peek',
        toggleSidebar,
        closeDrawer,
        peekSidebar,
        cancelPeek,
        onBack,
        onForward,
        canGoBack,
        canGoForward,
        sheetContainer,
        titleBarContainer,
        locationContainer,
      }),
      [
        sheetContainer,
        titleBarContainer,
        locationContainer,
        size,
        hidden,
        drawer,
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
    const drawerContext = useMemo(() => ({ ...context, inDrawer: true }), [context]);

    const frame = useWindowFrame();

    return (
      <WorkspaceShellContext.Provider value={context}>
        <TooltipProvider>
          <div
            ref={root}
            data-size={size}
            data-sidebar={hidden ? 'hidden' : 'docked'}
            data-drawer={drawer !== 'closed' ? '' : undefined}
            data-platform={frame.platform}
            data-instant={instant ? '' : undefined}
            className={cn(styles.shell, className)}
            {...props}
          >
            {/*
             * the title bar: always there, across the window, so nothing in it moves. Its start
             * is as wide as the sidebar (the window's start, the workspace, the toggle); centred
             * on the window, back, forward, the search field showing the page's title (a
             * `Page`'s, portalled in) and New; at its end the page's actions (its header,
             * portalled in)
             */}
            <div className={styles.titleBar}>
              <WindowBar className={styles.bar} workspace={workspace} />
              <div className={styles.center}>
                <HistoryControls />
                <button
                  type="button"
                  className={styles.search}
                  aria-label="Search"
                  aria-keyshortcuts="Meta+K"
                  onClick={onSearch}
                >
                  <Search className={styles.searchIcon} aria-hidden />
                  <span ref={setLocationContainer} className={styles.location} />
                  <span className={styles.placeholder}>Search or jump to…</span>
                  <Kbd className={styles.searchKey}>{formatKeys('⌘K')}</Kbd>
                </button>
                {create}
              </div>
              <div ref={setTitleBarContainer} className={styles.titleSlot} />
            </div>
            {/*
             * the sidebar's column: the sidebar's width while docked, sliding shut as it hides; the
             * hidden sidebar is inert while it slides out, then unmounted (the drawer has it)
             */}
            <Inert when={hidden} render={<div className={styles.sidebar} />}>
              {docked && sidebar}
            </Inert>
            {/* the card: the page, which draws its own header and scrolls, and the docked sheet */}
            <div className={styles.body}>
              <main className={styles.main}>{children}</main>
              {/* a docked sheet is portalled in here; the column slides open while that sheet is open */}
              <aside ref={setSheetContainer} className={styles.sheet} />
            </div>
            {hidden && drawer === 'closed' && (
              <div
                aria-hidden
                className={styles.edge}
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') peekSidebar();
                }}
                onPointerLeave={cancelPeek}
              />
            )}
            {frame.platform === 'windows' && frame.controls === 'drawn' && (
              <CaptionButtons className={styles.captionButtons} />
            )}
          </div>
          {hidden && !docked && (
            <Drawer.Root
              open={drawer !== 'closed'}
              onOpenChange={(open, details) => {
                if (open) return setDrawer('open');
                // pressing the title bar's toggle is the toggle's to handle (it docks the
                // sidebar from a peek), not a press outside to close the drawer on
                const target = details.event?.target;
                if (
                  details.reason === 'outside-press' &&
                  target instanceof Element &&
                  target.closest('[data-sidebar-toggle]')
                ) {
                  return;
                }
                closeDrawer();
              }}
              // pinned: focus is trapped in the drawer; a peek leaves focus where it was
              modal={drawer === 'open'}
              swipeDirection="left"
            >
              {/* kept mounted while closed, so a peek opens at once */}
              <Drawer.Portal keepMounted container={root}>
                {/* the page dims behind the drawer, peeking or pinned; pressing it closes the drawer */}
                <Drawer.Backdrop className={styles.backdrop} />
                <Drawer.Viewport className={styles.drawerViewport}>
                  <Drawer.Popup
                    ref={drawerPopup}
                    className={styles.drawer}
                    aria-label="Sidebar"
                    // pinned: focus the drawer itself, not its first button (whose tooltip would show)
                    initialFocus={drawer === 'open' ? drawerPopup : false}
                    onPointerEnter={() => clearTimeout(closeTimer.current)}
                    onPointerLeave={(event) => {
                      if (drawer !== 'peek' || event.pointerType !== 'mouse') return;
                      clearTimeout(closeTimer.current);
                      closeTimer.current = setTimeout(closeDrawer, PEEK_CLOSE_DELAY);
                    }}
                    onPointerDown={() => clearTimeout(closeTimer.current)}
                    // using a peeked drawer pins it, so a menu it opens never closes it. On the
                    // click's way up, after an item's own click has closed the drawer, which this
                    // keeps; and keyboard focus pins it too
                    onClick={() => setDrawer((state) => (state === 'peek' ? 'open' : state))}
                    onFocus={(event) => {
                      if (event.target.matches(':focus-visible')) {
                        setDrawer((state) => (state === 'peek' ? 'open' : state));
                      }
                    }}
                  >
                    <WorkspaceShellContext.Provider value={drawerContext}>
                      {sidebar}
                    </WorkspaceShellContext.Provider>
                  </Drawer.Popup>
                </Drawer.Viewport>
              </Drawer.Portal>
            </Drawer.Root>
          )}
        </TooltipProvider>
      </WorkspaceShellContext.Provider>
    );
  },
);
