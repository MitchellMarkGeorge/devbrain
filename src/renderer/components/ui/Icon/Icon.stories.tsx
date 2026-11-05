import type { Meta, StoryObj } from '@storybook/react-vite';
import { Activity, Calendar, FileText, Folder, House, Inbox, Settings } from 'lucide-react';
import { Flex } from '../../layout/Flex';
import { Icon } from './Icon';

const meta = {
  title: 'UI/Icon',
  component: Icon,
  args: { icon: Folder, size: 16 },
  argTypes: {
    size: { control: 'inline-radio', options: [12, 16, 20, 24] },
    icon: { control: false },
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** 16px in navigation, rows, buttons and menus; inactive icons in `muted-foreground` */
export const Set: Story = {
  render: () => (
    <Flex gap="4" align="center" style={{ color: 'var(--muted-foreground)' }}>
      {[House, Inbox, Calendar, Folder, FileText, Activity, Settings].map((icon, i) => (
        <Icon key={i} icon={icon} />
      ))}
    </Flex>
  ),
};

/** 12px inside pills and xs buttons */
export const Small: Story = { args: { size: 12 } };

export const Coloured: Story = { args: { style: { color: 'var(--swatch-blue)' } } };
