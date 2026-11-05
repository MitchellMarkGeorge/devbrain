# ProjectRow

A project in the Projects list, on the shared 48px `ListRow`: its folder in the project's colour (darkened on white so green and amber keep 3:1), the name, then on the right a status pill (`ProjectStatusIcon` and its label) right-aligned in a 120px column, a 120px `Progress` bar with the percent in 32px, and the due date ("Due Jul 1") right-aligned in 76px.

`project`: `{ name, color?, status?: ProjectStatus, progress?: 0–100, due? }`. Project health is not shown for now, so every bar is green (`health-on-track`).
