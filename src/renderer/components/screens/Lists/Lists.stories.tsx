import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowUpDown, LayoutGrid, List, ListFilter, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { EntityPill } from '../../ui/EntityPill';
import { NoteRow } from '../../ui/NoteRow';
import { ProjectRow, type ProjectRowProject } from '../../ui/ProjectRow';
import { ToggleGroup, ToggleGroupItem } from '../../ui/ToggleGroup';
import { AppFrame } from '../Tasks/frame';

const meta = {
  title: 'Screens/Lists',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function ViewToggle() {
  return (
    <ToggleGroup defaultValue="list" aria-label="View">
      <ToggleGroupItem value="list" icon={List} aria-label="List" />
      <ToggleGroupItem value="cards" icon={LayoutGrid} aria-label="Cards" />
    </ToggleGroup>
  );
}

/** Figma "Notes (list)" (7158:11693): the second row pointed at. */
export const NotesList: Story = {
  name: 'Notes (list)',
  render: () => (
    <AppFrame
      active="Notes"
      breadcrumb={['Notes', { label: 'List', icon: List }]}
      toolbarStart={
        <Button icon={ListFilter} value="All">
          Filter
        </Button>
      }
      toolbarEnd={
        <>
          <Button icon={ArrowUpDown} value="Last edited">
            Sort
          </Button>
          <ViewToggle />
          <Button icon={Plus}>New Note</Button>
        </>
      }
    >
      <div role="grid" aria-label="Notes">
        <NoteRow
          title="PKCE design notes"
          excerpt="S256 challenge, 96-char verifier and a 10-minute code TTL, behind a feature flag for the first two weeks."
          edited="2h ago"
          onSelect={() => {}}
        >
          <EntityPill type="task">Write PKCE migration guide</EntityPill>
          <EntityPill type="project" color="blue">
            Auth Overhaul
          </EntityPill>
        </NoteRow>
        <NoteRow
          title="Architecture ADR #4 — PKCE"
          excerpt="We adopt PKCE for every first-party client and retire the implicit flow by the end of July."
          edited="Yesterday"
          state="hover"
          onSelect={() => {}}
        >
          <EntityPill type="project" color="blue">
            Auth Overhaul
          </EntityPill>
        </NoteRow>
        <NoteRow
          title="Auth provider eval matrix"
          excerpt="Auth0, Cognito and Keycloak compared on cost, SSO support and migration effort."
          edited="Jun 19"
          onSelect={() => {}}
        />
        <NoteRow
          title="API Gateway rate limits"
          excerpt="600 requests a minute per key, a burst of 100, and a Retry-After header on every 429."
          edited="Jun 18"
          onSelect={() => {}}
        >
          <EntityPill type="project" color="amber">
            API Gateway v2
          </EntityPill>
        </NoteRow>
        <NoteRow
          title="Mitchell / Jesse 1:1 notes"
          excerpt="PKCE rollout timing, the token storage audit and the mobile fallback plan."
          edited="Jun 15"
          onSelect={() => {}}
        >
          <EntityPill type="event" color="green">
            Mitchell / Jesse 1:1
          </EntityPill>
        </NoteRow>
        <NoteRow
          title="Sprint 14 retro"
          excerpt="Fewer carry-overs this sprint; reviews still wait too long for a second approver."
          edited="Jun 12"
          onSelect={() => {}}
        >
          <EntityPill type="project" color="green">
            AI Action Items
          </EntityPill>
        </NoteRow>
      </div>
    </AppFrame>
  ),
};

const ACTIVE = { status: 'active' as const };
const ON_HOLD = { status: 'on-hold' as const };
const NOT_STARTED = { status: 'not-started' as const };

const PROJECTS: ProjectRowProject[] = [
  { name: 'AI Action Items', color: 'green', ...ACTIVE, progress: 50, due: 'Due Jun 26' },
  { name: 'API Gateway v2', color: 'amber', ...ACTIVE, progress: 40, due: 'Due Jun 30' },
  { name: 'Auth Overhaul', color: 'blue', ...ACTIVE, progress: 25, due: 'Due Jul 1' },
  { name: 'ML Platform', color: 'pink', ...ON_HOLD, progress: 60, due: 'Due Jul 10' },
  {
    name: 'User Interface Revamp',
    color: 'indigo',
    ...NOT_STARTED,
    progress: 0,
    due: 'Due Jul 15',
  },
];

/** Figma "Projects (list)" (7158:15157): the second row pointed at. */
export const ProjectsList: Story = {
  name: 'Projects (list)',
  render: () => (
    <AppFrame
      active="Projects"
      breadcrumb={['Projects', { label: 'List', icon: List }]}
      toolbarStart={
        <Button icon={ListFilter} value="Active">
          Filter
        </Button>
      }
      toolbarEnd={
        <>
          <Button icon={ArrowUpDown} value="Due date">
            Sort
          </Button>
          <ViewToggle />
          <Button icon={Plus}>New Project</Button>
        </>
      }
    >
      <div role="grid" aria-label="Projects">
        {PROJECTS.map((project, i) => (
          <ProjectRow
            key={project.name}
            project={project}
            state={i === 1 ? 'hover' : undefined}
            onSelect={() => {}}
          />
        ))}
      </div>
    </AppFrame>
  ),
};
