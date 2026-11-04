import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex } from '../../layout/Flex';
import { Badge } from '../Badge';
import { SWATCHES } from '../types';
import { SwatchDot } from './SwatchDot';

const meta = {
  title: 'Glyphs/SwatchDot',
  component: SwatchDot,
  args: { color: 'red' },
  argTypes: { color: { control: 'select', options: SWATCHES } },
} satisfies Meta<typeof SwatchDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The six swatches, as Figma's `SwatchDot` draws them */
export const Colours: Story = {
  render: () => (
    <Flex gap="2" align="center">
      {SWATCHES.map((swatch) => (
        <SwatchDot key={swatch} color={swatch} />
      ))}
    </Flex>
  ),
};

/** The colour pill of the create-project and create-calendar dialogs */
export const InPill: Story = {
  render: () => (
    <Badge interactive icon={<SwatchDot color="indigo" />}>
      Indigo
    </Badge>
  ),
};
