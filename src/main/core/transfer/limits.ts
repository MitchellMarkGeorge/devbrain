// What an import reads at most. Imported files are untrusted (docs/import-export.md), so each is
// capped before it is read whole. Exceeding a file's cap fails the import with ImportFileError
// (too_large); a note over its cap is reported in the summary, and the other notes still import.

const MiB = 1024 * 1024;

// one CSV or JSON file of tasks
export const MAX_TASK_FILE_BYTES = 10 * MiB;
// tasks in one file, subtasks included
export const MAX_TASK_ROWS = 10_000;
// how deep subtasks nest in an import; a deeper one is reported, not imported
export const MAX_TASK_DEPTH = 32;
// one Markdown file
export const MAX_NOTE_FILE_BYTES = 5 * MiB;
// files in one note import, and their size together
export const MAX_NOTE_FILES = 1_000;
export const MAX_NOTES_TOTAL_BYTES = 50 * MiB;
// a title or description longer than this is an error for its row
export const MAX_TITLE_LENGTH = 500;
export const MAX_DESCRIPTION_LENGTH = 100_000;
