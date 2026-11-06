# ProjectStatusIcon

A project's status, core's `ProjectStatus` enum (`status` prop), as a 16px glyph (12px inside pills): `NOT_STARTED` circle, `ACTIVE` activity line, `ON_HOLD` paused circle, `COMPLETED` filled check (Figma's `ProjectStatusIcon`).

- Colours: the task status tokens. `ACTIVE` is `status-in-progress` (orange), `COMPLETED` `status-completed`, `NOT_STARTED` and `ON_HOLD` `status-not-started` (grey). Each status has its own shape, so colour is never the only signal.
- Shown in the status pill on project cards, rows and headers (an outline `Badge` with the status's name). Health (`HealthIcon`) is not shown for now.
- It carries the status's name (`PROJECT_STATUS_LABELS`) for screen readers.

**Base UI:** No Base UI part: a Lucide icon (`Circle`, `Activity`, `CirclePause`) or the shared `FilledCheck`.
