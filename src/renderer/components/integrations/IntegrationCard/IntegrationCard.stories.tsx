import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleCheck, RotateCcw } from 'lucide-react';
import { Button } from '../../ui/Button';
import { SourceRow } from '../SourceRow';
import { Switch } from '../../ui/Switch';
import { IntegrationCard, IntegrationCardAlert, IntegrationSwitchLabel } from './IntegrationCard';

const actions = (on: boolean) => (
  <>
    <IntegrationSwitchLabel>{on ? 'On' : 'Off'}</IntegrationSwitchLabel>
    <Switch defaultChecked={on} aria-label="Account on" />
    <Button variant="outline" size="sm">
      Disconnect…
    </Button>
  </>
);

const tasks = (disabled = false) => (
  <SourceRow
    icon={CircleCheck}
    title="Tasks"
    description="Issues assigned to you, with their projects"
    status={disabled ? 'Off · mirrored items are kept' : 'Synced 3 min ago'}
    disabled={disabled}
    control={<Switch defaultChecked={!disabled} disabled={disabled} aria-label="Sync tasks" />}
  />
);

const meta = {
  title: 'Integrations/IntegrationCard',
  component: IntegrationCard,
  args: {
    provider: 'linear',
    name: 'Linear',
    state: 'connected',
    meta: 'Mitchell George · Acme · API key',
    actions: actions(true),
    children: tasks(),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 720 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IntegrationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

/** The saved key was rejected: the amber alert and its fix */
export const NeedsReconnect: Story = {
  args: {
    state: 'needs-reconnect',
    alert: (
      <IntegrationCardAlert
        action={
          <Button variant="outline" size="sm" icon={RotateCcw}>
            Update API Key
          </Button>
        }
      >
        Linear rejected the saved API key, so nothing from this account is syncing. Tasks already in
        DevBrain stay visible.
      </IntegrationCardAlert>
    ),
  },
};

/** Turned off: the tile and the sources fade */
export const Off: Story = {
  args: {
    state: 'off',
    meta: 'Mitchell George · Personal · API key',
    actions: actions(false),
    children: tasks(true),
  },
};

/** A provider coming later: dashed, no switch, no sources */
export const ComingLater: Story = {
  args: {
    provider: 'github',
    name: 'GitHub',
    state: 'coming-later',
    meta: 'Pull requests and branches for linked tasks',
    actions: undefined,
    children: undefined,
  },
};
