# SourcePill

Where a synced task comes from and its key, as one outlined pill: the provider's logo (`ProviderLogo`, 12px: Linear, GitHub) and the key in the pill label ("ENG-124"). It replaces the bare key everywhere a task is listed: task rows, board cards (the 20px `compact` size, on the card's top line) and search results. On the task page the same information is the "Linear · ENG-124" badge that leads the links line.

- The key sits in `muted-foreground` like every pill label, and brightens on hover with the rest of the pill (see `EntityPill`).
- Local tasks have no key and no pill.
- A detached task keeps its pill: it still remembers where it came from.
