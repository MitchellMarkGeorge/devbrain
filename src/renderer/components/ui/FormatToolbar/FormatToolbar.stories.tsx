import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ColourMenu, editorTextColour, type EditorColour } from '../ColourMenu';
import { TooltipProvider } from '../Tooltip';
import { TurnIntoMenu, BLOCK_TYPES, type BlockType } from '../TurnIntoMenu';
import { FormatToolbar, type FormatMark } from './FormatToolbar';

const meta = {
  title: 'Editor/FormatToolbar',
  component: FormatToolbar,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div style={{ minHeight: 380 }}>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof FormatToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** pressed=bold: a pressed mark has the `accent` fill */
export const PressedBold: Story = { args: { marks: { bold: true }, colour: 'blue' } };

/** pressed=none */
export const Rest: Story = { args: { colour: 'blue' } };

/** Every control live: the marks toggle, the block type and colour open their menus */
export const Interactive: Story = {
  render: function Render() {
    const [marks, setMarks] = useState<Partial<Record<FormatMark, boolean>>>({ bold: true });
    const [block, setBlock] = useState<BlockType>('text');
    const [colour, setColour] = useState<EditorColour>('blue');
    const [highlight, setHighlight] = useState<EditorColour>('default');
    return (
      <FormatToolbar
        blockType={BLOCK_TYPES.find((b) => b.value === block)?.label}
        marks={marks}
        onMarkChange={(mark, pressed) => setMarks((m) => ({ ...m, [mark]: pressed }))}
        colour={colour === 'default' ? undefined : editorTextColour(colour)}
        turnIntoMenu={
          <TurnIntoMenu value={block} onValueChange={setBlock} onTurnIntoTask={() => undefined} />
        }
        colourMenu={
          <ColourMenu
            textColour={colour}
            onTextColourChange={setColour}
            highlight={highlight}
            onHighlightChange={setHighlight}
          />
        }
      />
    );
  },
};
