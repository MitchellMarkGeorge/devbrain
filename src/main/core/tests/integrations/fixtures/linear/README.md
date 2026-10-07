# Linear fixtures

**These fixtures are hand-written, not recorded.** Linear's API was not reachable when the Linear client was built, so every payload here was written from the query shapes in the design's provider reference ("Provider reference" → Linear). Names, emails and ids are made up.

Replace them with recorded responses (names and emails scrubbed) once the scratch script has run against a real account:

```sh
DEV_LINEAR_API_KEY=lin_api_... npx tsx --tsconfig ./tsconfig.node.json scripts/linear_scratch.mts
```

| File                          | What it is                                                                  |
| ----------------------------- | --------------------------------------------------------------------------- |
| `viewer.json`                 | Response to the `Viewer` query                                              |
| `issue.json`                  | One issue node with every mirrored field set, including parent and project  |
| `issue-minimal.json`          | One issue node with no description, due date, start time, parent or project |
| `issues-by-state.json`        | One issue node per workflow state type, keyed by type                       |
| `assigned-issues-page-1.json` | First page of `viewer.assignedIssues`, with a next page                     |
| `assigned-issues-page-2.json` | Last page, with a completed issue and a trashed one                         |
| `rate-limited.json`           | Body of the HTTP 400 Linear sends when rate limited                         |
| `authentication-error.json`   | Body of a GraphQL authentication error, as an unknown key might return it   |

## From memory, to confirm

Each lives in one place under `src/main/core/integrations/providers/linear/`, so a correction is a change there (and to these fixtures): field selections and filters in `queries.ts`, response shapes and enum values in `schema.ts`, and error codes and headers in `client.ts`.

**Enum values**

- Workflow state types: `triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`.
- Priority numbers: 0 no priority, 1 urgent, 2 high, 3 medium, 4 low; and the `priorityLabel` strings ("No priority", "Urgent", "High", "Medium", "Low").
- Project `state` values: `backlog`, `planned`, `started`, `paused`, `completed`, `canceled`. Linear may have moved this to a `status { type }` object, with `state` deprecated.
- Error codes: `RATELIMITED` (documented) and `AUTHENTICATION_ERROR` (from memory), and whether an unknown key comes back as a 401 or as a 400 with that code.

**Fields**

- Issue: `identifier`, `priorityLabel`, `dueDate` (a date-only string), `startedAt`, `completedAt`, `canceledAt`, `archivedAt`, `trashed` (and whether it is nullable), `state { name type }`, `assignee { id }`, `parent { id identifier title }`, `project { ... }`.
- Project: `state`, `startDate` and `targetDate` (date-only strings), `color`, `completedAt`, `canceledAt`, `createdAt`. `createdAt`, `completedAt` and `canceledAt` are not in the design's query shape; they were added because `ExternalProject` needs them.
- Viewer: `organization { id name }`, and whether `email` can be null.

**Query shapes**

- The filter variable type name `IssueFilter`, and `$since`/date filters taking an ISO time (the initial filter sends an ISO time rather than a `-P30D` duration).
- `nin` on `state.type`, `id: { in: [...] }` on `issues`, and `or: [...]` at the top of a filter.
- The direction of `orderBy: updatedAt` (assumed newest first; the cursor logic is safe either way).
- Whether `viewer.assignedIssues` without `includeArchived` hides trashed issues.
- The largest `first` Linear accepts (lookups request 100).

**Headers**

- `X-RateLimit-Requests-Reset` and `X-RateLimit-Complexity-Reset` are assumed to be UTC epoch milliseconds. Second values are accepted too.
