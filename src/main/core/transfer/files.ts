import fs from 'node:fs/promises';
import path from 'node:path';
import { ImportFileError } from '../shared/errors';

// Reading files the user picked to import, and naming the files an export writes. Imported files
// are untrusted: they are capped before they are read, must be UTF-8 text, and nothing in them is
// ever taken as a path (docs/import-export.md).

/**
 * The text of a file chosen for import. Refuses anything but a regular file (a symlink is followed
 * to what it points at, which must be one), a file over `maxBytes`, and anything that is not UTF-8
 * text, with ImportFileError naming the file by its base name. A leading byte order mark is
 * dropped. Reads at most `maxBytes` + 1 bytes, so a file that grows while it is read is refused too.
 */
export async function readImportFile(filePath: string, maxBytes: number): Promise<string> {
  const name = path.basename(filePath);
  const unreadable = (why: string) => new ImportFileError('unreadable', name, `${name} ${why}`);
  const tooLarge = () =>
    new ImportFileError('too_large', name, `${name} is larger than ${formatBytes(maxBytes)}`);

  // checked before opening, as opening a FIFO or a device can block
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    throw unreadable('could not be found');
  }
  if (!stat.isFile()) throw unreadable('is not a file');
  if (stat.size > maxBytes) throw tooLarge();

  let handle;
  try {
    handle = await fs.open(filePath, 'r');
  } catch {
    throw unreadable('could not be opened');
  }
  let bytes: Buffer;
  try {
    // the open file must still be a regular file: the path could have been swapped since the stat
    if (!(await handle.stat()).isFile()) throw unreadable('is not a file');
    const buffer = Buffer.alloc(Math.min(stat.size, maxBytes) + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > maxBytes) throw tooLarge();
    bytes = buffer.subarray(0, length);
  } catch (error) {
    if (error instanceof ImportFileError) throw error;
    throw unreadable('could not be read');
  } finally {
    await handle.close();
  }

  let text: string;
  try {
    // drops a byte order mark
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ImportFileError('not_text', name, `${name} is not UTF-8 text`);
  }
  if (text.includes('\u0000')) {
    throw new ImportFileError('not_text', name, `${name} is not a text file`);
  }
  return text;
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))} MB` : `${bytes} bytes`;
}

// the extension of a path, lowercased and without its dot: "csv" for "Tasks.CSV"
export function extensionOf(filePath: string): string {
  return path.extname(filePath).slice(1).toLowerCase();
}

// names Windows keeps for devices, with or without an extension
const RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
// characters no file name may hold on macOS, Windows or Linux, and control characters
// eslint-disable-next-line no-control-regex
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;
const MAX_NAME_LENGTH = 100;

/**
 * A file name (without extension) made from a title: no path separators or characters a file
 * system refuses, no leading dot (so never "." or ".." or a hidden file), no trailing dot or space,
 * not a Windows device name, at most 100 characters. "Untitled" when nothing is left.
 */
export function safeFileName(title: string): string {
  const cleaned = title.normalize('NFC').replace(UNSAFE_CHARACTERS, '-').replace(/\s+/g, ' ');
  const trimmed = [...cleaned.replace(/^[\s.]+/, '')]
    .slice(0, MAX_NAME_LENGTH)
    .join('')
    .replace(/[\s.]+$/, '');
  if (trimmed === '') return 'Untitled';
  return RESERVED_NAMES.test(trimmed) ? `${trimmed}_` : trimmed;
}

/**
 * `name`, or `name (2)`, `name (3)`, … when it is taken: `taken` holds the names used so far,
 * lowercased, as macOS and Windows compare names without case. Adds the one returned to `taken`.
 */
export function uniqueName(name: string, taken: Set<string>): string {
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${name} (${n})`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/**
 * `dir` joined with `name`, after checking the result is directly inside `dir`. A name from
 * safeFileName always is; this is the check that makes sure.
 */
export function childPath(dir: string, name: string): string {
  const resolved = path.resolve(dir, name);
  if (path.dirname(resolved) !== path.resolve(dir)) {
    throw new Error('A file name may not leave its folder');
  }
  return resolved;
}

/**
 * Creates a new directory named `name` inside `parent`, or `name (2)` and so on when one exists,
 * and returns its path. Never writes into a directory that was already there.
 */
export async function createUniqueDirectory(parent: string, name: string): Promise<string> {
  for (let n = 1; n <= 1000; n++) {
    const dir = childPath(parent, n === 1 ? name : `${name} (${n})`);
    try {
      await fs.mkdir(dir);
      return dir;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error('No free folder name for the export');
}
