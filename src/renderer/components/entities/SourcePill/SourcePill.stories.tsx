import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex } from '../../layout/Flex';
import { SourcePill } from './SourcePill';

const meta = {
  title: 'Entities/SourcePill',
  component: SourcePill,
  args: { provider: 'linear', children: 'ENG-124' },
  argTypes: {
    provider: { control: 'inline-radio', options: ['linear', 'github'] },
    detached: { control: 'boolean' },
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

/** A detached copy: the mark at half strength and a dashed outline. Its tooltip says "Detached". */
export const Detached: Story = {
  render: () => (
    <Flex gap="2" align="center">
      <SourcePill provider="linear">ENG-124</SourcePill>
      <SourcePill provider="linear" detached>
        ENG-124
      </SourcePill>
      <SourcePill provider="linear" detached>
        Linear
      </SourcePill>
    </Flex>
  ),
};
