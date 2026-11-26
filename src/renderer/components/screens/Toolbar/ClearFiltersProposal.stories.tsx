import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Calendar,
  ChartNoAxesColumnIncreasing,
  CircleDashed,
  Cloud,
  Eraser,
  Folder,
  ListFilter,
  Plus,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../../ui/Button';
import { Tooltip, TooltipProvider } from '../../ui/Tooltip';

/*
 * A proposal, not the app's toolbar: where a visible "clear every filter" control could go. Today
 * the only way is "Clear filters" at the end of the Filter menu. The rows here are look-alikes of
 * the toolbar (`Lists/ListToolbar`), enough to compare the placements; each one works.
 */

const meta = {
  title: 'Screens/Toolbar/Proposal — clear filters',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

interface Filter {
  icon: LucideIcon;
  label: string;
  value: string;
}

const FILTERS: Filter[] = [
  { icon: ChartNoAxesColumnIncreasing, label: 'Priority', value: 'High' },
  { icon: Calendar, label: 'Due', value: 'Overdue' },
  { icon: Cloud, label: 'Source', value: 'Synced' },
  { icon: Folder, label: 'Project', value: 'Auth Overhaul' },
];

const muted: CSSProperties = { color: 'var(--muted-foreground)' };

function Chip({ filter, onRemove }: { filter: Filter; onRemove: () => void }) {
  return (
    <div role="group" aria-label={`${filter.label} filter`} style={{ display: 'inline-flex' }}>
      <Button
        variant="outline"
        icon={filter.icon}
        value={filter.value}
        style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
      >
        {filter.label}
      </Button>
      <Button
        variant="outline"
        size="icon"
        icon={X}
        aria-label={`Remove ${filter.label} filter`}
        style={{
          ...muted,
          width: 28,
          marginLeft: -1,
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
        }}
        onClick={onRemove}
      />
    </div>
  );
}

type Placement = 'text' | 'icon' | 'end' | 'none';

/** The toolbar's row: Status, the chips (or the folded count), "+ Filter", the clear control. */
function Row({
  placement,
  folded = false,
  initial = FILTERS,
}: {
  placement: Placement;
  /** a narrow page: one chip shown, the rest in "Filter +N" */
  folded?: boolean;
  initial?: Filter[];
}) {
  const [filters, setFilters] = useState(initial);
  const clear = () => setFilters([]);
  // with one filter its chip's × already clears everything, so the control starts at two
  const offered = filters.length >= 2;
  const shown = folded ? filters.slice(0, 1) : filters;
  const hidden = filters.length - shown.length;

  let control: ReactNode = null;
  if (offered && (placement === 'text' || placement === 'end')) {
    control = (
      <Button variant="ghost" style={muted} onClick={clear}>
        Clear
      </Button>
    );
  } else if (offered && placement === 'icon') {
    control = (
      <Tooltip content="Clear filters">
        <Button
          variant="ghost"
          size="icon"
          icon={Eraser}
          aria-label="Clear filters"
          style={muted}
          onClick={clear}
        />
      </Tooltip>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: folded ? 620 : undefined }}>
      <Button variant="outline" icon={CircleDashed} value="Open">
        Status
      </Button>
      {shown.map((filter) => (
        <Chip
          key={filter.label}
          filter={filter}
          onRemove={() => setFilters(filters.filter((f) => f !== filter))}
        />
      ))}
      {hidden > 0 ? (
        <Button variant="outline" icon={ListFilter} value={`+${hidden}`} data-pressed="">
          Filter
        </Button>
      ) : (
        <Button variant="ghost" icon={Plus} style={muted}>
          Filter
        </Button>
      )}
      {placement !== 'end' && control}
      {filters.length === 0 && (
        <Button variant="link" onClick={() => setFilters(initial)}>
          Put the filters back
        </Button>
      )}
      <span style={{ flex: 1 }} />
      {placement === 'end' && control}
      <Button variant="outline" icon={SlidersHorizontal} value="Priority">
        Display
      </Button>
    </div>
  );
}

const ROWS: { title: string; note: string; row: ReactNode }[] = [
  {
    title: 'A · “Clear” after “+ Filter”',
    note: 'A quiet word where the filters end. Appears from two filters: with one, its chip’s × does the same.',
    row: <Row placement="text" />,
  },
  {
    title: 'A, folded',
    note: 'A narrow page: “Clear” stays beside “Filter +3”, so it also clears the filters you can’t see.',
    row: <Row placement="text" folded />,
  },
  {
    title: 'B · An icon after “+ Filter”',
    note: 'Takes the least room, named by its tooltip. The cost: an eraser is one more glyph to learn.',
    row: <Row placement="icon" />,
  },
  {
    title: 'C · “Clear” at the end of the row, before Display',
    note: 'Always in the same place, however many chips there are. The cost: far from the chips it clears.',
    row: <Row placement="end" />,
  },
  {
    title: 'Today',
    note: 'For comparison: “Clear filters” is only in the “+ Filter” menu.',
    row: <Row placement="none" />,
  },
];

/** Three places for a visible clear-all control, the first also in a narrow page; every row works. */
export const Placements: Story = {
  render: () => (
    <TooltipProvider>
      <div
        style={{
          display: 'grid',
          gap: 28,
          width: 1240,
          padding: 32,
          background: 'var(--background)',
          color: 'var(--foreground)',
          font: 'var(--font-weight-normal) 13px / var(--text-sm-leading) var(--font-sans)',
        }}
      >
        {ROWS.map(({ title, note, row }) => (
          <div key={title} style={{ display: 'grid', gap: 10 }}>
            <div>
              <span style={{ fontWeight: 'var(--font-weight-medium)' }}>{title}</span>
              <span style={muted}> · {note}</span>
            </div>
            {row}
          </div>
        ))}
      </div>
    </TooltipProvider>
  ),
};

/** The same on the dark theme. */
export const PlacementsDark: Story = {
  ...Placements,
  name: 'Placements — dark',
  globals: { theme: 'dark' },
};
