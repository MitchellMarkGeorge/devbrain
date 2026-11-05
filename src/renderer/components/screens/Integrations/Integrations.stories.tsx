import type { Meta, StoryObj } from '@storybook/react-vite';
import { Calendar, ChevronDown, CircleCheck, Plus, RotateCcw } from 'lucide-react';
import { Breadcrumb } from '../../ui/Breadcrumb';
import { Button } from '../../ui/Button';
import {
  IntegrationCard,
  IntegrationCardAlert,
  IntegrationSwitchLabel,
} from '../../integrations/IntegrationCard';
import { SourceRow } from '../../integrations/SourceRow';
import { Switch } from '../../ui/Switch';
import { AppFrame, PageHeader } from '../Calendar/AppFrame';

const meta = {
  title: 'Screens/Integrations/Integrations',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function AccountActions({ on }: { on: boolean }) {
  return (
    <>
      <IntegrationSwitchLabel>{on ? 'On' : 'Off'}</IntegrationSwitchLabel>
      <Switch defaultChecked={on} aria-label="Account on" />
      <Button variant="outline" size="sm">
        Disconnect…
      </Button>
    </>
  );
}

function IntegrationsScreen({ linearKeyRejected = false }: { linearKeyRejected?: boolean }) {
  return (
    <AppFrame page="Integrations">
      <PageHeader
        style={{ height: 48, borderBottom: 0 }}
        title={
          <span style={{ font: 'inherit', letterSpacing: 'normal' }}>
            <Breadcrumb items={[{ label: 'Integrations' }]} />
          </span>
        }
      />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '24px 24px 48px' }}>
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
            <div style={{ flex: 1 }}>
              <h1
                style={{
                  margin: 0,
                  color: 'var(--foreground-strong)',
                  font: 'var(--font-weight-semibold) var(--text-3xl) / var(--text-3xl-leading) var(--font-sans)',
                }}
              >
                Integrations
              </h1>
              <p
                style={{
                  margin: '6px 0 0',
                  maxWidth: 553,
                  color: 'var(--muted-foreground)',
                  font: 'var(--font-weight-normal) var(--text-sm) / var(--text-sm-leading) var(--font-sans)',
                }}
              >
                Accounts connected to the SurveyMonkey workspace. Each account can be used for one
                or more sources. Synced items are read-only in DevBrain.
              </p>
            </div>
            <Button variant="outline" icon={Plus} trailingIcon={ChevronDown}>
              Connect Account
            </Button>
          </div>

          <IntegrationCard
            provider="linear"
            name="Linear"
            state={linearKeyRejected ? 'needs-reconnect' : 'connected'}
            meta="Mitchell George · Acme · API key"
            actions={<AccountActions on />}
            alert={
              linearKeyRejected ? (
                <IntegrationCardAlert
                  action={
                    <Button variant="outline" size="sm" icon={RotateCcw}>
                      Update API Key
                    </Button>
                  }
                >
                  Linear rejected the saved API key, so nothing from this account is syncing. Tasks
                  already in DevBrain stay visible.
                </IntegrationCardAlert>
              ) : undefined
            }
          >
            <SourceRow
              icon={CircleCheck}
              title="Tasks"
              description="Issues assigned to you, with their projects"
              status={linearKeyRejected ? 'Paused until you update the key' : 'Synced 3 min ago'}
              control={<Switch defaultChecked aria-label="Sync tasks" />}
            />
          </IntegrationCard>

          <IntegrationCard
            provider="google-calendar"
            name="Google Calendar"
            state="needs-reconnect"
            meta="mitchell@surveymonkey.com · Google sign-in"
            actions={<AccountActions on />}
            alert={
              <IntegrationCardAlert
                action={
                  <Button variant="outline" size="sm" icon={RotateCcw}>
                    Reconnect
                  </Button>
                }
              >
                Google rejected the saved sign-in, so nothing from this account is syncing. Events
                already in DevBrain stay visible.
              </IntegrationCardAlert>
            }
          >
            <SourceRow
              icon={Calendar}
              title="Events"
              description="2 of 5 calendars"
              action={
                <Button variant="outline" size="sm">
                  Choose Calendars
                </Button>
              }
              status="Paused until you reconnect"
              tone="warning"
              control={<Switch defaultChecked aria-label="Sync events" />}
            />
          </IntegrationCard>

          <IntegrationCard
            provider="linear"
            name="Linear"
            state="off"
            meta="Mitchell George · Personal · API key"
            actions={<AccountActions on={false} />}
          >
            <SourceRow
              icon={CircleCheck}
              title="Tasks"
              description="Issues assigned to you, with their projects"
              status="Off · mirrored items are kept"
              disabled
              control={<Switch disabled aria-label="Sync tasks" />}
            />
          </IntegrationCard>

          <IntegrationCard
            provider="github"
            name="GitHub"
            state="coming-later"
            meta="Pull requests and branches for linked tasks"
          />

          <p
            style={{
              margin: 0,
              color: 'var(--subtle-foreground)',
              font: 'var(--font-weight-normal) var(--text-xs) / var(--text-xs-leading) var(--font-sans)',
            }}
          >
            Turning an account off pauses all of its sources; turning it back on picks up where it
            left off. Mirrored items stay as they are until you disconnect.
          </p>
        </div>
      </div>
    </AppFrame>
  );
}

/** Figma "Integrations" (7164:13117) */
export const Default: Story = { render: () => <IntegrationsScreen /> };

/** Figma "Integrations — Linear API key rejected" (7426:43169) */
export const LinearKeyRejected: Story = {
  name: 'Linear API key rejected',
  render: () => <IntegrationsScreen linearKeyRejected />,
};
