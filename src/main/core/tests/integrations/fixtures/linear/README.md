# Linear fixtures

Most of these fixtures are **hand-written**, from the query shapes in the design's provider reference ("Provider reference" → Linear), because they need cases a real account may not have: closed, trashed and duplicate issues, every priority. Names, emails and ids in them are made up.

The `recorded-*` files are **real responses**, recorded with the scratch script's `--record` option and then scrubbed: names, email, the workspace URL slug and descriptions are replaced; ids are real. To record more:

```sh
DEV_LINEAR_API_KEY=lin_api_... npx tsx --tsconfig ./tsconfig.node.json scripts/linear_scratch.mts --record <dir>
```

| File                               | What it is                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `viewer.json`                      | Response to the `Viewer` query                                                                                    |
| `issue.json`                       | One issue node with every mirrored field set, including parent and project                                        |
| `issue-minimal.json`               | One issue node with no description, due date, start time, parent or project                                       |
| `issues-by-state.json`             | One issue node per workflow state type, keyed by type                                                             |
| `assigned-issues-page-1.json`      | First page of `viewer.assignedIssues`, with a next page                                                           |
| `assigned-issues-page-2.json`      | Last page, with a completed issue and a trashed one                                                               |
| `rate-limited.json`                | Body of the HTTP 400 Linear sends when rate limited                                                               |
| `authentication-error.json`        | Body of a GraphQL authentication error, as an unknown key might return it                                         |
| `recorded-viewer.json`             | Recorded: response to the `Viewer` query                                                                          |
| `recorded-assigned-issues.json`    | Recorded: four issues from real pages (due date, parent, started, no project), as one last page                   |
| `recorded-closed-and-trashed.json` | Recorded: completed, canceled, duplicate, "In Review" and trashed test issues, one per priority, as one last page |

## Checked against the schema

Field names, enum values and query shapes were checked against the generated schema types in `@linear/sdk` 97.1.0. Each lives in one place under `src/main/core/integrations/providers/linear/`, so a correction is a change there (and to these fixtures): field selections and filters in `queries.ts`, response shapes and enum values in `schema.ts`, and error codes and headers in `client.ts`.

- Workflow state types: `triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`, `duplicate`. A duplicate maps to cancelled.
- Priority numbers: 0 no priority, 1 urgent, 2 high, 3 medium, 4 low. `priorityLabel` is never null.
- Project status: `status { type name }`, with types `backlog`, `planned`, `started`, `paused`, `completed`, `canceled`. The older `state` field is deprecated.
- Issue fields: `identifier`, `priorityLabel`, `dueDate` (date-only), `startedAt`, `completedAt`, `canceledAt`, `archivedAt`, `trashed` (nullable), `state { name type }`, `assignee { id }`, `parent`, `project`.
- Project fields: `startDate` and `targetDate` (date-only), `color`, `completedAt`, `canceledAt`, `createdAt`.
- Viewer: `organization { id name }` (the workspace the user belongs to); `email` is never null.
- Query shapes: `assignedIssues` and `issues` take `first`, `after`, `filter: IssueFilter`, `includeArchived` and `orderBy` (`createdAt` or `updatedAt`). `state.type` takes `nin`, `id` takes `in`, `or` works at the top of a filter, and date filters take an ISO time or a duration.

## Seen on a live account

- `getAccount`, initial `pull` paging and `listAssignedIds` ran cleanly against a real account: 111 open assigned issues over three pages, all valid, none skipped.
- `orderBy: updatedAt` returns the most recently updated issues first, across pages.
- `endCursor` is the id of the page's last issue.
- An issue that is not trashed has `trashed: null`, not `false`. An empty description is `""`, not `null`; the mapper stores both as null.
- The reset headers are Unix times in milliseconds, about an hour ahead. A 50-issue page with its project costs about 670 complexity points, far under the 10,000 per query and 3,000,000 per hour.
- The initial pull's closed window works: completed, canceled and duplicate issues closed in the last 30 days come back. Completing sets `completedAt`; canceling and marking as a duplicate both set `canceledAt`.
- `priorityLabel` is "No priority", "Urgent", "High", "Medium" and "Low" for priorities 0 to 4.
- With `includeArchived: true`, `assignedIssues` still returns a trashed issue, with `trashed: true` and `archivedAt` set. Trashing does **not** change `updatedAt`, so the incremental filter also checks `archivedAt`, which trashing does set; the trashed issue then comes back and is reported in `removedIds`. The reconcile lookup is the backstop, which is why `lookup` reports trashed ids as gone.
- Restoring a trashed issue clears both `trashed` and `archivedAt` and also leaves `updatedAt` unchanged, so an incremental pull cannot see a restore either. The restored issue reappears in the assignment snapshot, so reconcile brings it back by also looking up snapshot ids that are not mirrored as synced (feature 11).
- Marking an issue as a duplicate of another bumps the other issue's `updatedAt`.
- The assignment snapshot (`listAssignedIds`, no `includeArchived`) leaves out trashed issues, as well as completed, canceled and duplicate ones. A trashed issue therefore becomes a reconcile candidate, and the lookup (with `includeArchived`) returns it with `trashed: true`, so it is reported as gone.
- A lookup of three real ids and one random UUID returned the three issues; the unknown id was simply absent, so it is reported as gone.
- The `id: { in: [...] }` filter rejects a value that is not a UUID with an `Argument Validation Error`, sent with HTTP 200 and an `errors` array. Ids that come from Linear are always UUIDs; an id that no longer resolves is simply absent from the result.

## Still to confirm on a live account

- The largest `first` Linear accepts (lookups request 100).
- Which extension field identifies an error. Linear's docs show `extensions.code: "RATELIMITED"`; `@linear/sdk` reads `extensions.type` (`"ratelimited"`, `"authentication error"`). The client accepts either. Also whether an unknown key comes back as a 401 or as a 400 with an authentication error.
