import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { createElectronDesktop } from '@main/runtime/desktop';

// The desktop over Electron's shell and dialog, with fakes of both.

function fakes() {
  return {
    dialog: {
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/picked/a.md'] })),
      showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: '/picked/out.csv' })),
    },
    shell: { openPath: vi.fn(async () => '') },
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
});
