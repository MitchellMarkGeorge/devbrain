import { useState, type ComponentProps, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { List, X } from 'lucide-react';
import { Flex, Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { Breadcrumb } from '../../ui/Breadcrumb';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { WindowFrameProvider, type Platform } from '../../lib/platform';
import { DemoSidebar } from '../../screens/Shell/AppFrame';
import { TaskList } from '../../lists/TaskList';
import { manyTasks } from '../../lists/TaskRow/fixtures';
import { PageContent, PageFavoriteButton, PageHeader, PageToolbar } from '../PageHeader';
import { ShellPrototype } from './ShellPrototype';

const meta = {
  title: 'Shell/ShellPrototype',
  component: ShellPrototype,
  parameters: { layout: 'fullscreen' },
  args: { sidebar: null },
} satisfies Meta<typeof ShellPrototype>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A docked sheet: a plain section in the shell's sheet slot, no dialog and no portal. */
function DemoSheet({ onClose }: { onClose: () => void }) {
  return (
    <section aria-label="Task" style={{ display: 'flex', flexDirection: 'column' }}>
      <Stack gap="3" style={{ padding: 16 }}>
        <Flex justify="between" align="center">
          <Text tone="muted">Task</Text>
          <IconButton size="sm" tone="muted" icon={X} label="Close" onClick={onClose} />
        </Flex>
        <Text size="lg" weight="semibold">
          Implement OAuth2 PKCE flow
        </Text>
        <Text tone="muted">Due Jun 24 · Auth Overhaul</Text>
      </Stack>
    </section>
  );
}

function Frame({
  width,
  height,
  children,
  ...props
}: { width: number; height: number; children?: ReactNode } & Partial<
  ComponentProps<typeof ShellPrototype>
>) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [position, setPosition] = useState(1);
  const pages = 3;
  return (
    <div style={{ width, height }}>
      <ShellPrototype
        sidebar={<DemoSidebar active="Tasks" />}
        header={
          <PageHeader actions={<PageFavoriteButton favorite={false} />}>
            <Breadcrumb items={['Tasks', { label: 'List', icon: List }]} />
          </PageHeader>
        }
        sheet={sheetOpen && <DemoSheet onClose={() => setSheetOpen(false)} />}
        history={{
          back: () => setPosition((n) => n - 1),
          forward: () => setPosition((n) => n + 1),
          canGoBack: position > 0,
          canGoForward: position < pages - 1,
        }}
        {...props}
      >
        {children ?? (
          <>
            <PageToolbar
              start={<Text tone="muted">Toolbar</Text>}
              end={
                <Button variant="outline" onClick={() => setSheetOpen((open) => !open)}>
                  {sheetOpen ? 'Close sheet' : 'Open sheet'}
                </Button>
              }
            />
            <PageContent>
              <Text tone="subtle">
                The sidebar toggle hides and docks the sidebar. While it’s hidden, point at the
                toggle or the window’s left edge to peek at it, and click the toggle (or anything in
                the peeked drawer) to pin it. “Open sheet” fills the sheet slot, which opens the
                column at the right.
              </Text>
            </PageContent>
          </>
        )}
      </ShellPrototype>
    </div>
  );
}

/** Wide: the sidebar docked beside the page, its window row at the top. */
export const Wide: Story = { render: () => <Frame width={1440} height={720} size="wide" /> };

/** The user hid the sidebar: its window controls move before the header, in the same row. */
export const Hidden: Story = {
  render: () => <Frame width={1440} height={720} size="wide" defaultCollapsed />,
};

/** Compact: the sidebar rests hidden; the toggle pins the drawer open, with the backdrop. */
export const Compact: Story = { render: () => <Frame width={960} height={640} size="compact" /> };

const LONG_LIST = manyTasks(1000);

/** A list page: the 1,000-row list scrolls itself under the header and toolbar. */
export const ListPage: Story = {
  render: () => (
    <Frame width={1280} height={720} size="wide">
      <PageToolbar
        start={<Button value="Open">Filter</Button>}
        end={<Button value="Priority">Sort</Button>}
      />
      <PageContent layout="list">
        <TaskList tasks={LONG_LIST} />
      </PageContent>
    </Frame>
  ),
};

function On({ platform, children }: { platform: Platform; children: ReactNode }) {
  return (
    <WindowFrameProvider value={{ platform, controls: 'drawn' }}>{children}</WindowFrameProvider>
  );
}

/** Windows: the header row runs across the sheet, clear of the caption buttons. */
export const Windows: Story = {
  render: () => (
    <On platform="windows">
      <Frame width={1440} height={720} size="wide" />
    </On>
  ),
};

/** Windows, sidebar hidden: the menu button, the controls and the header share the top row. */
export const WindowsHidden: Story = {
  render: () => (
    <On platform="windows">
      <Frame width={1440} height={720} size="wide" defaultCollapsed />
    </On>
  ),
};

/** Linux: the system draws the title bar, so the window row has no start. */
export const Linux: Story = {
  render: () => (
    <On platform="linux">
      <Frame width={1440} height={720} size="wide" defaultCollapsed />
    </On>
  ),
};
