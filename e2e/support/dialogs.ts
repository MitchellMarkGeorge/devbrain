import type { ElectronApplication } from '@playwright/test';

// The system's file dialogs can't be driven, so a test answers them in advance: it replaces
// Electron's dialog methods in the main process, as main's own tests hand createElectronDesktop a
// fake `dialog` (src/main/tests/runtime/desktop.test.ts). Main reads `dialog.showSaveDialog` when
// it calls it (src/main/runtime/desktop.ts), so the replacement is what the app's routes get.

/** The next save dialogs answer `filePath`, as if the user had picked it. */
export async function answerSaveDialog(app: ElectronApplication, filePath: string): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: chosen })) as never;
  }, filePath);
}

/** The next open dialogs answer `filePaths`, as if the user had picked them. */
export async function answerOpenDialog(
  app: ElectronApplication,
  filePaths: string[],
): Promise<void> {
  await app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: chosen })) as never;
  }, filePaths);
}
