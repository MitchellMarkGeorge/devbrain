import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarDays, Folder, Plus } from 'lucide-react';
import { Flex, Stack } from '../../layout/Flex';
import { PriorityIcon } from '../PriorityIcon';
import { ProgressRing } from '../ProgressRing';
import { StatusIcon } from '../StatusIcon';
import { Badge } from './Badge';

const meta = {
  title: 'Components/Badge',
  component: Badge,
  args: { children: 'In progress', variant: 'outline' },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['outline', 'default', 'secondary', 'destructive'],
    },
    muted: { control: 'boolean' },
    interactive: { control: 'boolean' },
    prefix: { control: 'text' },
    barColor: {
      control: 'select',
      options: [undefined, 'red', 'amber', 'green', 'blue', 'indigo', 'pink'],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: () => (
    <Flex gap="2" align="center">
      <Badge variant="outline">Outline</Badge>
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
    </Flex>
  ),
};

/** The property pills: an icon node, a prefix, muted "+ Add" pills and an event bar */
export const Properties: Story = {
  render: () => (
    <Stack gap="3">
      <Flex gap="2" wrap="wrap">
        <Badge icon={<StatusIcon status="in-progress" size={12} />}>In progress</Badge>
        <Badge icon={<PriorityIcon priority="high" size={12} />}>High</Badge>
        <Badge icon={CalendarDays} prefix="Due">
          Jul 1
        </Badge>
        <Badge icon={Folder} iconColor="blue">
          Website redesign
        </Badge>
        <Badge icon={<ProgressRing value={3} total={12} size={12} />}>25% · 3 of 12 done</Badge>
      </Flex>
      <Flex gap="2" wrap="wrap">
        <Badge barColor="green" prefix="Linked to">
          Mitchell / Jesse 1:1
        </Badge>
        <Badge icon={Plus} muted interactive>
          Add start date
        </Badge>
      </Flex>
    </Stack>
  ),
};

/** An interactive badge is a button: it brightens on hover and takes the focus ring */
export const Interactive: Story = {
  args: { interactive: true, icon: Folder, iconColor: 'indigo', children: 'DevBrain app' },
};

export const Truncated: Story = {
  args: {
    icon: Folder,
    children: 'A project with a name far too long to fit in a single pill',
  },
};
