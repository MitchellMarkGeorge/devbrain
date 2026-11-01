import type { NoteId } from '@common/ids';

export type TaskFileFormat = 'csv' | 'json';

// A row of a task import that was not imported, or was imported without something. `row` is the
// spreadsheet's row number in a CSV (the header is row 1), and the task's position in a JSON file,
// counting from 1 in document order with subtasks right after their parent.
export interface TaskImportIssue {
  row: number;
  title: string | null;
  message: string;
}

export interface TaskImportSummary {
  // tasks created, subtasks included
  created: number;
  // rows left out on purpose: tasks already in the workspace, subtasks of a row that was not
  // imported
  skipped: TaskImportIssue[];
  // rows that are invalid, such as a missing title or an unknown status
  errors: TaskImportIssue[];
  // rows imported without something, such as a project no project's title matches
  warnings: TaskImportIssue[];
}

// a note file of an import that was not imported, or was imported without something
export interface NoteImportIssue {
  // the file's base name
  file: string;
  title: string | null;
  message: string;
}

export interface NoteImportSummary {
  created: number;
  // files left out on purpose: notes already in the workspace
  skipped: NoteImportIssue[];
  // files that could not be read or have invalid front matter
  errors: NoteImportIssue[];
  // notes imported without their project
  warnings: NoteImportIssue[];
}

export interface TaskExportResult {
  path: string;
  format: TaskFileFormat;
  // tasks written, subtasks included
  count: number;
}

export interface NoteExportResult {
  // the folder created for the notes
  path: string;
  count: number;
  // notes whose file could not be read, so they were left out
  errors: { noteId: NoteId; title: string; message: string }[];
}
