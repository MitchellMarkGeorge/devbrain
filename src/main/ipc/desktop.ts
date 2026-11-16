// What a route can do on the desktop besides calling core: show a folder or file in the file manager, ask
// the user for files with the system dialogs, pop up the app menu, and show the last export. Main builds one per call over Electron's shell and
// dialog (runtime/desktop.ts), modal to the window that called; tests pass a fake. Every path a
// route hands it comes from main's own state or from one of these dialogs, never from the renderer.

export interface FileFilter {
  name: string;
  // without dots: ['csv', 'json']
  extensions: string[];
}

export interface Desktop {
  // opens a folder in Finder, Explorer or the Linux file manager; rejects when it can't
  openFolder(folderPath: string): Promise<void>;
  // shows a file in the file manager, selected in its folder; when the file is gone, opens the
  // folder instead, and rejects when that can't be opened either
  showItem(filePath: string): Promise<void>;
  // the files picked, or null when the dialog was cancelled
  chooseFiles(options: {
    title: string;
    filters: FileFilter[];
    multiple?: boolean;
  }): Promise<string[] | null>;
  // the folder picked, or null when cancelled
  chooseFolder(options: { title: string; buttonLabel?: string }): Promise<string | null>;
  // the path to save to, or null when cancelled; the dialog asks before replacing a file
  chooseSaveFile(options: {
    title: string;
    defaultName: string;
    filters: FileFilter[];
  }): Promise<string | null>;
  // Pops up the app menu (the menu bar's menus) at a point in the window, in CSS pixels from its
  // top left, for a window that shows no menu bar: on Windows the page draws the title bar, and
  // its menu button calls this. Resolves once the menu closes; rejects when there is no menu or
  // window to show it in.
  showAppMenu(at: { x: number; y: number }): Promise<void>;
  // Remembers the file or folder an export just wrote, as this window's last export: the one
  // showLastExport reveals. Called by main with the path the export returned, never one the
  // renderer gave. Without a window, remembers nothing.
  rememberExport(exportPath: string): void;
  // Shows this window's last export selected in the file manager (its folder when it is gone).
  // Resolves false when this window has exported nothing since main started.
  showLastExport(): Promise<boolean>;
  // shows the app's log file selected in the file manager, as the menu's Show Log File does: the
  // way to find out why DevBrain could not load its data folder
  showLogFile(): Promise<void>;
}

// the desktop when none is configured: every call fails
export const noDesktop: Desktop = {
  openFolder: unavailable,
  showItem: unavailable,
  chooseFiles: unavailable,
  chooseFolder: unavailable,
  chooseSaveFile: unavailable,
  showAppMenu: unavailable,
  rememberExport: () => {},
  showLastExport: unavailable,
  showLogFile: unavailable,
};

async function unavailable(): Promise<never> {
  throw new Error('No desktop is configured');
}
