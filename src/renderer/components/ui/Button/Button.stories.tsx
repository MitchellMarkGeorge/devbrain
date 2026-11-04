import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ArrowUpDown, Ellipsis, ListFilter, Plus, Star } from 'lucide-react';
import { Flex } from '../../layout/Flex';
import { Button } from './Button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: 'New Task' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'secondary', 'outline', 'ghost', 'destructive', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'xs', 'icon', 'icon-sm', 'icon-xs'],
    },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: (args) => (
    <Flex gap="3" wrap="wrap" align="center">
      <Button {...args} variant="default">
        New Task
      </Button>
      <Button {...args} variant="outline">
        Sort
      </Button>
      <Button {...args} variant="secondary">
        Secondary
      </Button>
      <Button {...args} variant="ghost">
        Close
      </Button>
      <Button {...args} variant="destructive">
        Delete
      </Button>
      <Button {...args} variant="link">
        View all tasks →
      </Button>
      <Button {...args} variant="primary">
        Primary
      </Button>
    </Flex>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <Flex gap="3" align="center">
      <Button {...args} size="xs" icon={Plus}>
        Add
      </Button>
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="default">
        Default
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
    </Flex>
  ),
};

/** Icon-only buttons have no label, only an `aria-label` (the meta's default label is cleared) */
export const IconOnly: Story = {
  args: { children: undefined },
  render: (args) => (
    <Flex gap="3" align="center">
      <Button {...args} size="icon" icon={Star} aria-label="Favorite" />
      <Button {...args} size="icon-sm" variant="ghost" icon={Ellipsis} aria-label="More" />
      <Button {...args} size="icon-xs" variant="ghost" icon={Plus} aria-label="New" />
    </Flex>
  ),
};

export const WithIcons: Story = {
  args: { icon: Plus, children: 'New Task' },
};

export const ToolbarValue: Story = {
  render: () => (
    <Flex direction="column" gap="3">
      <Flex gap="2">
        <Button icon={ListFilter} value="Today">
          Filter
        </Button>
        <Button icon={ArrowUpDown} value="Due date">
          Sort
        </Button>
      </Flex>
      {/* the compact toolbar of a narrow window: values hidden, labels keep their toolbar look */}
      <Flex gap="2">
        <Button icon={ListFilter} value="Today" hideValue>
          Filter
        </Button>
        <Button icon={ArrowUpDown} value="Due date" hideValue>
          Sort
        </Button>
      </Flex>
    </Flex>
  ),
};

/**
 * Pressed: every button nudges down 1px while held (menu triggers stay put). A toggle that is on
 * (`aria-pressed`) fills with `accent`: here a toolbar filter in a compact window, its value
 * hidden, shown as on.
 */
export const Pressed: Story = {
  render: () => {
    const [on, setOn] = useState(true);
    return (
      <Flex gap="2" align="center">
        <Button icon={ListFilter} aria-pressed={on} onClick={() => setOn(!on)}>
          Filter
        </Button>
        <Button variant="ghost" aria-pressed={!on} onClick={() => setOn(!on)}>
          Ghost toggle
        </Button>
      </Flex>
    );
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};
