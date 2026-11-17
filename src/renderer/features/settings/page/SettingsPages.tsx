import type { ReactNode } from 'react';
import { Heading, Page, PageContent } from '@renderer/components';
import { DataStorageSettings, ImportExportSettings } from '../components/DataStorageSettings';
import {
  PreferencesSettings,
  ResetSettingsSection,
  WorkspaceSettings,
} from '../components/GeneralSettings';
import { CalendarSettingsSection, TasksSettings } from '../components/sections';
import styles from '../components/SettingsPage.module.css';

// The settings' sections, a page each (/app/$workspaceId/settings/<section>). The settings'
// sidebar lists them under Current workspace (General, Integrations, Import & export) and All
// workspaces (Preferences, Tasks, Calendar, Data & storage). Every control writes its one setting
// as it changes.

/** A section's page: the 720px column with its title, what it covers, and its groups. */
function SettingsSectionPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Page title={`Settings · ${title}`}>
      <PageContent layout="document" data-testid="page">
        <Heading level={1}>{title}</Heading>
        <p className={styles.lead}>{description}</p>
        <div className={styles.sections}>{children}</div>
      </PageContent>
    </Page>
  );
}

export function GeneralSettingsPage() {
  return (
    <SettingsSectionPage title="General" description="This workspace’s name and colour.">
      <WorkspaceSettings />
    </SettingsSectionPage>
  );
}

export function ImportExportSettingsPage() {
  return (
    <SettingsSectionPage
      title="Import & export"
      description="Bring tasks and notes into this workspace, or save a copy of them."
    >
      <ImportExportSettings />
    </SettingsSectionPage>
  );
}

export function PreferencesSettingsPage() {
  return (
    <SettingsSectionPage
      title="Preferences"
      description="How DevBrain looks, opens and asks before it acts, in every workspace."
    >
      <PreferencesSettings />
    </SettingsSectionPage>
  );
}

export function TasksSettingsPage() {
  return (
    <SettingsSectionPage title="Tasks" description="Defaults for new tasks and task lists.">
      <TasksSettings />
    </SettingsSectionPage>
  );
}

export function CalendarSettingsPage() {
  return (
    <SettingsSectionPage
      title="Calendar"
      description="Defaults for new events, and how the calendar shows weeks."
    >
      <CalendarSettingsSection />
    </SettingsSectionPage>
  );
}

export function DataStorageSettingsPage() {
  return (
    <SettingsSectionPage
      title="Data & storage"
      description="Where DevBrain keeps your workspaces, and putting its settings back."
    >
      <DataStorageSettings />
      <ResetSettingsSection />
    </SettingsSectionPage>
  );
}
