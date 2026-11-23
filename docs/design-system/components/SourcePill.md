# SourcePill

Where a synced or detached task comes from and its key, as one outlined pill: the provider's logo (`ProviderLogo`, 12px: Linear, GitHub) and the key in the pill label ("ENG-124"). It replaces the bare key everywhere a task is listed: task rows, board cards, search results and Trash, always at the 24px pill size. A project from Linear shows one with the provider's name ("Linear") on its row and at the top of its page. On the task page the same information is the "Linear · ENG-124" badge that leads the links line.

- The key sits in `muted-foreground` like every pill label, and brightens on hover with the rest of the pill (see `EntityPill`).
- Local tasks have no key and no pill.
- **Detached** (`detached`, from `isDetached`): a detached task or project keeps its pill, since it still remembers where it came from, but loosely: its outline is dashed and the provider's mark drops to half strength. It stays the size of a synced pill, so rows and cards line up the same. Its tooltip reads "ENG-124 · Detached" and its accessible name "ENG-124, detached". Its hover card says "Detached from Linear" and "Edits stay in DevBrain" in place of the status in Linear and the sync time, which no longer apply.
