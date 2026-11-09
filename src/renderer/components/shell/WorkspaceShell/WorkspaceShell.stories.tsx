import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { List } from 'lucide-react';
import { Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { Breadcrumb } from '../../ui/Breadcrumb';
import { Button } from '../../ui/Button';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetItemTitle } from '../../ui/Sheet';
import { useWorkspaceShell } from './context';
import { PageContent, PageFavoriteButton, PageHeader, PageToolbar } from '../PageHeader';
import { WindowFrameProvider, type Platform } from '../../lib/platform';
import { DemoSidebar } from '../../screens/Shell/AppFrame';
import { TaskList } from '../../lists/TaskList';
import { manyTasks } from '../../lists/TaskRow/fixtures';
import { WorkspaceShell } from './WorkspaceShell';

const meta = {
  title: 'Shell/WorkspaceShell',
  component: WorkspaceShell,
  parameters: { layout: 'fullscreen' },
  args: { sidebar: null },
} satisfies Meta<typeof WorkspaceShell>;

export default meta;
type Story = StoryObj<typeof meta>;

function Frame({
  width,
  height,
  ...props
}: { width: number; height: number } & Partial<React.ComponentProps<typeof WorkspaceShell>>) {
  return (
    <div style={{ width, height }}>
      <WorkspaceShell
        sidebar={<DemoSidebar active="Tasks" />}
        header={
          <PageHeader actions={<PageFavoriteButton favorite={false} />}>
            <Breadcrumb items={['Tasks', { label: 'List', icon: List }]} />
          </PageHeader>
        }
        {...props}
      >
        <PageToolbar start={<Text tone="muted">Toolbar</Text>} />
        <PageContent>
          <Text tone="subtle">
            Page content. Press ⌘\ to show or hide the sidebar; while it’s hidden, point at the
            toggle or the window’s left edge to peek at it.
          </Text>
        </PageContent>
      </WorkspaceShell>
    </div>
  );
}

/** Wide (1280px and up): the docked sidebar with the window row, the page beside it. */
export const Wide: Story = { render: () => <Frame width={1440} height={720} /> };

const LONG_LIST = manyTasks(1000);

/**
 * A list page: the header and toolbar stay put while the 1,000-row `TaskList` in the `PageContent`
 * fills the rest of the height and scrolls itself, drawing only the rows in view. The page scroller
 * never scrolls on a list page; a Home or document page, which keeps its height, scrolls in it.
 */
export const ListPage: Story = {
  render: () => (
    <div style={{ width: 1280, height: 720 }}>
      <WorkspaceShell
        sidebar={<DemoSidebar active="Tasks" />}
        header={
          <PageHeader actions={<PageFavoriteButton favorite={false} />}>
            <Breadcrumb items={['Tasks', { label: 'List', icon: List }]} />
          </PageHeader>
        }
      >
        <PageToolbar
          start={<Button value="Open">Filter</Button>}
          end={<Button value="Priority">Sort</Button>}
        />
        <PageContent layout="list">
          <TaskList tasks={LONG_LIST} />
        </PageContent>
      </WorkspaceShell>
    </div>
  ),
};

/**
 * The shell fades in as it appears (`duration-slow`, `ease-surface`, from 99%): in the app, after
 * the splash at startup and on a switch of workspace. Replay mounts it again.
 */
export const Entering: Story = {
  render: function Render() {
    const [key, setKey] = useState(0);
    return (
      <Stack gap="2" align="start" style={{ padding: 16 }}>
        <Button variant="outline" onClick={() => setKey((n) => n + 1)}>
          Replay
        </Button>
        <Frame key={key} width={1280} height={640} />
      </Stack>
    );
  },
};

/**
 * The user hid the sidebar (⌘\): the window bar runs across the top and carries the header.
 * Pointing at the toggle or the left edge peeks at the drawer; clicking the toggle docks it.
 */
export const Hidden: Story = {
  render: () => <Frame width={1440} height={720} defaultCollapsed />,
};

/**
 * Compact (below 1080px): the sidebar rests hidden. Pointing at the toggle or the left edge peeks
 * at the drawer; clicking the toggle pins it open.
 */
export const Compact: Story = { render: () => <Frame width={960} height={640} /> };

/** Compact with the drawer pinned open over the page and the backdrop behind. */
export const CompactDrawer: Story = {
  render: () => <Frame width={960} height={640} defaultDrawerOpen />,
};

/** Pins a story to a platform, whatever the toolbar says. */
function On({ platform, children }: { platform: Platform; children: React.ReactNode }) {
  return (
    <WindowFrameProvider value={{ platform, controls: 'drawn' }}>{children}</WindowFrameProvider>
  );
}

/**
 * Windows: the menu button where the traffic lights are, and Windows' caption buttons over the top
 * right (painted here), which the header's actions stop 16px short of.
 */
export const Windows: Story = {
  render: () => (
    <On platform="windows">
      <Frame width={1440} height={720} />
    </On>
  ),
};

/** Windows, sidebar hidden: the bar carries the menu button, the controls and the header. */
export const WindowsHidden: Story = {
  render: () => (
    <On platform="windows">
      <Frame width={1440} height={720} defaultCollapsed />
    </On>
  ),
};

/**
 * Windows with a docked sheet: the header runs the full width, and the sheet starts under it, so
 * nothing of the sheet's sits by the caption buttons.
 */
export const WindowsSheet: Story = {
  render: () => (
    <On platform="windows">
      <Frame width={1440} height={720} sheetOpen />
    </On>
  ),
};

/** Linux: the system frame draws the title bar above the page, so the window row has no start. */
export const Linux: Story = {
  render: () => (
    <On platform="linux">
      <Frame width={1440} height={720} />
    </On>
  ),
};

/** The page's content in the docked-sheet story: opens a task's sheet into the shell's column. */
function DockedSheetPage({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { sheetContainer } = useWorkspaceShell();
  return (
    <PageContent>
      <Stack gap="3" align="start">
        <Button onClick={() => onOpenChange(!open)}>{open ? 'Close task' : 'Open task'}</Button>
        <Text tone="subtle">
          The sheet docks in a column at the right: the page narrows as it slides in, and widens
          again as it slides out.
        </Text>
      </Stack>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent container={sheetContainer}>
          <SheetHeader onOpenAsPage={() => undefined}>Task</SheetHeader>
          <SheetBody>
            <SheetItemTitle>Implement OAuth2 PKCE flow</SheetItemTitle>
            <Text tone="muted">Due Jun 24 · Auth Overhaul</Text>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </PageContent>
  );
}

/**
 * A sheet docked beside the page (wide and medium windows): opening slides the sheet in from the
 * right while its column widens and the page narrows, on the same timing; closing reverses it.
 */
export const DockedSheet: Story = {
  render: function DockedSheetStory() {
    const [open, setOpen] = useState(false);
    return (
      <div style={{ width: 1440, height: 720 }}>
        <WorkspaceShell
          sheetOpen={open}
          sidebar={<DemoSidebar active="Tasks" />}
          header={
            <PageHeader>
              <Breadcrumb items={['Tasks', { label: 'List', icon: List }]} />
            </PageHeader>
          }
        >
          <DockedSheetPage open={open} onOpenChange={setOpen} />
        </WorkspaceShell>
      </div>
    );
  },
};
