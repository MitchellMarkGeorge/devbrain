import type { Meta, StoryObj } from '@storybook/react-vite';
import { List } from 'lucide-react';
import { Breadcrumb } from '../Breadcrumb';
import { PageFavoriteButton, PageHeader, PageHeaderInWindowBar } from '../PageHeader';
import { TooltipProvider } from '../Tooltip';
import { TrafficLights, WindowBar, WindowControls } from './WindowBar';

const meta = {
  title: 'Shell/WindowBar',
  component: WindowBar,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof WindowBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The collapsed-sidebar bar: traffic lights, sidebar toggle, back and forward, then the page's header. */
export const Default: Story = {
  render: () => (
    <PageHeaderInWindowBar.Provider value>
      <WindowBar>
        <PageHeader actions={<PageFavoriteButton favorite={false} />}>
          <Breadcrumb items={['Tasks', { label: 'List', icon: List }]} />
        </PageHeader>
      </WindowBar>
    </PageHeaderInWindowBar.Provider>
  ),
};

/** The parts: the traffic lights' slot (drawn here; reserved in the app) and the controls. */
export const Parts: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: 16 }}>
      <TrafficLights mode="drawn" />
      <TrafficLights mode="reserved" style={{ outline: '1px dashed var(--border)' }} />
      <WindowControls />
    </div>
  ),
};
