import { useState, type FocusEvent, type KeyboardEvent } from 'react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { AppSettings, WorkspaceInfo } from '@common/types';
import {
  Button,
  ConfirmDialog,
  Input,
  SettingsGroup,
  SettingsRow,
  SettingsSection,
  SwatchPicker,
  toast,
} from '../../components';
import { ipc, trpc } from '../../ipc';
import { KeyScope } from '../../keyboard';
import { useModals } from '../../modals';
import { SWATCH_HEX, swatchOf } from '../../workspace/colors';
import { useMutationErrorToast } from '../app/mutation-errors';
import { SettingSelect, SettingSwitch, SettingToggle, type Option } from './controls';
import { useSetSetting } from './use-set-setting';

type General = AppSettings['general'];

const THEMES: readonly Option<AppSettings['theme']>[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];
const START_PAGES: readonly Option<General['defaultLandingPage']>[] = [
  { value: 'home', label: 'Home' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'projects', label: 'Projects' },
  { value: 'notes', label: 'Notes' },
  { value: 'calendar', label: 'Calendar' },
];
const TIME_FORMATS: readonly Option<General['timeFormat']>[] = [
  { value: '12', label: '12-hour' },
  { value: '24', label: '24-hour' },
];

/** The open workspace's name and colour, saved with `workspaces.update`. */
function WorkspaceSection({ workspace }: { workspace: WorkspaceInfo }) {
  const showError = useMutationErrorToast('Couldn’t change the workspace');
  const update = useMutation(
    trpc.workspaces.update.mutationOptions({ onError: (e) => showError(e) }),
  );
  // the colour being saved shows at once
  const color = swatchOf(
    update.isPending && update.variables.color ? update.variables.color : workspace.color,
  );
  const [name, setName] = useState(workspace.name);
  const [shownName, setShownName] = useState(workspace.name);
  // a rename from elsewhere (the workspace menu) shows here
  if (workspace.name !== shownName) {
    setShownName(workspace.name);
    setName(workspace.name);
  }

  const saveName = (event: FocusEvent<HTMLInputElement>) => {
    const next = event.currentTarget.value.trim();
    if (next === '' || next === workspace.name) {
      setName(workspace.name);
      return;
    }
    update.mutate({ id: workspace.id, name: next });
  };

  return (
    <SettingsSection title="Workspace">
      <SettingsGroup>
        <SettingsRow
          label="Workspace name"
          description="Shown in the sidebar and the window title."
          control={
            <Input
              aria-label="Workspace name"
              value={name}
              style={{ width: 240 }}
              onChange={(event) => setName(event.currentTarget.value)}
              onBlur={saveName}
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  setName(workspace.name);
                  event.currentTarget.blur();
                }
              }}
            />
          }
        />
        <SettingsRow
          label="Workspace colour"
          description="Colours the workspace tile."
          control={
            <SwatchPicker
              aria-label="Workspace colour"
              value={color}
              onValueChange={(swatch) =>
                update.mutate({ id: workspace.id, color: SWATCH_HEX[swatch] })
              }
            />
          }
        />
      </SettingsGroup>
    </SettingsSection>
  );
}

