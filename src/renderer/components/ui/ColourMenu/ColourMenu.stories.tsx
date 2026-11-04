import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Baseline } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger } from '../DropdownMenu';
import { IconButton } from '../IconButton';
import { TooltipProvider } from '../Tooltip';
import { ColourMenu, ColourSwatch, EDITOR_COLOURS, type EditorColour } from './ColourMenu';

const meta = {
  title: 'Editor/ColourMenu',
  component: ColourMenu,
  decorators: [
    (Story) => (
      <TooltipProvider>
        <div style={{ minHeight: 200 }}>
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof ColourMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two rows of ten: text colours, then highlights; the current ones ringed */
export const Open: Story = {
  render: function Render() {
    const [text, setText] = useState<EditorColour>('default');
    const [highlight, setHighlight] = useState<EditorColour>('default');
    return (
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger render={<IconButton icon={Baseline} label="Colour" />} />
        <ColourMenu
          textColour={text}
          onTextColourChange={setText}
          highlight={highlight}
          onHighlightChange={setHighlight}
        />
      </DropdownMenu>
    );
  },
};

/** ColourSwatch: kind=text and kind=highlight, default and current */
export const Swatches: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {EDITOR_COLOURS.map((c) => (
          <ColourSwatch key={c} kind="text" colour={c} current={c === 'default'} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {EDITOR_COLOURS.map((c) => (
          <ColourSwatch key={c} kind="highlight" colour={c} current={c === 'blue'} />
        ))}
      </div>
    </div>
  ),
};
