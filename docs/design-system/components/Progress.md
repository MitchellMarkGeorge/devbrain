# Progress

shadcn's Progress drawn as Figma's project bar: a 4px round track in `input` (translucent in dark, like shadcn's `primary/20`, so it shows on the page and on a `card`) with a green fill (`health-on-track`). Project health is not shown in the UI for now, so every project bar is green. Small inline progress uses `ProgressRing`.

**Base UI:** `Progress.Root`, `Progress.Track`, `Progress.Indicator`. Styles key off `data-complete`, `data-progressing`.
