import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronDown } from 'lucide-react';
import { Button } from '../../ui/Button';
import { DropdownMenu, DropdownMenuTrigger } from '../../ui/DropdownMenu';
import { TurnIntoMenu, type BlockType } from './TurnIntoMenu';

const meta = {
  title: 'Editor/TurnIntoMenu',
  component: TurnIntoMenu,
  decorators: [
    (Story) => (
      <div style={{ minHeight: 380 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TurnIntoMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Open from the block button, Text ticked */
export const Open: Story = {
  args: { value: 'text' },
  render: function Render() {
    const [value, setValue] = useState<BlockType>('text');
    return (
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="sm" trailingIcon={ChevronDown} />}
        >
          Text
        </DropdownMenuTrigger>
        <TurnIntoMenu value={value} onValueChange={setValue} onTurnIntoTask={() => undefined} />
      </DropdownMenu>
    );
  },
};
