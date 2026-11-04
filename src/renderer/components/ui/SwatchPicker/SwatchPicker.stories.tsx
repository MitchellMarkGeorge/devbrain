import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Stack } from '../../layout/Flex';
import { Text } from '../../layout/Text';
import { SWATCHES, SwatchPicker, type Swatch } from './SwatchPicker';

const meta = {
  title: 'Components/SwatchPicker',
  component: SwatchPicker,
  args: { defaultValue: 'green' },
  argTypes: {
    defaultValue: { control: 'select', options: SWATCHES },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof SwatchPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Controlled: Story = {
  render: () => {
    const [colour, setColour] = useState<Swatch>('indigo');
    return (
      <Stack gap="3">
        <SwatchPicker value={colour} onValueChange={setColour} />
        <Text size="xs" tone="muted">
          Project colour: {colour}
        </Text>
      </Stack>
    );
  },
};
