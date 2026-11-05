import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { List } from 'lucide-react';
import { Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { Breadcrumb } from '../../ui/Breadcrumb';
import { Button } from '../../ui/Button';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetItemTitle } from '../../ui/Sheet';
import { useAppShell } from './context';
import { PageContent, PageFavoriteButton, PageHeader, PageToolbar } from '../PageHeader';
import { WindowFrameProvider, type Platform } from '../../lib/platform';
import { DemoSidebar } from '../../screens/Shell/AppFrame';
import { AppShell } from './AppShell';

const meta = {
  title: 'Shell/AppShell',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
  args: { sidebar: null },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

function Frame({
  width,
  height,
  ...props
}: { width: number; height: number } & Partial<React.ComponentProps<typeof AppShell>>) {
  return (
    <div style={{ width, height }}>
      <AppShell
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
          <Text tone="subtle">Page content. Press ⌘\ to toggle the sidebar.</Text>
        </PageContent>
      </AppShell>
    </div>
  );
}

/** Wide (1280px and up): the full sidebar with the window row, the page beside it. */
export const Wide: Story = { render: () => <Frame width={1440} height={720} /> };

/** The user collapsed the sidebar: the rail under the window bar, which carries the header. */
export const Collapsed: Story = {
  render: () => <Frame width={1440} height={720} defaultCollapsed />,
};

/** Compact (below 1080px): the rail; the toggle opens the drawer. */
export const Compact: Story = { render: () => <Frame width={960} height={640} /> };

/** Compact with the drawer open over the page and the backdrop behind. */
export const CompactDrawer: Story = {
  render: () => <Frame width={960} height={640} defaultDrawerOpen />,
};

/** Home's right column shows from 1280px; a docked sheet opens a 380px column. */
export const AsideAndSheet: Story = {
  render: () => (
    <Frame width={1440} height={720} sheetOpen aside={<Text tone="muted">Right column</Text>} />
  ),
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

/** Windows, collapsed: the bar carries the menu button, the controls and the header. */
export const WindowsCollapsed: Story = {
  render: () => (
    <On platform="windows">
      <Frame width={1440} height={720} defaultCollapsed />
    </On>
  ),
};

/**
 * Windows with a docked sheet: the header runs the full width, and the sheet and the right column
 * start under it, so nothing of theirs sits by the caption buttons.
 */
export const WindowsSheet: Story = {
  render: () => (
    <On platform="windows">
      <Frame width={1440} height={720} sheetOpen aside={<Text tone="muted">Right column</Text>} />
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
  const { sheetContainer } = useAppShell();
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
        <AppShell
          sheetOpen={open}
          sidebar={<DemoSidebar active="Tasks" />}
          header={
            <PageHeader>
              <Breadcrumb items={['Tasks', { label: 'List', icon: List }]} />
            </PageHeader>
          }
        >
          <DockedSheetPage open={open} onOpenChange={setOpen} />
        </AppShell>
      </div>
    );
  },
};
