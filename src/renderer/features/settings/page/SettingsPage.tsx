import { getRouteApi } from '@tanstack/react-router';
import { Heading, PageContent, Tabs, TabsList, TabsTab, Page } from '@renderer/components';
import { DataStorageSettings } from '../components/DataStorageSettings';
import { GeneralSettings } from '../components/GeneralSettings';
import { CalendarSettingsSection, TasksSettings } from '../components/sections';
import type { SettingsTab } from '../api/search';
import styles from '../components/SettingsPage.module.css';

const settingsRoute = getRouteApi('/app/$workspaceId/settings');

const TABS: readonly { value: SettingsTab; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'data_storage', label: 'Data & storage' },
];

/**
 * Settings (`/app/$workspaceId/settings`, Figma `7158:10515`): the 720px column with the section
 * tabs, the section in `?tab`. Every control writes its one setting as it changes.
 */
export function SettingsPage() {
  const tab = settingsRoute.useSearch().tab ?? 'general';
  const navigate = settingsRoute.useNavigate();
  return (
    <Page>
      <PageContent layout="document" data-testid="page" data-tab={tab}>
        <Heading level={1}>Settings</Heading>
        <Tabs
          className={styles.tabs}
          value={tab}
          onValueChange={(value: SettingsTab) =>
            void navigate({
              search: { tab: value === 'general' ? undefined : value },
              replace: true,
            })
          }
        >
          <TabsList aria-label="Settings sections">
            {TABS.map(({ value, label }) => (
              <TabsTab key={value} value={value}>
                {label}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>
        <div className={styles.sections}>
          {tab === 'general' && <GeneralSettings />}
          {tab === 'tasks' && <TasksSettings />}
          {tab === 'calendar' && <CalendarSettingsSection />}
          {tab === 'data_storage' && <DataStorageSettings />}
        </div>
      </PageContent>
    </Page>
  );
}
