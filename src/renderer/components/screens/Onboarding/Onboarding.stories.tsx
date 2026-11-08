import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronLeft, CircleHelp, Folder, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Input } from '../../ui/Input';
import { Logomark } from '../../ui/Logomark';
import { AppShell } from '../../shell/AppShell';
import { SwatchPicker } from '../../ui/SwatchPicker';
import { WorkspaceList, WorkspaceListItem } from '../../onboarding/WorkspaceListItem';
import { WorkspaceTile } from '../../entities/WorkspaceTile';
import { HomeScreen } from '../Home/HomeScreens';

const meta = {
  title: 'Screens/Onboarding/Onboarding',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Window({ children }: { children: React.ReactNode }) {
  return <div style={{ width: 1440, height: 1024 }}>{children}</div>;
}

/** Figma "Welcome (existing workspaces, no paths)" (7285:53770). */
export const Welcome: Story = {
  render: () => (
    <Window>
      <AppShell
        logo={<Logomark size="md" />}
        title="Welcome to DevBrain"
        description="Pick up where you left off, or start a new workspace."
        footer={
          <Button variant="ghost" size="sm" icon={CircleHelp}>
            What’s a workspace?
          </Button>
        }
      >
        <WorkspaceList label="Recent workspaces" style={{ width: '100%' }}>
          <WorkspaceListItem
            name="SurveyMonkey"
            color="green"
            detail="Last opened 2 days ago"
            meta="Created Mar 2026"
            data-highlighted=""
          />
          <WorkspaceListItem
            name="Personal"
            color="blue"
            detail="Last opened Oct 24"
            meta="Created Jan 2026"
          />
          <WorkspaceListItem
            name="Side projects"
            color="indigo"
            detail="Last opened Jun 2"
            meta="Created Apr 2025"
          />
        </WorkspaceList>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={Plus}>Create Workspace</Button>
          <Button icon={Folder}>Open Existing Folder…</Button>
        </div>
      </AppShell>
    </Window>
  ),
};

function CreateWorkspace({ over }: { over?: string }) {
  return (
    <Window>
      <AppShell
        nav={
          <Button variant="ghost" size="sm" icon={ChevronLeft}>
            {over ? `Back to ${over}` : 'Back'}
          </Button>
        }
        logo={<WorkspaceTile letter="Side projects" color="indigo" size={56} />}
        title="Create a workspace"
        description={
          over
            ? `A folder with its own tasks, notes and connected accounts. It opens in place of ${over} once it’s created.`
            : 'A folder with its own tasks, notes and connected accounts.'
        }
      >
        <form style={{ display: 'flex', flexDirection: 'column', gap: 24, width: 360 }}>
          <Field label="Workspace name">
            <Input defaultValue="Side projects" />
          </Field>
          <Field label="Colour">
            <SwatchPicker defaultValue="indigo" aria-label="Colour" />
          </Field>
          <Button size="lg" style={{ width: '100%', marginTop: 16 }}>
            Create Workspace
          </Button>
        </form>
      </AppShell>
    </Window>
  );
}

/**
 * Create workspace (`/workspaces/new`) from Welcome: a page of its own, the tile previewing the
 * name and colour, Back in the title strip.
 */
export const CreateWorkspaceFromWelcome: Story = {
  render: () => <CreateWorkspace />,
};

/**
 * Create workspace from the app's workspace menu ("New workspace…"): the same page, over the
 * workspace still open behind it, which Back returns to.
 */
export const CreateWorkspaceFromApp: Story = {
  render: () => <CreateWorkspace over="SurveyMonkey" />,
};

/** Figma "Home (workspace switcher open)" (7263:46122): the sidebar's workspace menu. */
export const WorkspaceSwitcherOpen: Story = {
  render: () => <HomeScreen workspaceMenuOpen />,
};
