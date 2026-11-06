# ProjectRow

A project in the Projects list, on the shared 48px `ListRow`: its folder in the project's colour (darkened on white so green and amber keep 3:1), the name, then on the right a status pill (`ProjectStatusIcon` and its label) right-aligned in a 120px column, a 120px `Progress` bar with the percent in 32px, and the date right-aligned in 76px ("Due Jul 1", "Due tomorrow", or "Done Jun 12" once completed).

`project`: core's `Project` as it is (`ProjectRowData`: `title`, `color`, `status`, `dueDate`, `completedAt`); its colour goes through `resolveColor` (a swatch name or a `#rrggbb`; anything else keeps the grey folder). `stats` (`numOfCompleted`, `totalTasks` from `projects.stats`) draws the bar and percent; without it (while it loads) there is no bar. Project health is not shown for now, so every bar is green (`health-on-track`).
