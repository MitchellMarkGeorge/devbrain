import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowLeft, CircleHelp, Folder, Plus } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Input } from '../../ui/Input';
import { Logomark } from '../../ui/Logomark';
import { OnboardingScreen } from '../../ui/OnboardingScreen';
import { SwatchPicker } from '../../ui/SwatchPicker';
import { WorkspaceList, WorkspaceListItem } from '../../ui/WorkspaceListItem';
import { WorkspaceTile } from '../../ui/WorkspaceTile';
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
      <OnboardingScreen
        trafficLights="drawn"
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
      </OnboardingScreen>
    </Window>
  ),
};

/** Figma "Create workspace" (7175:20087): a card with the tile, name and colour, Back and Create. */
export const CreateWorkspace: Story = {
  render: () => (
    <Window>
      <OnboardingScreen trafficLights="drawn">
        <div
          style={{
            width: 480,
            border: '1px solid var(--edge)',
            borderRadius: 'var(--radius-xl)',
            background: 'var(--card)',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <WorkspaceTile letter="S" color="green" size={56} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span
                  style={{
                    color: 'var(--foreground-strong)',
                    font: 'var(--font-weight-medium) var(--text-base) / 22px var(--font-sans)',
                  }}
                >
                  Create a workspace
                </span>
                <span
                  style={{ color: 'var(--muted-foreground)', fontSize: 14, lineHeight: '20px' }}
                >
                  A workspace is a folder that holds your tasks, notes and connected accounts.
                </span>
              </div>
            </div>
            <Field label="Workspace name">
              <Input defaultValue="SurveyMonkey" />
            </Field>
            <Field label="Colour">
              <SwatchPicker defaultValue="green" aria-label="Colour" />
            </Field>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '16px 16px 16px 16px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <Button variant="ghost" icon={ArrowLeft}>
              Back
            </Button>
            <Button>Create Workspace</Button>
          </div>
        </div>
      </OnboardingScreen>
    </Window>
  ),
};

/** Figma "Home (workspace switcher open)" (7263:46122): the sidebar's workspace menu. */
export const WorkspaceSwitcherOpen: Story = {
  render: () => <HomeScreen workspaceMenuOpen />,
};
