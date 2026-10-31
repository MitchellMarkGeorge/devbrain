import path from 'node:path';
import { extractFrontmatter, serializeFrontmatter } from '../local/frontmatter';
import { ImportFileError } from '../shared/errors';

// The Markdown note format (docs/import-export.md): a note's markdown, with optional YAML front
// matter holding its title, project and, in an export, its id.

export interface NoteRecord {
  // from the front matter, else the file's name without its extension
  title: string;
  project: string | null;
  // an exported note's id, to recognise a note already in the workspace; never the new note's id
  id: string | null;
  content: string;
}

function malformed(filePath: string, why: string): ImportFileError {
  const name = path.basename(filePath);
  return new ImportFileError('malformed', name, `${name}: ${why}`);
}

// a front matter value as text: strings, numbers and booleans; a YAML date as YYYY-MM-DD
function textValue(data: Record<string, unknown>, key: string, filePath: string): string | null {
  const value = Object.hasOwn(data, key) ? data[key] : undefined;
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  throw malformed(filePath, `"${key}" in its front matter must be text`);
}

/**
 * A Markdown file as a note. Front matter is optional; when there is some it must be YAML
 * `key: value` pairs, of which `title`, `project` and `id` are read and the rest ignored. Throws
 * ImportFileError (malformed) for front matter that is not valid YAML, not key-value pairs, or
 * whose fields are not text.
 */
export function parseNoteMarkdown(raw: string, filePath: string): NoteRecord {
  let document;
  try {
    document = extractFrontmatter<Record<string, unknown>>(raw);
  } catch {
    throw malformed(filePath, 'its front matter is not valid YAML');
  }
  const { data, content } = document;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw malformed(filePath, 'its front matter must be "key: value" pairs');
  }
  const title =
    textValue(data, 'title', filePath) ?? path.basename(filePath, path.extname(filePath));
  return {
    title,
    project: textValue(data, 'project', filePath),
    id: textValue(data, 'id', filePath),
    content,
  };
}

// a note as an exported Markdown file; `project` is left out when the note has none
export function formatNoteMarkdown(
  note: { id: string; title: string; project: string | null },
  content: string,
): string {
  const data: Record<string, unknown> = { title: note.title };
  if (note.project !== null) data.project = note.project;
  data.id = note.id;
  return serializeFrontmatter(data, content);
}
