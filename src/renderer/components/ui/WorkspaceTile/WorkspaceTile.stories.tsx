import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { SWATCHES, WorkspaceTile } from './WorkspaceTile';

const meta = {
  title: 'Components/WorkspaceTile',
  component: WorkspaceTile,
  args: { letter: 'D', color: 'indigo', size: 20 },
  argTypes: {
    color: { control: 'select', options: [undefined, ...SWATCHES] },
    size: { control: { type: 'range', min: 16, max: 72 } },
  },
} satisfies Meta<typeof WorkspaceTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Colors: Story = {
  render: () => (
    <Flex gap="3">
      {SWATCHES.map((c) => (
        <WorkspaceTile key={c} letter={c} color={c} size={32} />
      ))}
      <WorkspaceTile letter="N" size={32} />
    </Flex>
  ),
};

/** 20px beside the workspace name in the sidebar */
export const InSidebar: Story = {
  render: () => (
    <Flex gap="2" align="center">
      <WorkspaceTile letter="DevBrain" color="green" />
      <Text weight="medium">DevBrain</Text>
    </Flex>
  ),
};

/** 72px on onboarding, with 16px corners */
export const Onboarding: Story = { args: { letter: 'A', color: 'blue', size: 72 } };
