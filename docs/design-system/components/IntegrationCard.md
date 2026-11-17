# IntegrationCard

A connected account on the Integrations page: a `card` with a `border` outline and 14px corners. The account row (14px × 16px padding, 12px gaps): the `ProviderTile`, the name (14px medium) with its `AccountStatus` over the account line (12px `muted-foreground`: "Mitchell George · Acme · API key"), then on the right "On"/"Off" (`IntegrationSwitchLabel`), the account's `Switch` and an outline "Disconnect…" button. An `IntegrationCardAlert` sits under it when the account needs attention: amber triangle, 14px text and the fixing button ("Reconnect", "Update API Key") on a 15% `health-at-risk` ground with a 40% outline, 10px corners. With `tone="info"` it is an offer rather than a problem (reattaching the tasks a disconnect kept: "Keep Local" and "Reattach…"): an `Info` icon in `swatch-blue`, the editor's Note blue, on a 10% `swatch-blue` ground with a 35% outline, announced as `role="status"` instead of `role="alert"`. Keep amber for what stops syncing, so an account that needs reconnecting still stands out. Below a `border` line, "Use this account for" (12px medium `muted-foreground`) heads the `SourceRow`s.

- `state="off"`: the tile fades to 50% (pass `disabled` to its sources).
- `state="coming-later"`: a dashed outline on the page colour, no actions and no sources.
- Cards stack 24px apart in the 720px document column (`content-max-width`).

**Base UI:** No Base UI part: plain markup around Switches and Buttons.
