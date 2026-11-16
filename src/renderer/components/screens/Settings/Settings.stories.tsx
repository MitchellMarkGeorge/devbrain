import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  Calendar,
  CircleCheck,
  Database,
  FolderInput,
  PanelTop,
  SlidersHorizontal,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Heading } from '../../layout/Heading';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../ui/Select';
import { SettingsGroup, SettingsRow, SettingsSection } from '../../settings/SettingsGroup';
import { Sidebar, SidebarContent, SidebarGroup, SidebarItem } from '../../shell/Sidebar';
import { SwatchPicker } from '../../ui/SwatchPicker';
import { Switch } from '../../ui/Switch';
import { ToggleGroup } from '../../ui/ToggleGroup';
import { TooltipProvider } from '../../ui/Tooltip';
import type { Swatch } from '../../types';

/*
 * Figma: v2 Screens › Trash & Settings › "Settings (general)" (7158:10515, light 7426:45491) and
 * "Settings (data & storage)" (7158:11416), since split into a page per section. The settings'
 * sidebar takes the app's place: Back to app, then the sections the open workspace owns (Current
 * workspace) apart from those every workspace shares (All workspaces). A section's page is a 720px
 * column, 48px down: its 30px heading, what it covers 6px under it, 32px, then the groups 32px
 * apart.
 */

type Section =
  | 'General'
  | 'Integrations'
  | 'Import & export'
  | 'Preferences'
  | 'Tasks'
  | 'Calendar'
  | 'Data & storage';

const CURRENT_WORKSPACE: { label: Section; icon: LucideIcon }[] = [
  { label: 'General', icon: PanelTop },
  { label: 'Integrations', icon: Zap },
  { label: 'Import & export', icon: FolderInput },
];
const ALL_WORKSPACES: { label: Section; icon: LucideIcon }[] = [
  { label: 'Preferences', icon: SlidersHorizontal },
  { label: 'Tasks', icon: CircleCheck },
  { label: 'Calendar', icon: Calendar },
  { label: 'Data & storage', icon: Database },
];

