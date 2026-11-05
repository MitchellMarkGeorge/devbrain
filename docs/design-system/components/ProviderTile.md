# ProviderTile

A provider's brand at tile size (32px by default, as in Home's `SetupRow`; 16px in a synced badge), carrying the provider's name for screen readers:

- **Linear:** Linear's company icon, exactly as Linear publishes it (`src/renderer/assets/brand/linear-icon.svg`: its logomark in white on a graphite tile), given the tile's corners (8px at 32px). Linear's guidelines allow the icon, with an appropriate corner radius, where a chip design is needed. It is served as a file, since the page's content security policy allows no `data:` images.
- **Google Calendar:** its own full-colour logo, exactly as Google publishes it (`GoogleCalendarLogo`), at the tile's size. It is a tile already, so it has no ground of its own.
- **GitHub:** its mark in `foreground-strong` on a neutral `border-strong` ground.

Brand colours are the one place hex values belong: they follow the brand, not the theme.

- Props: `provider` (`'linear' | 'google-calendar' | 'github'`), `size` (32).
- `ProviderLogo` is the bare mark for tight places (pills, badges).

**Base UI:** No Base UI part: SVG marks.
