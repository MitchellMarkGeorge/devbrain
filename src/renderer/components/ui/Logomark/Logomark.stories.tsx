import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex } from '../../layout/Flex';
import { Lockup, Logomark } from './Logomark';

const meta = {
  title: 'Components/Logomark',
  component: Logomark,
  args: { size: 'md' },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    ground: { control: 'inline-radio', options: [undefined, 'dark', 'light'] },
    pulse: { control: 'boolean' },
  },
} satisfies Meta<typeof Logomark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <Flex gap="8" align="end">
      <Logomark size="sm" />
      <Logomark size="md" />
      <Logomark size="lg" />
    </Flex>
  ),
};

/** The dark mark on a light ground */
export const OnLight: Story = {
  render: () => (
    <div
      style={{ display: 'inline-block', padding: 24, background: 'var(--white)', borderRadius: 14 }}
    >
      <Logomark ground="light" />
    </div>
  ),
};

export const Splash: Story = { args: { size: 'lg', pulse: true } };

export const LockupStory: Story = {
  name: 'Lockup',
  render: () => <Lockup />,
};
