# SetupRow

Figma's `SetupRow`: a setup step in Home's "Get started" section, which fills an empty slot in a new or partly set-up workspace. 12px in at the sides, 12px gaps, 8px above and below (about 54px; Figma draws 56px):

- the glyph at 32px: a `ProviderTile` (Google Calendar, Linear), or, for a step inside the app, its icon at 16px in a `secondary` tile with 8px corners (`icon={Folder}`);
- the step (14px `foreground-strong`: "Connect Google Calendar", "Start a project") over one line of what it adds to Home (12px `muted-foreground`: "Your meetings show up here, and move to the top just before they start.");
- its button at the right, default `sm` ("Connect", "Create").

A row goes once its step is done, and the section goes with its last row.

**Base UI:** No Base UI part: plain markup around the `Button`.
