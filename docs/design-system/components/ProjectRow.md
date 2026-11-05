# ProjectRow

A project in the Projects list, on the shared 48px `ListRow`: its folder in the project's colour (darkened on white so green and amber keep 3:1), the name, then on the right a status pill (`ProjectStatusIcon` and its label) right-aligned in a 120px column, a 120px `Progress` bar with the percent in 32px, and the due date ("Due Jul 1") right-aligned in 76px.

- **`compact`** (Home's Recent projects): no status pill and no percent. A 96px `Progress` bar, "3/12" (tasks done of all, 12px `subtle-foreground`, 36px), then the due date, or the status label ("On hold") when there is none.

`project`: `{ name, color?, status?: ProjectStatus, progress?: 0–100, done?, total?, due? }`; `compact` draws its bar from `done`/`total` when `progress` is not given. Project health is not shown for now, so every bar is green (`health-on-track`).
