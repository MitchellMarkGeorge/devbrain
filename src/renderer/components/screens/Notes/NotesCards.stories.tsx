import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowUpDown, LayoutGrid, List, ListFilter, Plus } from 'lucide-react';
import { Breadcrumb } from '../../ui/Breadcrumb';
import { Button } from '../../ui/Button';
import { NoteCard } from '../../notes/NoteCard';
import { ToggleGroup } from '../../ui/ToggleGroup';
import { AppFrame, PageHeader, Spacer } from '../Calendar/AppFrame';
import { NOTES } from './data';

const meta = {
  title: 'Screens/Notes/NotesCards',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function NotesCardsScreen({ width, height }: { width?: number; height?: number }) {
  const compact = width != null && width < 1080;
  return (
    <AppFrame page="Notes" width={width} height={height}>
      <PageHeader
        style={{ height: 48, borderBottom: 0 }}
        title={
          <span style={{ font: 'inherit', letterSpacing: 'normal' }}>
            <Breadcrumb
              items={[
                { label: 'Notes', href: '#' },
                { label: 'Cards', icon: LayoutGrid },
              ]}
            />
          </span>
        }
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 24px 20px' }}>
        <Button variant="outline" icon={ListFilter} value="All" hideValue={compact}>
          Filter
        </Button>
        <Spacer />
        <Button variant="outline" icon={ArrowUpDown} value="Last edited" hideValue={compact}>
          Sort
        </Button>
        <ToggleGroup
          aria-label="Layout"
          defaultValue="cards"
          style={{ alignSelf: 'center' }}
          items={[
            { value: 'list', icon: List },
            { value: 'cards', icon: LayoutGrid },
          ]}
        />
        <Button variant="outline" icon={Plus}>
          New Note
        </Button>
      </div>
      <div
        style={{
          display: 'grid',
          // three across in wide windows, two below ~800px of content
          gridTemplateColumns:
            'repeat(auto-fill, minmax(max(240px, calc((100% - 32px) / 3)), 1fr))',
          gap: 16,
          padding: '0 24px 24px',
          alignContent: 'start',
          overflow: 'auto',
        }}
      >
        {NOTES.map((note) => (
          <NoteCard key={note.title} note={note} />
        ))}
      </div>
    </AppFrame>
  );
}

/** Figma "Notes (cards)" (7158:12276) */
export const Cards: Story = { render: () => <NotesCardsScreen /> };

/** Figma "Notes cards — two columns below ~800px of content" (7608:58920), a 960×640 window */
export const TwoColumns: Story = {
  name: 'Cards — two columns (960px window)',
  render: () => <NotesCardsScreen width={960} height={640} />,
};
