import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  BrowserWindow,
  Dialog,
  Menu,
  OpenDialogOptions,
  SaveDialogOptions,
  Shell,
} from 'electron';
import type { Desktop } from '../ipc/desktop';

export interface ElectronDesktopDeps {
  dialog: Pick<Dialog, 'showOpenDialog' | 'showSaveDialog'>;
  shell: Pick<Shell, 'openPath' | 'showItemInFolder'>;
  // Electron's Menu: the app menu set with Menu.setApplicationMenu (runtime/menu.ts)
  menu: { getApplicationMenu(): Pick<Menu, 'popup'> | null };
}

/**
 * The desktop over Electron's shell, dialog and menu, with each dialog modal to `window` (the
 * window the call came from), or free-standing when it is null. The app menu pops up in `window`.
 */
export function createElectronDesktop(
  { dialog, shell, menu }: ElectronDesktopDeps,
  window: BrowserWindow | null,
): Desktop {
  const showOpen = (options: OpenDialogOptions) =>
    window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options);
  const openFolder = async (folderPath: string) => {
    // resolves with an error message, empty on success
    const error = await shell.openPath(folderPath);
    if (error) throw new Error(`The folder could not be opened: ${error}`);
  };
  return {
    openFolder,
    async showItem(filePath) {
      // showItemInFolder reports nothing, and shows nothing for a missing file
      const exists = await fs.access(filePath).then(
        () => true,
        () => false,
      );
      if (exists) shell.showItemInFolder(filePath);
      else await openFolder(path.dirname(filePath));
    },
    async chooseFiles({ title, filters, multiple = false }) {
      const result = await showOpen({
        title,
        filters,
        properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      });
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths;
    },
    async chooseFolder({ title, buttonLabel }) {
      const result = await showOpen({
        title,
        buttonLabel,
        properties: ['openDirectory', 'createDirectory'],
      });
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
    },
    async chooseSaveFile({ title, defaultName, filters }) {
      const options: SaveDialogOptions = { title, defaultPath: defaultName, filters };
      const result = await (window
        ? dialog.showSaveDialog(window, options)
        : dialog.showSaveDialog(options));
      return result.canceled || !result.filePath ? null : result.filePath;
    },
    async showAppMenu({ x, y }) {
      const appMenu = menu.getApplicationMenu();
      if (appMenu === null || window === null) {
        throw new Error('There is no app menu, or no window to show it in');
      }
      await new Promise<void>((resolve) =>
        appMenu.popup({ window, x: Math.round(x), y: Math.round(y), callback: () => resolve() }),
      );
    },
    showWindow() {
      if (window && !window.isDestroyed() && !window.isVisible()) window.show();
    },
  };
}