/** Danger zone: reset the settings, delete the workspace. Both always ask first. */
function DangerZone({ workspace }: { workspace: WorkspaceInfo }) {
  const modals = useModals();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const showError = useMutationErrorToast();

  const deleteWorkspace = () =>
    modals.open((props) => (
      <ConfirmDialog
        {...props}
        title="Delete workspace?"
        description={`Everything in ${workspace.name} is deleted from this Mac: its tasks, projects, notes, calendars and connected accounts.`}
        irreversible
        actionLabel="Delete Workspace"
        confirmText={workspace.name}
        onConfirm={() => {
          ipc.workspaces.delete
            .mutate({ id: workspace.id })
            // main closes the workspace first, and the window follows that to onboarding
            // (routing.md, "Changes that come from no navigation"); this covers the window
            // being busy loading when it did
            .then(() => navigate({ to: '/onboarding', replace: true }))
            .catch((error: unknown) => showError(error, 'Couldn’t delete the workspace'));
        }}
      >
        <KeyScope name="dialog" />
      </ConfirmDialog>
    ));

  const resetSettings = () =>
    modals.open((props) => (
      <ConfirmDialog
        {...props}
        title="Reset settings?"
        description="Every setting goes back to its default. Your workspaces and everything in them are kept."
        actionLabel="Reset Settings"
        onConfirm={() => {
          ipc.settings.reset
            .mutate()
            .then((settings) => {
              queryClient.setQueryData(trpc.settings.get.queryKey(), settings);
              toast({ tone: 'success', title: 'Settings reset' });
            })
            .catch((error: unknown) => showError(error, 'Couldn’t reset the settings'));
        }}
      >
        <KeyScope name="dialog" />
      </ConfirmDialog>
    ));

  return (
    <SettingsSection title="Danger zone">
      <SettingsGroup>
        <SettingsRow
          label="Reset settings"
          description="Puts every setting back to its default. Your data is kept."
          control={<Button onClick={resetSettings}>Reset Settings</Button>}
        />
        <SettingsRow
          label="Delete workspace"
          description="Deletes the workspace, its tasks, notes and projects. This can't be undone."
          control={
            <Button variant="destructive" onClick={deleteWorkspace}>
              Delete Workspace
            </Button>
          }
        />
      </SettingsGroup>
    </SettingsSection>
  );
}

/** Settings › General (Figma `7158:10515`). */
export function GeneralSettings() {
  const settings = useSuspenseQuery(trpc.settings.get.queryOptions()).data;
  const workspace = useSuspenseQuery(trpc.workspaces.current.queryOptions()).data;
  const set = useSetSetting();
  const { general } = settings;
  return (
    <>
      {workspace && <WorkspaceSection workspace={workspace} />}
      <SettingsSection title="General">
        <SettingsGroup>
          <SettingsRow
            label="Appearance"
            description="Pick a theme or follow your system."
            control={
              <SettingToggle
                label="Appearance"
                value={settings.theme}
                options={THEMES}
                onChange={(value) => void set({ path: 'settings.theme', value })}
              />
            }
          />
          <SettingsRow
            label="Start page"
            description="The page DevBrain opens to."
            control={
              <SettingSelect
                label="Start page"
                value={general.defaultLandingPage}
                options={START_PAGES}
                onChange={(value) =>
                  void set({ path: 'settings.general.defaultLandingPage', value })
                }
              />
            }
          />
          <SettingsRow
            label="Reopen last page"
            description="Open where you left off instead of the start page."
            control={
              <SettingSwitch
                label="Reopen last page"
                checked={general.openToLastPage}
                onChange={(value) => void set({ path: 'settings.general.openToLastPage', value })}
              />
            }
          />
          <SettingsRow
            label="Launch at login"
            description="Open DevBrain when you log in to your Mac."
            control={
              <SettingSwitch
                label="Launch at login"
                checked={general.launchOnStartup}
                onChange={(value) => void set({ path: 'settings.general.launchOnStartup', value })}
              />
            }
          />
          <SettingsRow
            label="Time format"
            description="Used for times across DevBrain."
            control={
              <SettingToggle
                label="Time format"
                value={general.timeFormat}
                options={TIME_FORMATS}
                onChange={(value) => void set({ path: 'settings.general.timeFormat', value })}
              />
            }
          />
          <SettingsRow
            label="Vim keys"
            description="Move with h j k l, counts and gg / G. f labels everything you can click."
            control={
              <SettingSwitch
                label="Vim keys"
                checked={general.keyboardMode === 'vim'}
                onChange={(on) =>
                  void set({
                    path: 'settings.general.keyboardMode',
                    value: on ? 'vim' : 'default',
                  })
                }
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
            control={
              <SettingSwitch
                label="Ask before moving to trash"
                checked={general.confirmBeforeArchiving}
                onChange={(value) =>
                  void set({ path: 'settings.general.confirmBeforeArchiving', value })
                }
              />
            }
          />
          <SettingsRow
            label="Ask before deleting permanently"
            description="Confirm before deleting from the trash."
            control={
              <SettingSwitch
                label="Ask before deleting permanently"
                checked={general.confirmBeforeDeleting}
                onChange={(value) =>
                  void set({ path: 'settings.general.confirmBeforeDeleting', value })
                }
              />
            }
          />
        </SettingsGroup>
      </SettingsSection>
      {workspace && <DangerZone workspace={workspace} />}
    </>
  );
}
