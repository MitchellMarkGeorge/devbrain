import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';
import {
  Calendar,
  CircleCheck,
  CircleHelp,
  Ellipsis,
  FileText,
  Folder,
  House,
  Search,
  Settings as SettingsIcon,
  SquarePen,
  Trash2,
  Zap,
} from 'lucide-react';
import { Heading } from '../../layout/Heading';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../ui/Select';
import { SettingsGroup, SettingsRow, SettingsSection } from '../../ui/SettingsGroup';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarHeaderActions,
  SidebarItem,
  SidebarWorkspace,
} from '../../ui/Sidebar';
import { StatusIcon } from '../../ui/StatusIcon';
import { SwatchPicker } from '../../ui/SwatchPicker';
import { Switch } from '../../ui/Switch';
import { Tabs, TabsList, TabsTab } from '../../ui/Tabs';
import { ToggleGroup } from '../../ui/ToggleGroup';
import { TooltipProvider } from '../../ui/Tooltip';
import type { Swatch } from '../../ui/types';
import { WorkspaceTile } from '../../ui/WorkspaceTile';
import { DropdownMenuItem } from '../../ui/DropdownMenu';

/*
 * Figma: v2 Screens › Trash & Settings › "Settings (general)" (7158:10515, light 7426:45491) and
 * "Settings (data & storage)" (7158:11416). A 720px column, 212px in from the sidebar, 48px down:
 * the 30px page heading, 24px, the section tabs, 32px, then the groups 32px apart.
 */

const NAV = [
  { label: 'Home', icon: House },
  { label: 'Tasks', icon: CircleCheck },
  { label: 'Projects', icon: Folder },
  { label: 'Notes', icon: FileText },
  { label: 'Calendar', icon: Calendar },
  { label: 'Integrations', icon: Zap },
];

function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarWorkspace name="SurveyMonkey" color="green">
          <DropdownMenuItem icon={<WorkspaceTile letter="S" color="green" />}>
            SurveyMonkey
          </DropdownMenuItem>
        </SidebarWorkspace>
        <SidebarHeaderActions>
          <Button variant="ghost" size="icon-xs" icon={Search} aria-label="Search" />
          <Button variant="ghost" size="icon-xs" icon={SquarePen} aria-label="New task" />
        </SidebarHeaderActions>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          {NAV.map((n) => (
            <SidebarItem key={n.label} icon={n.icon}>
              {n.label}
            </SidebarItem>
          ))}
        </SidebarGroup>
        <SidebarGroup label="Recents">
          <SidebarItem icon={<StatusIcon status="in-progress" />}>
            Implement OAuth2 PKCE flow
          </SidebarItem>
          <SidebarItem icon={<StatusIcon status="in-progress" />}>
            Refactor token refresh logic
          </SidebarItem>
          <SidebarItem bar="green">Mitchell / Jesse 1:1</SidebarItem>
          <SidebarItem icon={Folder}>Auth Overhaul</SidebarItem>
          <SidebarItem icon={FileText}>PKCE design notes</SidebarItem>
        </SidebarGroup>
        <SidebarGroup label="Favorites">
          <SidebarItem icon={Folder}>API Gateway v2</SidebarItem>
          <SidebarItem bar="green">Sprint Planning</SidebarItem>
          <SidebarItem icon={FileText}>Auth provider eval matrix</SidebarItem>
          <SidebarItem icon={Ellipsis}>More</SidebarItem>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarItem icon={Trash2}>Trash</SidebarItem>
        <SidebarItem icon={SettingsIcon} active>
          Settings
        </SidebarItem>
        <SidebarItem icon={CircleHelp}>Help</SidebarItem>
      </SidebarFooter>
    </Sidebar>
  );
}

type Section = 'general' | 'tasks' | 'calendar' | 'data';

/** The window: sidebar, then the settings column with its heading and section tabs. */
function SettingsPage({ section, children }: { section: Section; children: ReactNode }) {
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
        <AppSidebar />
        <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
          <div
            style={{ width: 720, margin: '48px auto', display: 'flex', flexDirection: 'column' }}
          >
            <Heading level={1}>Settings</Heading>
            <Tabs value={section} style={{ marginTop: 24 }}>
              <TabsList aria-label="Settings sections">
                <TabsTab value="general">General</TabsTab>
                <TabsTab value="tasks">Tasks</TabsTab>
                <TabsTab value="calendar">Calendar</TabsTab>
                <TabsTab value="data">Data &amp; storage</TabsTab>
              </TabsList>
            </Tabs>
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
    <SettingsPage section="general">
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

function DataAndStorage() {
  return (
    <SettingsPage section="data">
      <SettingsSection title="Storage">
        <SettingsGroup>
          {/* Figma's SettingsDataFolder: the path as the row's value, then the button */}
          <SettingsRow
            label="Data folder"
            description="Where DevBrain keeps your workspace."
            value="~/DevBrain"
            control={<Button>Show in Finder</Button>}
          />
        </SettingsGroup>
      </SettingsSection>
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

/** Settings (general): workspace, appearance, start page, confirmations and the danger zone */
export const GeneralSettings: Story = { name: 'General', render: () => <General /> };

/** Settings (data & storage): the data folder, then import and export */
export const DataStorage: Story = { name: 'Data & storage', render: () => <DataAndStorage /> };
