import type { Meta, StoryObj } from '@storybook/react-vite';
import { SettingsGroup, Switch, ToggleGroup } from '..';

const meta = {
  title: 'Content/SettingsGroup',
  component: SettingsGroup,
  tags: ['autodocs'],
  args: {
    label: 'General settings',
    rows: [
      {
        label: 'Start at login',
        description: 'Open DevBrain when you sign in.',
        control: <Switch aria-label="Start at login" defaultChecked />,
      },
      {
        label: 'Appearance',
        description: 'Choose your preferred theme.',
        control: (
          <ToggleGroup
            label="Appearance"
            items={[
              { value: 'system', label: 'System' },
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
        ),
      },
    ],
  },
} satisfies Meta<typeof SettingsGroup>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
