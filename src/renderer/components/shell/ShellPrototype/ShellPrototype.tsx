import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react';
import { Drawer } from '@base-ui/react/drawer';
import { cn } from '../../lib/cn';
import { useWindowFrame } from '../../lib/platform';
import { ScrollArea } from '../../ui/ScrollArea';
import { TooltipProvider } from '../../ui/Tooltip';
import { CaptionButtons, WindowControls, WindowStart } from '../WindowBar';
import {
  WorkspaceShellContext,
  type WindowSize,
  type WorkspaceShellContextValue,
} from '../WorkspaceShell/context';
import { PEEK_CLOSE_DELAY, PEEK_OPEN_DELAY, windowSizeFor } from '../WorkspaceShell/layout';
import styles from './ShellPrototype.module.css';

// PROTOTYPE (Storybook only) of a simpler WorkspaceShell. Every slot renders once, in one place in
// the DOM, and CSS grid places it; the sidebar is a docked <nav> or a Base UI Drawer, never both.
// It provides the current shell's context, so Sidebar, WindowControls and PageToolbar work in it
// unchanged.

export interface ShellHistory {
  back: () => void;
  forward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface ShellPrototypeProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  /** the app's `Sidebar`: docked at the left, or in a drawer over the page while hidden */
  sidebar: ReactNode;
  /** the page's `PageHeader`: beside the docked sidebar, or after the window controls while hidden */
  header?: ReactNode;
  /** a docked sheet: the column at the right opens while this renders anything */
  sheet?: ReactNode;
  /** the page under its header */
  children?: ReactNode;
  history?: ShellHistory;
  /** the user's choice: hide the sidebar at any size (⌘\) */
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** pin the window size instead of reading the window's width (stories) */
  size?: WindowSize;
}

/** The hidden sidebar's drawer: shut, peeked at by pointing, or pinned open. */
type DrawerState = 'closed' | 'peek' | 'open';

function useWindowSize(pinned: WindowSize | undefined): WindowSize {
  const [measured, setMeasured] = useState<WindowSize>(() => windowSizeFor(window.innerWidth));
  useEffect(() => {
    if (pinned) return;
    const update = () => setMeasured(windowSizeFor(window.innerWidth));
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [pinned]);
  return pinned ?? measured;
}

export function ShellPrototype({
  sidebar,
  header,
  sheet,
  children,
  history,
  collapsed: collapsedProp,
  defaultCollapsed = false,
  onCollapsedChange,
  size: sizeProp,
  className,
  ...props
}: ShellPrototypeProps) {
  const root = useRef<HTMLDivElement>(null);
  const drawerPopup = useRef<HTMLDivElement>(null);
  const size = useWindowSize(sizeProp);
  const compact = size === 'compact';
  const frame = useWindowFrame();

  const [ownCollapsed, setOwnCollapsed] = useState(defaultCollapsed);
  const collapsed = collapsedProp ?? ownCollapsed;
  const setCollapsed = useCallback(
    (next: boolean) => {
      setOwnCollapsed(next);
      onCollapsedChange?.(next);
    },
    [onCollapsedChange],
  );

  const docked = !collapsed && !compact;
  const [drawer, setDrawer] = useState<DrawerState>('closed');
  // a docked sidebar has no drawer
  if (docked && drawer !== 'closed') setDrawer('closed');

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

  const toggleSidebar = useCallback(() => {
    clearTimers();
    if (docked) setCollapsed(true);
    else if (!compact) setCollapsed(false);
    else setDrawer((state) => (state === 'open' ? 'closed' : 'open'));
  }, [clearTimers, docked, compact, setCollapsed]);

  const peekSidebar = useCallback(() => {
    clearTimeout(closeTimer.current);
    if (docked || drawer !== 'closed') return;
    clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => setDrawer('peek'), PEEK_OPEN_DELAY);
  }, [docked, drawer]);
  const cancelPeek = useCallback(() => clearTimeout(openTimer.current), []);

  // the current shell's context, so its Sidebar and WindowControls work here unchanged
  const context = useMemo<WorkspaceShellContextValue>(
    () => ({
      inShell: true,
      size,
      sidebarHidden: !docked,
      inDrawer: false,
      drawerOpen: drawer !== 'closed',
      peeking: drawer === 'peek',
      toggleSidebar,
      closeDrawer,
      peekSidebar,
      cancelPeek,
      onBack: history?.back,
      onForward: history?.forward,
      canGoBack: history?.canGoBack ?? false,
      canGoForward: history?.canGoForward ?? false,
      sheetContainer: null,
    }),
    [size, docked, drawer, toggleSidebar, closeDrawer, peekSidebar, cancelPeek, history],
  );
  const drawerContext = useMemo(() => ({ ...context, inDrawer: true }), [context]);

  return (
    <WorkspaceShellContext.Provider value={context}>
      <TooltipProvider>
        <div
          ref={root}
          data-sidebar={docked ? 'docked' : 'hidden'}
          data-platform={frame.platform}
          data-size={size}
          className={cn(styles.shell, className)}
          {...props}
        >
          {docked ? (
            <div className={styles.sidebar}>{sidebar}</div>
          ) : (
            <div className={styles.bar}>
              <WindowStart />
              <WindowControls />
            </div>
          )}
          <div className={styles.header}>{header}</div>
          <main className={styles.main}>
            <ScrollArea className={styles.scroll} viewportClassName={styles.scrollViewport}>
              {children}
            </ScrollArea>
          </main>
          <aside className={styles.sheet}>{sheet}</aside>
          {!docked && drawer === 'closed' && (
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
        {!docked && (
          <Drawer.Root
            open={drawer !== 'closed'}
            onOpenChange={(open) => (open ? setDrawer('open') : closeDrawer())}
            // pinned: focus is trapped in the drawer; a peek leaves focus where it was
            modal={drawer === 'open'}
            swipeDirection="left"
          >
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
                  // using a peeked drawer pins it, so a menu it opens never closes it. On the click's
                  // way up, after an item's own click has closed the drawer, which this keeps
                  onClick={() => setDrawer((state) => (state === 'peek' ? 'open' : state))}
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
}