function SettingsSidebar({ active }: { active: Section }) {
  const item = ({ label, icon }: { label: Section; icon: LucideIcon }) => (
    <SidebarItem key={label} icon={icon} active={label === active}>
      {label}
    </SidebarItem>
  );
  return (
    <Sidebar aria-label="Settings" header={<SidebarItem icon={ArrowLeft}>Back to app</SidebarItem>}>
      <SidebarContent>
        <SidebarGroup label="Current workspace" collapsible={false}>
          {CURRENT_WORKSPACE.map(item)}
        </SidebarGroup>
        <SidebarGroup label="All workspaces" collapsible={false}>
          {ALL_WORKSPACES.map(item)}
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

/** The window: the settings' sidebar, then the section's column with its heading and lead. */
function SettingsPage({
  section,
  description,
  children,
}: {
  section: Section;
  description: string;
  children: ReactNode;
}) {
  return (
    <TooltipProvider>
      <div
        style={{
          display: 'flex',
          height: 1024,
          width: 1440,
          background: 'var(--background)',
          overflow: 'hidden',
        }}
      >
        <SettingsSidebar active={section} />
        <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
          <div
            style={{ width: 720, margin: '48px auto', display: 'flex', flexDirection: 'column' }}
          >
            <Heading level={1}>{section}</Heading>
            <p
              style={{
                margin: '6px 0 0',
                color: 'var(--muted-foreground)',
                font: 'var(--font-weight-normal) var(--text-sm) / var(--text-sm-leading) var(--font-sans)',
              }}
            >
              {description}
            </p>
            <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 32 }}>
              {children}
            </div>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}

const START_PAGES = [
  { value: 'home', label: 'Home' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'calendar', label: 'Calendar' },
];

function General() {
  const [colour, setColour] = useState<Swatch>('green');
  return (
    <SettingsPage section="General" description="This workspace’s name and colour.">
      <SettingsSection title="Workspace">
        <SettingsGroup>
          <SettingsRow
            label="Workspace name"
            description="Shown in the sidebar and the window title."
            control={
              <Input
                defaultValue="SurveyMonkey"
                aria-label="Workspace name"
                style={{ width: 240 }}
              />
            }
          />
          <SettingsRow
            label="Workspace colour"
            description="Colours the workspace tile."
            control={
              <SwatchPicker
                value={colour}
                onValueChange={setColour}
                aria-label="Workspace colour"
              />
            }
          />
        </SettingsGroup>
      </SettingsSection>
      <SettingsSection title="Danger zone">
        <SettingsGroup>
          <SettingsRow
            label="Delete workspace"
            description="Deletes the workspace, its tasks, notes and projects. This can't be undone."
            control={<Button variant="destructive">Delete Workspace</Button>}
          />
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  );
}

function Preferences() {
  return (
    <SettingsPage
      section="Preferences"
      description="How DevBrain looks, opens and asks before it acts, in every workspace."
    >
      <SettingsSection title="General">
        <SettingsGroup>
          <SettingsRow
            label="Appearance"
            description="Pick a theme or follow your system."
            control={
              <ToggleGroup
                aria-label="Appearance"
                items={[
                  { value: 'dark', label: 'Dark' },
                  { value: 'light', label: 'Light' },
                  { value: 'system', label: 'System' },
                ]}
              />
            }
          />
          <SettingsRow
            label="Start page"
            description="The page DevBrain opens to."
            control={
              <Select items={START_PAGES} defaultValue="home">
                <SelectTrigger aria-label="Start page" />
                <SelectContent>
                  {START_PAGES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
          <SettingsRow
            label="Reopen last page"
            description="Open where you left off instead of the start page."
            control={<Switch defaultChecked aria-label="Reopen last page" />}
          />
          <SettingsRow
            label="Launch at login"
            description="Open DevBrain when you log in to your Mac."
            control={<Switch defaultChecked aria-label="Launch at login" />}
          />
          <SettingsRow
            label="Time format"
            description="Used for times across DevBrain."
            control={
              <ToggleGroup
                aria-label="Time format"
                items={[
                  { value: '12', label: '12-hour' },
                  { value: '24', label: '24-hour' },
                ]}
              />
            }
          />
        </SettingsGroup>
      </SettingsSection>
      <SettingsSection title="Confirmations">
        <SettingsGroup>
          <SettingsRow
            label="Ask before moving to trash"
            description="Confirm before a task, project or note goes to the trash."
            control={<Switch defaultChecked aria-label="Ask before moving to trash" />}
          />
          <SettingsRow
            label="Ask before deleting permanently"
            description="Confirm before deleting from the trash."
            control={<Switch defaultChecked aria-label="Ask before deleting permanently" />}
          />
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  );
}

function DataAndStorage() {
  return (
    <SettingsPage
      section="Data & storage"
      description="Where DevBrain keeps your workspaces, and putting its settings back."
    >
      <SettingsSection title="Storage">
        <SettingsGroup>
          {/* Figma's SettingsDataFolder: the path as the row's value, then the button */}
          <SettingsRow
            label="Data folder"
            description="Where DevBrain keeps your workspaces."
            value="~/DevBrain"
            control={<Button>Show in Finder</Button>}
          />
        </SettingsGroup>
      </SettingsSection>
      <SettingsSection title="Reset">
        <SettingsGroup>
          <SettingsRow
            label="Reset settings"
            description="Puts every setting back to its default, in every workspace. Your data is kept."
            control={<Button>Reset Settings</Button>}
          />
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  );
}

function ImportExport() {
  return (
    <SettingsPage
      section="Import & export"
      description="Bring tasks and notes into this workspace, or save a copy of them."
    >
      <SettingsSection title="Import & export">
        <SettingsGroup>
          <SettingsRow
            label="Import tasks"
            description="From a CSV or JSON file."
            control={<Button>Choose File</Button>}
          />
          <SettingsRow
            label="Import notes"
            description="From Markdown files."
            control={<Button>Choose File</Button>}
          />
          <SettingsRow
            label="Export tasks"
            description="Download as CSV or JSON."
            control={<Button>Export</Button>}
          />
          <SettingsRow
            label="Export notes"
            description="Download as Markdown files."
            control={<Button>Export</Button>}
          />
        </SettingsGroup>
      </SettingsSection>
    </SettingsPage>
  );
}

const meta = {
  title: 'Screens/Settings/Settings',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** General, the open workspace's: its name and colour, and the danger zone */
export const GeneralSettings: Story = { name: 'General', render: () => <General /> };

/** Preferences, every workspace's: appearance, start page, launching, time format, confirmations */
export const PreferencesSettings: Story = { name: 'Preferences', render: () => <Preferences /> };

/** Import & export, the open workspace's: tasks and notes in and out */
export const ImportExportSettings: Story = {
  name: 'Import & export',
  render: () => <ImportExport />,
};

/** Data & storage, every workspace's: the data folder, then Reset settings */
export const DataStorage: Story = { name: 'Data & storage', render: () => <DataAndStorage /> };
