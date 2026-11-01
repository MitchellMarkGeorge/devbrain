import fs from 'node:fs/promises';
import path from 'node:path';
import { ImportFileError } from '../shared/errors';

// Reading files the user picked to import, and naming the files an export writes. Imported files
// are untrusted: they are capped before they are read, must be UTF-8 text, and nothing in them is
// ever taken as a path (docs/import-export.md).

/**
 * The text of a file chosen for import, read whole, or ImportFileError (naming the file by its base
 * name only) when it can't be had:
 *
 * - `unreadable`: missing, not a regular file (a symlink is followed to what it points at, which
 *   must be one), or failing to open or read.
 * - `too_large`: more than `maxBytes`.
 * - `not_text`: not UTF-8, or holding NUL bytes (a binary file).
 *
 * A leading byte order mark is dropped. The steps, and why each is there:
 *
 * 1. **Check the path** with `stat`. A directory, FIFO or device is refused before it is opened,
 *    as opening a FIFO waits for a writer and would hang the import. A file whose size is already
 *    over the limit is refused without reading any of it.
 * 2. **Open it, and check the open file again** with `handle.stat`. The path is a name, not a file:
 *    something could have been put in its place between step 1 and the open, and the open file is
 *    what gets read.
 * 3. **Read it to its end, counting** (readAtMost). The size from step 1 is only a hint, never a
 *    bound on how much is read: a file can grow after it was measured, and some files report a
 *    size of 0 while holding data (Linux's /proc files). Reading only as many bytes as were
 *    measured would silently cut such a file short, so the read goes on until the file ends,
 *    and stops as soon as it passes `maxBytes`, so a file that grows without end can't fill memory.
 * 4. **Decode it as UTF-8**, refusing invalid UTF-8 and NUL bytes.
 */
export async function readImportFile(filePath: string, maxBytes: number): Promise<string> {
  const name = path.basename(filePath);
  const unreadable = (why: string) => new ImportFileError('unreadable', name, `${name} ${why}`);
  const tooLarge = () =>
    new ImportFileError('too_large', name, `${name} is larger than ${formatBytes(maxBytes)}`);

  // 1. the path
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    throw unreadable('could not be found');
  }
  if (!stat.isFile()) throw unreadable('is not a file');
  if (stat.size > maxBytes) throw tooLarge();

  // 2. the open file
  let handle;
  try {
    handle = await fs.open(filePath, 'r');
  } catch {
    throw unreadable('could not be opened');
  }
  let bytes: Buffer | null;
  try {
    if (!(await handle.stat()).isFile()) throw unreadable('is not a file');
    // 3. its bytes, up to the limit
    bytes = await readAtMost(handle, maxBytes);
  } catch (error) {
    if (error instanceof ImportFileError) throw error;
    throw unreadable('could not be read');
  } finally {
    await handle.close();
  }
  if (bytes === null) throw tooLarge();

  // 4. its text
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

// how much readAtMost asks for at a time
const READ_CHUNK_BYTES = 64 * 1024;

/**
 * Every byte of an open file, from where it is to its end, or null as soon as there are more than
 * `maxBytes`. Reads a chunk at a time, however large the file said it was, so it reads a file that
 * grew since it was measured in full, and never holds more than `maxBytes` plus one chunk.
 * A read can return fewer bytes than asked for; only a read of none means the file has ended.
 */
export async function readAtMost(
  handle: Pick<fs.FileHandle, 'read'>,
  maxBytes: number,
): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  // one buffer to read into, reused; only the bytes each read returns are kept
  const scratch = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  for (;;) {
    // a null position reads on from where the last read ended
    const { bytesRead } = await handle.read(scratch, 0, scratch.length, null);
    if (bytesRead === 0) return Buffer.concat(chunks, total);
    total += bytesRead;
    if (total > maxBytes) return null;
    chunks.push(Buffer.from(scratch.subarray(0, bytesRead)));
  }
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
