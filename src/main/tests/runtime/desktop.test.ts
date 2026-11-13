import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { createElectronDesktop, createExportMemory } from '@main/runtime/desktop';

// The desktop over Electron's shell and dialog, with fakes of both.

function fakes() {
  return {
    dialog: {
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/picked/a.md'] })),
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: '/picked/out.csv' })),
    },
    shell: { openPath: vi.fn(async () => ''), showItemInFolder: vi.fn() },
    menu: { getApplicationMenu: vi.fn() },
    logFilePath: () => '/logs/main.log',
    exports: createExportMemory(),
  };
}

describe('createElectronDesktop', () => {
  it('opens a folder, and rejects with the reason the shell gives', async () => {
    const deps = fakes();
    const desktop = createElectronDesktop(deps as never, null);
    await desktop.openFolder('/brain');
    expect(deps.shell.openPath).toHaveBeenCalledWith('/brain');
    deps.shell.openPath.mockResolvedValueOnce('Failed to open path');
    await expect(desktop.openFolder('/gone')).rejects.toThrow('Failed to open path');
  });

  it('shows a file selected in its folder, or opens the folder when the file is gone', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-desktop-'));
    try {
      const file = path.join(dir, 'nte_1.md');
      await fs.writeFile(file, '');
      const deps = fakes();
      const desktop = createElectronDesktop(deps as never, null);

      await desktop.showItem(file);
      expect(deps.shell.showItemInFolder).toHaveBeenCalledWith(file);
      expect(deps.shell.openPath).not.toHaveBeenCalled();

      await desktop.showItem(path.join(dir, 'gone.md'));
      expect(deps.shell.openPath).toHaveBeenCalledWith(dir);
      expect(deps.shell.showItemInFolder).toHaveBeenCalledTimes(1);

      deps.shell.openPath.mockResolvedValueOnce('Failed to open path');
      await expect(desktop.showItem(path.join(dir, 'gone.md'))).rejects.toThrow(
        'Failed to open path',
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('shows the dialogs modal to the calling window, and returns what was picked', async () => {
    const deps = fakes();
    const window = {} as BrowserWindow;
    const desktop = createElectronDesktop(deps as never, window);
    const filters = [{ name: 'Markdown', extensions: ['md'] }];

    expect(await desktop.chooseFiles({ title: 'Import', filters, multiple: true })).toEqual([
      '/picked/a.md',
    ]);
    expect(deps.dialog.showOpenDialog).toHaveBeenLastCalledWith(window, {
      title: 'Import',
      filters,
      properties: ['openFile', 'multiSelections'],
    });
    expect(await desktop.chooseFolder({ title: 'Export' })).toBe('/picked/a.md');
    expect(deps.dialog.showOpenDialog).toHaveBeenLastCalledWith(
      window,
      expect.objectContaining({ properties: ['openDirectory', 'createDirectory'] }),
    );
    expect(await desktop.chooseSaveFile({ title: 'Export', defaultName: 'x.csv', filters })).toBe(
      '/picked/out.csv',
    );
    expect(deps.dialog.showSaveDialog).toHaveBeenLastCalledWith(window, {
      title: 'Export',
      defaultPath: 'x.csv',
      filters,
    });
  });

  it('returns null for a cancelled dialog', async () => {
    const deps = fakes();
    deps.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    deps.dialog.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' });
    const desktop = createElectronDesktop(deps as never, null);
    expect(await desktop.chooseFiles({ title: 'Import', filters: [] })).toBeNull();
    expect(await desktop.chooseFolder({ title: 'Export' })).toBeNull();
    expect(
      await desktop.chooseSaveFile({ title: 'Export', defaultName: 'x', filters: [] }),
    ).toBeNull();
    // with no window, free-standing
    expect(deps.dialog.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Import' }),
    );
  });

  it('pops up the app menu in the calling window, and resolves once it closes', async () => {
    const deps = fakes();
    const popup = vi.fn((options: { callback: () => void }) => options.callback());
    deps.menu.getApplicationMenu.mockReturnValue({ popup });
    const window = {} as BrowserWindow;

    await createElectronDesktop(deps as never, window).showAppMenu({ x: 16.4, y: 44 });
    expect(popup).toHaveBeenCalledWith({ window, x: 16, y: 44, callback: expect.any(Function) });
  });

  it('rejects when there is no app menu or no window to show it in', async () => {
    const deps = fakes();
    deps.menu.getApplicationMenu.mockReturnValue(null);
    await expect(
      createElectronDesktop(deps as never, {} as BrowserWindow).showAppMenu({ x: 0, y: 0 }),
    ).rejects.toThrow('no app menu');
    deps.menu.getApplicationMenu.mockReturnValue({ popup: vi.fn() });
    await expect(
      createElectronDesktop(deps as never, null).showAppMenu({ x: 0, y: 0 }),
    ).rejects.toThrow('no window');
  });

  it('shows the log file selected in its folder', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-desktop-'));
    try {
      const file = path.join(dir, 'main.log');
      await fs.writeFile(file, '');
      const deps = { ...fakes(), logFilePath: () => file };
      await createElectronDesktop(deps as never, null).showLogFile();
      expect(deps.shell.showItemInFolder).toHaveBeenCalledWith(file);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("remembers each window's last export, and shows it selected", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'devbrain-desktop-'));
    try {
      const first = path.join(dir, 'tasks.csv');
      const second = path.join(dir, 'tasks.json');
      await fs.writeFile(first, '');
      await fs.writeFile(second, '');
      const deps = fakes();
      const one = {} as BrowserWindow;
      const other = {} as BrowserWindow;
      // a desktop is made per call: what one remembers, the window's next one shows
      expect(await createElectronDesktop(deps as never, one).showLastExport()).toBe(false);
      createElectronDesktop(deps as never, one).rememberExport(first);
      createElectronDesktop(deps as never, one).rememberExport(second);
      expect(await createElectronDesktop(deps as never, one).showLastExport()).toBe(true);
      expect(deps.shell.showItemInFolder).toHaveBeenCalledWith(second);
      // another window's exports are its own
      expect(await createElectronDesktop(deps as never, other).showLastExport()).toBe(false);
      // without a window, nothing is remembered
      createElectronDesktop(deps as never, null).rememberExport(first);
      expect(await createElectronDesktop(deps as never, null).showLastExport()).toBe(false);
      expect(deps.shell.showItemInFolder).toHaveBeenCalledOnce();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
