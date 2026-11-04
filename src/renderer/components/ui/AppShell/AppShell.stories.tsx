import type { Meta, StoryObj } from '@storybook/react-vite';
import { List } from 'lucide-react';
import { Text } from '../../layout/Text';
import { Breadcrumb } from '../Breadcrumb';
import { PageContent, PageHeader, PageToolbar } from '../PageHeader';
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
        trafficLights="drawn"
        sidebar={<DemoSidebar active="Tasks" />}
        header={
          <PageHeader>
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
