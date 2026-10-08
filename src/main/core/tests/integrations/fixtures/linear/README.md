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

- `getAccount`, initial `pull` paging and `listAssignedIds` ran cleanly against a real account (111 open assigned issues).
- The `id: { in: [...] }` filter rejects a value that is not a UUID with an `Argument Validation Error`, sent with HTTP 200 and an `errors` array. Ids that come from Linear are always UUIDs; an id that no longer resolves is simply absent from the result.

## Still to confirm on a live account

- The direction of `orderBy: updatedAt` (assumed newest first; the cursor logic is safe either way).
- Whether `viewer.assignedIssues` hides trashed issues.
- The largest `first` Linear accepts (lookups request 100).
- Whether closing an issue as a duplicate sets `canceledAt`. If not, a duplicate closed in the last 30 days is missed by the initial pull, though the next incremental run picks it up by `updatedAt`.
- Which extension field identifies an error. Linear's docs show `extensions.code: "RATELIMITED"`; `@linear/sdk` reads `extensions.type` (`"ratelimited"`, `"authentication error"`). The client accepts either. Also whether an unknown key comes back as a 401 or as a 400 with an authentication error.
- The unit of `X-RateLimit-Requests-Reset` and `X-RateLimit-Complexity-Reset`, documented by the SDK as a Unix timestamp. Seconds and milliseconds are both accepted. `Retry-After` (seconds) is used when neither is sent.
