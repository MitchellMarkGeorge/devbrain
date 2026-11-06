import fs from 'node:fs/promises';
import { openDevBrain, type OpenSettingsStore, type WorkspaceOptions } from '@main/core';
import type { SeedSwitches } from '@main/runtime/dev-switches';
import { DEFAULT_SEED, seedDevBrain } from './seed';

export interface DevSeedOptions {
  // the DevBrain folder to seed: devBrainRootPath() in src/main/index.ts
  rootPath: string;
  settingsStore: OpenSettingsStore;
  // the app's own: safeStorage, net.fetch and the repository's migrations
  workspace: WorkspaceOptions;
  switches: SeedSwitches;
}

/**
 * Seeds the DevBrain folder for `--seed`, before the app loads it: creates the folder with one
 * workspace (src/main/dev/seed.ts), and closes it again. A folder that exists is wiped first with
 * `--reset`, and refused without it. Prints its progress and a summary to the console, never the
 * Linear key. Returns whether it seeded; a failure is printed, not thrown.
 */
export async function runDevSeed(options: DevSeedOptions): Promise<boolean> {
  const { rootPath, switches } = options;
  const startedAt = Date.now();
  const name = switches.name ?? process.env.DEV_WORKSPACE_NAME ?? 'Dev';
  const seed = switches.seed ?? DEFAULT_SEED;

  const exists = await fs
    .stat(rootPath)
    .then(() => true)
    .catch(() => false);
  if (exists && !switches.reset) {
    console.error(`A directory already exists at ${rootPath}.`);
    console.error('Run again with --reset to wipe and recreate it.');
    return false;
  }

  console.log(
    `Seeding dev workspace at ${rootPath}${switches.reset ? ' (--reset)' : ''} [seed=${seed}]`,
  );
  try {
    // opening a DevBrain folder never deletes anything
    if (exists) await fs.rm(rootPath, { recursive: true, force: true });
    const devBrain = await openDevBrain({
      path: rootPath,
      settingsStore: options.settingsStore,
      createIfMissing: true,
      workspace: options.workspace,
    });
    try {
      const summary = await seedDevBrain(devBrain, {
        name,
        seed,
        // read here only; the app always takes a key through the connect flow
        linearApiKey: process.env.DEV_LINEAR_API_KEY?.trim() || null,
      });
      const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log('');
      console.log('Done.');
      console.table(summary.counts);
      console.log(`Linear: ${summary.linear}`);
      console.log(`Workspace: ${summary.workspace.name} (${summary.workspace.id})`);
      console.log(`Path: ${rootPath}`);
      console.log(`Elapsed: ${elapsedSeconds}s`);
      return true;
    } finally {
      await devBrain.close();
    }
  } catch (error) {
    console.error('Failed to seed dev workspace:');
    console.error(error);
    return false;
  }
}
