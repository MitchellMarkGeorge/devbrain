import type { BrowserWindow, Dialog, OpenDialogOptions, SaveDialogOptions, Shell } from 'electron';
import type { Desktop } from '../ipc/desktop';

export interface ElectronDesktopDeps {
  dialog: Pick<Dialog, 'showOpenDialog' | 'showSaveDialog'>;
  shell: Pick<Shell, 'openPath'>;
}

/**
 * The desktop over Electron's shell and dialog, with each dialog modal to `window` (the window the
 * call came from), or free-standing when it is null.
 */
export function createElectronDesktop(
  { dialog, shell }: ElectronDesktopDeps,
  window: BrowserWindow | null,
): Desktop {
  const showOpen = (options: OpenDialogOptions) =>
    window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options);
  return {
    async openFolder(folderPath) {
      // resolves with an error message, empty on success
      const error = await shell.openPath(folderPath);
      if (error) throw new Error(`The folder could not be opened: ${error}`);
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
  };
}
