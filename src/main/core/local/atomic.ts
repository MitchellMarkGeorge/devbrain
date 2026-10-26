import fs from 'node:fs';
import path from 'node:path';
import { writeFileSync as atomicallyWriteFileSync } from 'atomically';
import { FileExistsError } from '../shared/errors';

// Flushes a rename in `dirPath` to disk. Best effort: Windows cannot open a directory for
// this and some file systems refuse it, and the rename has happened either way.
function syncDirectory(dirPath: string): void {
  if (process.platform === 'win32') return;
  let fd: number | undefined;
  try {
    fd = fs.openSync(dirPath, 'r');
    fs.fsyncSync(fd);
  } catch {
    // the file is in place; only its durability across a power loss is less certain
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/**
 * Replaces `filePath` with `data` so that a reader, or the next start after a crash, sees either
 * the old content or the new, never a partial file. atomically writes a temp file in the same
 * directory, flushes it and renames it over the target, retrying errors that pass, such as a file
 * held open by antivirus on Windows, for up to a second. Then the directory is flushed, so the
 * rename survives a power loss too. On failure the target is left as it was.
 */
export function writeFileAtomicSync(filePath: string, data: string): void {
  atomicallyWriteFileSync(filePath, data);
  syncDirectory(path.dirname(filePath));
}

/**
 * Creates `filePath` holding `data`, whole or not at all (see writeFileAtomicSync), and throws
 * FileExistsError when a file is already there. The check comes before the write, so a file another
 * process creates in between can still be replaced; DevBrain only creates files this way when
 * setting up a new folder, where that cannot reasonably happen.
 */
export function createFileAtomicSync(filePath: string, data: string): void {
  if (fs.existsSync(filePath)) throw new FileExistsError(filePath);
  writeFileAtomicSync(filePath, data);
}
