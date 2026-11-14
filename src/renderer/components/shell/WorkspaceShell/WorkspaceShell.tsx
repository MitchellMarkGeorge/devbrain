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
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import { Drawer } from '@base-ui/react/drawer';
import { cn } from '../../lib/cn';
import { useWindowFrame } from '../../lib/platform';
import { TooltipProvider } from '../../ui/Tooltip';
import { CaptionButtons, WindowBar } from '../WindowBar';
import { WorkspaceShellContext, type WorkspaceShellContextValue, type WindowSize } from './context';
import { PEEK_CLOSE_DELAY, PEEK_OPEN_DELAY, windowSizeFor } from './layout';
import { useStillPointer } from './use-still-pointer';
import styles from './WorkspaceShell.module.css';

export interface WorkspaceShellProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** the app's `Sidebar`: docked at the left, or in a drawer over the page while hidden */
  sidebar: ReactNode;
  /**
   * the page: a `Page`, which draws its own header (or none) and scrolls. While the sidebar is
   * hidden the `WindowBar` sits over the page's top left; `--window-bar-inset` is its width, which
   * a `PageHeader` keeps clear of
   */
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
   * What the code that renders the shell can ask of it: the app's keymap toggles the sidebar on ⌘\
   * through it. Inside the shell, `useWorkspaceShell()` gives the same
   */
  controlsRef?: Ref<WorkspaceShellControls>;
}

/** The shell's actions, for the code that renders it (`controlsRef`). */
export interface WorkspaceShellControls {
  /** hides the sidebar, docks it again, or opens and closes its drawer in a compact window */
  toggleSidebar: () => void;
}

/** The hidden sidebar's drawer: shut, peeked at by pointing, or pinned open. */
type DrawerState = 'closed' | 'peek' | 'open';

/**
 * The window inside a workspace, the frame every page in it shares (outside one it's an
 * `AppShell`). Each part renders once, in one place, and a CSS grid places it: the sidebar, the
 * page's header, the page, and the docked sheet's column. The sidebar is docked, or hidden with
 * the `WindowBar` beside the header; while hidden it opens as a drawer over the page. It measures
 * its own width and follows the README's window sizes: below 1080px the sidebar rests hidden and
 * sheets float. It binds no keys: the app's keymap runs `toggleSidebar` (through `controlsRef`) on ⌘\.
 *
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
    const drawerPopup = useRef<HTMLDivElement>(null);
    // the WindowBar's width, for the page's header to start after it while the sidebar is hidden
    const [windowBar, setWindowBar] = useState<HTMLDivElement | null>(null);
    const [windowBarWidth, setWindowBarWidth] = useState(0);
    useLayoutEffect(() => {
      if (!windowBar) return;
      setWindowBarWidth(windowBar.getBoundingClientRect().width);
      const observer = new ResizeObserver(([entry]) => {
        setWindowBarWidth(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width);
      });
      observer.observe(windowBar);
      return () => observer.disconnect();
    }, [windowBar]);

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
      if (!hidden) setCollapsed(true);
      // where the window is wide enough, the toggle docks the sidebar (from the drawer too)
      else if (!compact) setCollapsed(false);
      else setDrawer((state) => (state === 'open' ? 'closed' : 'open'));
    }, [clearTimers, pointer, hidden, compact, setCollapsed]);
    useImperativeHandle(controlsRef, () => ({ toggleSidebar }), [toggleSidebar]);

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
      }),
      [
        sheetContainer,
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
            data-platform={frame.platform}
            className={cn(styles.shell, className)}
            {...props}
            style={
              {
                '--window-bar-inset': hidden ? `${windowBarWidth}px` : '0px',
                ...props.style,
              } as CSSProperties
            }
          >
            {hidden ? (
              <WindowBar ref={setWindowBar} className={styles.bar} />
            ) : (
              <div className={styles.sidebar}>{sidebar}</div>
            )}
            {/* the page draws its own header (a `Page`) and scrolls itself */}
            <main className={styles.main}>{children}</main>
            {/* Windows: a strip to drag the window by, over the sheet's column, under the caption buttons */}
            {frame.platform === 'windows' && <div aria-hidden className={styles.titleBar} />}
            {/* a docked sheet is portalled in here; the column slides open while that sheet is open */}
            <aside ref={setSheetContainer} className={styles.sheet} />
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
          {hidden && (
            <Drawer.Root
              open={drawer !== 'closed'}
              onOpenChange={(open) => (open ? setDrawer('open') : closeDrawer())}
              // pinned: focus is trapped in the drawer; a peek leaves focus where it was
              modal={drawer === 'open'}
              swipeDirection="left"
            >
              {/* kept mounted while closed, so a peek opens at once */}
              <Drawer.Portal keepMounted container={root}>
                {drawer === 'open' && <Drawer.Backdrop className={styles.backdrop} />}
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
