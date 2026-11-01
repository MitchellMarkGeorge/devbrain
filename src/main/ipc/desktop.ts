// What a route can do on the desktop besides calling core: show a folder in the file manager and
// ask the user for files with the system dialogs. Main builds one per call over Electron's shell and
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
}

// the desktop when none is configured: every call fails
export const noDesktop: Desktop = {
  openFolder: unavailable,
  chooseFiles: unavailable,
  chooseFolder: unavailable,
  chooseSaveFile: unavailable,
};

async function unavailable(): Promise<never> {
  throw new Error('No desktop is configured');
}
