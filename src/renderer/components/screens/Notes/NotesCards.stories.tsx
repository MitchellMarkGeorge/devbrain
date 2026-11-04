import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowUpDown, LayoutGrid, List, ListFilter, Plus } from 'lucide-react';
import { Breadcrumb } from '../../ui/Breadcrumb';
import { Button } from '../../ui/Button';
import { EntityPill } from '../../ui/EntityPill';
import { NoteCard } from '../../ui/NoteCard';
import { ToggleGroup } from '../../ui/ToggleGroup';
import { AppFrame, PageHeader, Spacer } from '../Calendar/AppFrame';

const meta = {
  title: 'Screens/Notes/NotesCards',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const NOTES = [
  {
    title: 'PKCE design notes',
    updated: '2h ago',
    preview: 'S256 challenge, 96-char verifier and a 10-minute code TTL, behind a feature flag.',
    link: (
      <EntityPill type="project" color="blue">
        Auth Overhaul
      </EntityPill>
    ),
  },
  {
    title: 'Architecture ADR #4 — PKCE',
    updated: 'Yesterday',
    preview:
      'We adopt PKCE for every first-party client and retire the implicit flow by the end of July.',
    link: (
      <EntityPill type="project" color="blue">
        Auth Overhaul
      </EntityPill>
    ),
  },
  {
    title: 'Auth provider eval matrix',
    updated: 'Jun 19',
    preview: 'Auth0, Cognito and Keycloak compared on cost, SSO support and migration effort.',
  },
  {
    title: 'API Gateway rate limits',
    updated: 'Jun 18',
    preview:
      '600 requests a minute per key, a burst of 100, and a Retry-After header on every 429.',
    link: (
      <EntityPill type="project" color="amber">
        API Gateway v2
      </EntityPill>
    ),
  },
  {
    title: 'Mitchell / Jesse 1:1 notes',
    updated: 'Jun 15',
    preview: 'PKCE rollout timing, the token storage audit and the mobile fallback plan.',
    link: (
      <EntityPill type="event" color="green">
        Mitchell / Jesse 1:1
      </EntityPill>
    ),
  },
  {
    title: 'Sprint 14 retro',
    updated: 'Jun 12',
    preview: 'Fewer carry-overs this sprint; reviews still wait too long for a second approver.',
    link: (
      <EntityPill type="project" color="green">
        AI Action Items
      </EntityPill>
    ),
  },
];

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
        {NOTES.map((n) => (
          <NoteCard key={n.title} {...n} />
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
