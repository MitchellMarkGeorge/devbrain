import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex } from '../../layout/Flex';
import { SourcePill } from './SourcePill';

const meta = {
  title: 'Components/SourcePill',
  component: SourcePill,
  args: { provider: 'linear', children: 'ENG-124', compact: false },
  argTypes: {
    provider: { control: 'inline-radio', options: ['linear', 'github'] },
    compact: { control: 'boolean' },
  },
} satisfies Meta<typeof SourcePill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Providers: Story = {
  render: () => (
    <Flex gap="2" align="center">
      <SourcePill provider="linear">ENG-124</SourcePill>
      <SourcePill provider="github">devbrain#89</SourcePill>
    </Flex>
  ),
};

/** The 20px version on board cards' top line */
export const Compact: Story = {
  render: () => (
    <Flex gap="2" align="center">
      <SourcePill compact provider="linear">
        ENG-124
      </SourcePill>
      <SourcePill compact provider="github">
        devbrain#89
      </SourcePill>
    </Flex>
  ),
};
