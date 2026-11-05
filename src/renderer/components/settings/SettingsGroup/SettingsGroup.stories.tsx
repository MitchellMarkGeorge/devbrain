import type { Meta, StoryObj } from '@storybook/react-vite';
import { Download } from 'lucide-react';
import { Stack } from '../../layout/Flex';
import { Button } from '../../ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../ui/Select';
import { Switch } from '../../ui/Switch';
import { ToggleGroup } from '../../ui/ToggleGroup';
import { SettingsGroup, SettingsRow, SettingsSection } from './SettingsGroup';

const weekStarts = [
  { value: 'monday', label: 'Monday' },
  { value: 'sunday', label: 'Sunday' },
];

const meta = {
  title: 'Settings/SettingsGroup',
  component: SettingsGroup,
  args: {
    rows: [
      {
        label: 'Show completed tasks',
        description: 'Completed tasks stay in lists until the end of the day.',
        control: <Switch defaultChecked aria-label="Show completed tasks" />,
      },
      {
        label: 'Default view',
        control: (
          <ToggleGroup
            size="sm"
            aria-label="Default view"
            items={[
              { value: 'list', label: 'List' },
              { value: 'board', label: 'Board' },
            ]}
          />
        ),
      },
      { label: 'Task key prefix', description: 'Used for local tasks.', value: 'DB' },
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ width: 640 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SettingsGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A Settings page section: headings above their groups, as in Settings > Calendar */
export const SettingsPage: Story = {
  args: { rows: undefined },
  render: () => (
    <Stack gap="8">
      <SettingsSection title="Calendar">
        <SettingsGroup>
          <SettingsRow
            label="Week starts on"
            description="The first column of the week view and the mini calendar."
            control={
              <Select items={weekStarts} defaultValue="monday">
                <SelectTrigger size="sm" aria-label="Week starts on" />
                <SelectContent>
                  {weekStarts.map((w) => (
                    <SelectItem key={w.value} value={w.value}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
          <SettingsRow
            label="Show declined events"
            control={<Switch aria-label="Show declined events" />}
          />
          <SettingsRow
            label="Connected calendars"
            description="Events sync every 5 minutes."
            value="2 calendars"
            control={<Button size="sm">Manage</Button>}
          />
        </SettingsGroup>
      </SettingsSection>
      <SettingsSection
        title="Data & storage"
        description="Your workspace lives on this Mac. Nothing leaves it unless you export it."
      >
        <SettingsGroup>
          <SettingsRow
            label="Workspace folder"
            value="~/DevBrain/SurveyMonkey"
            control={<Button size="sm">Show in Finder</Button>}
          />
          <SettingsRow
            label="Export workspace"
            description="Tasks, projects and notes as JSON; notes keep their Markdown files."
            control={
              <Button size="sm" icon={Download}>
                Export as JSON
              </Button>
            }
          />
        </SettingsGroup>
      </SettingsSection>
    </Stack>
  ),
};
