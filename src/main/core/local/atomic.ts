import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { writeFileSync as atomicallyWriteFileSync } from 'atomically';
import { isErrnoException } from './utils';

// A temp file next to `filePath`, so linking it to the target stays on one file system. The random
// part keeps two writers from picking the same one.
function tempPathFor(filePath: string): string {
  const suffix = `${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  return path.join(path.dirname(filePath), `.${path.basename(filePath)}.${suffix}`);
}

// writes `data` to a new file and flushes it to disk before returning
function writeAndSync(filePath: string, data: string, flag: 'wx'): void {
  const fd = fs.openSync(filePath, flag);
  try {
    fs.writeFileSync(fd, data, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

// Flushes a rename or link in `dirPath` to disk. Best effort: Windows cannot open a directory for
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
 * Creates `filePath` holding `data`, all or nothing, and throws EEXIST when it is already there:
 * never overwrites. The temp file is hard-linked into place, which fails on an existing target. On a
 * file system without hard links it falls back to an exclusive create, which still never
 * overwrites but can leave a partial file on a crash.
 */
export function createFileAtomicSync(filePath: string, data: string): void {
  const tempPath = tempPathFor(filePath);
  try {
    writeAndSync(tempPath, data, 'wx');
    fs.linkSync(tempPath, filePath);
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    if (isErrnoException(error) && ['EPERM', 'ENOTSUP', 'ENOSYS'].includes(error.code ?? '')) {
      writeAndSync(filePath, data, 'wx');
      return;
    }
    throw error;
  }
  fs.rmSync(tempPath, { force: true });
  syncDirectory(path.dirname(filePath));
}
