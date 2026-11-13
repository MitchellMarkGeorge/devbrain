# SourcePill

Where a synced task comes from and its key, as one outlined pill: the provider's logo (`ProviderLogo`, 12px: Linear, GitHub) and the key in the pill label ("ENG-124"). It replaces the bare key everywhere a task is listed: task rows, board cards and search results, always at the 24px pill size. On the task page the same information is the "Linear · ENG-124" badge that leads the links line.

- The key sits in `muted-foreground` like every pill label, and brightens on hover with the rest of the pill (see `EntityPill`).
- Local tasks have no key and no pill.
- A detached task keeps its pill: it still remembers where it came from.
- **Focus.** A pill inside something that is itself the tab stop (a `TaskRow`, a `BoardCard`) takes `tabIndex={-1}`, as `EntityPill`s there do, so Tab leaves the list instead of walking every pill. Inside an option that is not a button (a ⌘K result), pass `interactive={false}`: it draws as a plain `span`, as nothing interactive may sit inside an option.
