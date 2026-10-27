# DevBrain

## Database migrations

Migrations live in `src/main/db/migrations` and are generated from the schema in
`src/main/db/schema` with `npm run db:generate-migrations` (drizzle-kit). drizzle-kit only diffs
schemas: it knows nothing about the data already in a table.

**Rule: a generated migration is never edited by hand. Data changes go in their own custom
migration.** Split a schema change that drizzle-kit cannot carry out on its own into steps,
generating each from an intermediate schema:

1. **Add** (generated): new tables, renamed columns, and new columns without a foreign key or a
   CHECK. drizzle-kit emits plain `ALTER TABLE … ADD`/`RENAME COLUMN`, which keeps every row.
2. **Data** (custom, `npm run db:generate-migrations -- --custom --name=<what it does>`): seed rows,
   fill and convert values, so every row satisfies the constraints added next. SQL only, no schema
   changes.
3. **Constrain** (generated, from the final schema): foreign keys, CHECKs, and other changes
   SQLite can only make by rebuilding the table. Every column already exists, so drizzle-kit's
   copy of the rows into the rebuilt table is correct as generated.

Skip the steps a change does not need. Why: SQLite cannot add a foreign key or a CHECK to an
existing table, so drizzle-kit rebuilds it, and the rebuild copies every column of the new table
from the old one, failing on columns the old table does not have. It also cannot know how to fill
a new column from existing data. 0019–0021 (calendars and the event model) are an example.

Other points:

- Give each migration a name saying what it does (`--name=…`).
- drizzle-kit asks whether a new column is created or renamed, and needs a TTY to ask. Answer
  "rename" only for a real rename.
- After generating, run `npm run db:generate-migrations` again: it must report no schema changes.
- An unmerged branch's own migrations can be deleted (the `.sql`, its snapshot and its
  `_journal.json` entry) and generated again; a merged migration is never changed.
- Cover a migration that changes existing rows in `src/main/core/tests/db/migrations.test.ts`,
  seeding a database at the migration before it.

## Change events

A service in `src/main/core` that tells other code what it changed does so through
`ChangeListeners` (`src/main/core/shared/changes.ts`), not a listener set or callback option of its
own:

- Expose `onChange(listener)` (or a name saying what is sent, like `onProgress`) returning
  `this.changes.add(listener)`, and send with `this.changes.emit(change)` once the change has
  happened (after the commit, or as a transaction's last step when a listener's writes must commit
  with it).
- Make the change a discriminated union with a `type`, carrying ids and rows, never credentials.
- Wire services together by subscribing where they are built (`Workspace`,
  `createIntegrationServices`), not by passing hooks into constructors.
- A listener that throws is logged by its error class only and never fails the call. Pass
  `{ logger }` to send that line to the service's logger, or `{ report }` to replace it with one
  that adds context such as the id the change was about (see `SyncEngine`).
