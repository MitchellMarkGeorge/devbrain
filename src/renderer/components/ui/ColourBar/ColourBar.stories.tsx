import type { Meta, StoryObj } from '@storybook/react-vite';
import { Flex, Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { SWATCHES } from '../../types';
import { ColourBar } from './ColourBar';

const meta = {
  title: 'UI/ColourBar',
  component: ColourBar,
  args: { color: 'green', height: 12 },
  argTypes: {
    color: { control: 'select', options: SWATCHES },
    height: { control: 'inline-radio', options: [12, 14, 16, 20] },
  },
} satisfies Meta<typeof ColourBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The six calendar colours, as Figma's `ColourBar` draws them */
export const Colours: Story = {
  render: () => (
    <Flex gap="4" align="center">
      {SWATCHES.map((swatch) => (
        <ColourBar key={swatch} color={swatch} />
      ))}
    </Flex>
  ),
};

/** 12px in pills and cards, 16px in the sidebar's icon slot, 20px beside an event row's two lines */
export const Heights: Story = {
  render: () => (
    <Stack gap="3">
      {[12, 16, 20].map((height) => (
        <Flex key={height} gap="2" align="center">
          <ColourBar color="blue" height={height} />
          <Text size="sm">{height}px</Text>
        </Flex>
      ))}
    </Stack>
  ),
};
