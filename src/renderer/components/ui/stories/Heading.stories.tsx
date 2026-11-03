import type { Meta, StoryObj } from '@storybook/react-vite';
import { Heading, Stack } from '..';

const meta = {
  title: 'Foundations/Heading',
  component: Heading,
  tags: ['autodocs'],
  args: { variant: 'page', as: 'h1', children: 'Good morning, Mitchell.' },
} satisfies Meta<typeof Heading>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Hierarchy: Story = {
  render: () => (
    <Stack>
      <Heading as="h1" variant="page">
        Page title
      </Heading>
      <Heading variant="document">Document title</Heading>
      <Heading as="h3" variant="card">
        Card title
      </Heading>
      <Heading as="h4" variant="section">
        Section heading
      </Heading>
    </Stack>
  ),
};
