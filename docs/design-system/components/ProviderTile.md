# ProviderTile

A provider's official mark (Simple Icons, as the Figma file exports it) in white on its brand colour, in a 32px tile with 8px corners: Linear on `platform-linear` (#5E6AD2), Google Calendar on Google blue (#4285F4), GitHub on a neutral `border-strong` ground with a `foreground-strong` mark. Brand colours are the one place hex values belong: they follow the brand, not the theme. Carries the provider's name for screen readers.

- Props: `provider` (`'linear' | 'google-calendar' | 'github'`), `size` (32).
- `ProviderLogo` is the smaller tile inside task pills (Linear and GitHub only).

**Base UI:** No Base UI part: an SVG mark.
