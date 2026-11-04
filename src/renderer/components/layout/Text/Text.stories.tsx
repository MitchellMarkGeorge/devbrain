import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from '../Flex';
import { Text } from './Text';

const meta = {
  title: 'Layout/Text',
  component: Text,
  args: { children: 'Ship the onboarding flow' },
  argTypes: {
    size: { control: 'inline-radio', options: ['xs', 'sm', 'base', 'lg'] },
    weight: { control: 'inline-radio', options: ['normal', 'medium', 'semibold'] },
    tone: {
      control: 'select',
      options: [
        'inherit',
        'default',
        'strong',
        'muted',
        'subtle',
        'destructive',
        'today',
        'overdue',
      ],
    },
    lineClamp: { control: 'number' },
  },
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Tones: Story = {
  render: () => (
    <Stack gap="2">
      <Text tone="strong">Strong: titles and row names</Text>
      <Text tone="default">Default: body text</Text>
      <Text tone="muted">Muted: labels and descriptions</Text>
      <Text tone="subtle">Subtle: metadata a reader can skip</Text>
      <Text tone="today">Today 10:30 AM</Text>
      <Text tone="overdue">Sep 28</Text>
      <Text tone="destructive">Enter a name for the project.</Text>
    </Stack>
  ),
};

export const Scale: Story = {
  render: () => (
    <Stack gap="2">
      <Text size="lg">18px large</Text>
      <Text size="base">16px base</Text>
      <Text size="sm" weight="medium">
        14px medium: buttons, labels, tabs
      </Text>
      <Text size="sm">14px regular: rows and menu items</Text>
      <Text size="xs" tone="muted">
        12px: badges, metadata, shortcuts
      </Text>
      <Text size="xs" mono>
        ENG-124
      </Text>
    </Stack>
  ),
};

export const Truncated: Story = {
  render: () => (
    <div style={{ width: 200 }}>
      <Text truncate render={<p />}>
        A task title long enough that it ends in an ellipsis at its own width
      </Text>
    </div>
  ),
};

export const Clamped: Story = {
  render: () => (
    <div style={{ width: 280 }}>
      <Text tone="subtle" lineClamp={2} render={<p />}>
        Agenda: review the Q3 roadmap, settle the calendar sync scope, and agree on who owns the
        onboarding rewrite before the next planning cycle starts.
      </Text>
    </div>
  ),
};
