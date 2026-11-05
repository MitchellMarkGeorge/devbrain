import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex } from '../../layout/Flex';
import { SourcePill } from './SourcePill';

const meta = {
  title: 'Entities/SourcePill',
  component: SourcePill,
  args: { provider: 'linear', children: 'ENG-124' },
  argTypes: {
    provider: { control: 'inline-radio', options: ['linear', 'github'] },
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
