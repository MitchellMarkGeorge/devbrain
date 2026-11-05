import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from '../../ui/Input';
import { SlashMenu } from './SlashMenu';
import type { SuggestionMenuHandle } from './SuggestionMenu';

const meta = {
  title: 'Editor/SlashMenu',
  component: SlashMenu,
} satisfies Meta<typeof SlashMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** state=default: every command, grouped */
export const Default: Story = {};

/** state=filtered: "/h" */
export const Filtered: Story = { args: { query: 'h' } };

export const NoResults: Story = { args: { query: 'kanban' } };

/** Type in the field as if after "/"; ↑, ↓ and Enter drive the menu while focus stays put */
export const Interactive: Story = {
  render: function Render() {
    const [query, setQuery] = useState('');
    const [picked, setPicked] = useState('');
    const menu = useRef<SuggestionMenuHandle>(null);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 260 }}>
        <Input
          autoFocus
          value={query}
          placeholder="Filter…"
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (menu.current?.onKeyDown(e)) e.preventDefault();
          }}
        />
        <SlashMenu query={query} handleRef={menu} onSelect={(item) => setPicked(item.label)} />
        <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>
          Picked: {picked || '—'}
        </span>
      </div>
    );
  },
};
