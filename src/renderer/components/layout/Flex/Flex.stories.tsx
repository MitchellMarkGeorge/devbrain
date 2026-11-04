import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex, Stack } from './Flex';

const Tile = ({ label }: { label: string }) => (
  <div
    style={{
      padding: '8px 12px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--card)',
      boxShadow: '0 0 0 1px var(--edge)',
    }}
  >
    {label}
  </div>
);

const meta = {
  title: 'Layout/Flex',
  component: Flex,
  args: { gap: '2' },
  argTypes: {
    gap: { control: 'select', options: ['0', '0.5', '1', '1.5', '2', '3', '4', '6', '8', '12', '16'] },
    direction: { control: 'inline-radio', options: ['row', 'column', 'row-reverse', 'column-reverse'] },
    align: { control: 'inline-radio', options: ['start', 'center', 'end', 'baseline', 'stretch'] },
    justify: { control: 'inline-radio', options: ['start', 'center', 'end', 'between'] },
    wrap: { control: 'inline-radio', options: ['wrap', 'nowrap'] },
  },
  render: (args) => (
    <Flex {...args}>
      <Tile label="One" />
      <Tile label="Two" />
      <Tile label="Three" />
    </Flex>
  ),
} satisfies Meta<typeof Flex>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Row: Story = {};

export const SpaceBetween: Story = {
  args: { justify: 'between', align: 'center' },
  render: (args) => (
    <Flex {...args} style={{ width: 480 }}>
      <Tile label="Title" />
      <Tile label="Actions" />
    </Flex>
  ),
};

export const StackColumn: Story = {
  render: () => (
    <Stack gap="4">
      <Tile label="One" />
      <Tile label="Two" />
      <Tile label="Three" />
    </Stack>
  ),
};

export const AsList: Story = {
  render: () => (
    <Flex gap="3" render={<ul style={{ listStyle: 'none', padding: 0 }} />}>
      <li>
        <Tile label="Rendered" />
      </li>
      <li>
        <Tile label="as a ul" />
      </li>
    </Flex>
  ),
};
