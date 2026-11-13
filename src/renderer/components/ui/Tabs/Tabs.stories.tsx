import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleCheck, FileText, LayoutDashboard } from 'lucide-react';
import { Text } from '../../layout/Text';
import { Tabs, TabsList, TabsPanel, TabsTab } from './Tabs';

const SECTIONS = ['General', 'Tasks', 'Calendar', 'Data & storage'];

const meta = {
  title: 'UI/Tabs',
  component: Tabs,
  args: { defaultValue: 'General' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['outline', 'default', 'line'] },
    size: { control: 'inline-radio', options: ['default', 'lg'] },
  },
  render: (args) => (
    <Tabs {...args}>
      <TabsList>
        {SECTIONS.map((s) => (
          <TabsTab key={s} value={s}>
            {s}
          </TabsTab>
        ))}
      </TabsList>
      {SECTIONS.map((s) => (
        <TabsPanel key={s} value={s}>
          <Text tone="muted">{s} settings</Text>
        </TabsPanel>
      ))}
    </Tabs>
  ),
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Settings sections: the outline variant */
export const Default: Story = {};

export const Segmented: Story = { args: { variant: 'default' } };

export const Line: Story = { args: { variant: 'line' } };

/** The outline variant at `size="lg"`, with icons */
export const WithIcons: Story = {
  render: () => (
    <Tabs defaultValue="overview" size="lg">
      <TabsList>
        <TabsTab value="overview" icon={LayoutDashboard}>
          Overview
        </TabsTab>
        <TabsTab value="tasks" icon={CircleCheck}>
          Tasks
        </TabsTab>
        <TabsTab value="notes" icon={FileText}>
          Notes
        </TabsTab>
      </TabsList>
    </Tabs>
  ),
};

/** A project's sub-pages, at the top of its page: the line variant at `size="lg"`, with icons */
export const LineLarge: Story = {
  render: () => (
    <Tabs defaultValue="overview" variant="line" size="lg">
      <TabsList>
        <TabsTab value="overview" icon={LayoutDashboard}>
          Overview
        </TabsTab>
        <TabsTab value="tasks" icon={CircleCheck}>
          Tasks
        </TabsTab>
        <TabsTab value="notes" icon={FileText}>
          Notes
        </TabsTab>
      </TabsList>
    </Tabs>
  ),
};
