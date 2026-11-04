import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stack } from '../Flex';
import { Heading } from './Heading';

const meta = {
  title: 'Layout/Heading',
  component: Heading,
  args: { children: 'Good morning, Mitchell.', level: 1 },
  argTypes: {
    level: { control: 'inline-radio', options: [1, 2, 3, 4, 5, 6] },
    variant: {
      control: 'select',
      options: [undefined, 'page', 'document', 'title', 'section', 'label'],
    },
  },
} satisfies Meta<typeof Heading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: () => (
    <Stack gap="4">
      <Heading level={1}>Page title · 30px</Heading>
      <Heading level={2}>Document title · 24px</Heading>
      <Heading level={3}>Dialog and card title · 16px</Heading>
      <Heading level={4}>Section heading · 14px</Heading>
      <Heading level={6}>Result group label</Heading>
    </Stack>
  ),
};

export const LookIndependentOfLevel: Story = {
  args: { level: 2, variant: 'section', children: 'An h2 drawn as a section heading' },
};
