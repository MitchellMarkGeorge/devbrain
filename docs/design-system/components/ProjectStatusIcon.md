# ProjectStatusIcon

A project's status, matching core's `ProjectStatus`, as a 16px glyph (12px inside pills): `not-started` circle, `active` activity line, `on-hold` paused circle, `completed` filled check (Figma's `ProjectStatusIcon`).

- Colours: the task status tokens. `active` is `status-in-progress` (orange), `completed` `status-completed`, `not-started` and `on-hold` `status-not-started` (grey). Each status has its own shape, so colour is never the only signal.
- Shown in the status pill on project cards, rows and headers (an outline `Badge` with the status's name). Health (`HealthIcon`) is not shown for now.
- It carries the status's name for screen readers.

**Base UI:** No Base UI part: a Lucide icon (`Circle`, `Activity`, `CirclePause`) or the shared `FilledCheck`.
