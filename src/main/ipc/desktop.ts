// What a route can do on the desktop besides calling core: show a folder in the file manager, ask
// the user for files with the system dialogs, and pop up the app menu. Main builds one per call over Electron's shell and
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
}

// the desktop when none is configured: every call fails
export const noDesktop: Desktop = {
  openFolder: unavailable,
  chooseFiles: unavailable,
  chooseFolder: unavailable,
  chooseSaveFile: unavailable,
  showAppMenu: unavailable,
};

async function unavailable(): Promise<never> {
  throw new Error('No desktop is configured');
}
