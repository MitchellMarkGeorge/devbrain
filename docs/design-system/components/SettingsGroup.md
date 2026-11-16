# SettingsGroup

A flat `Card` of settings rows, as in Figma's Settings: a 14px medium `foreground-strong` label and a 12px `muted-foreground` description on the left (2px apart), 12px × 16px padding so a two-line row is 62px, the current value and a control on the right, rows split by `border`.

- `rows`: `{ label, description?, value?, control }`. A `section-heading` (14px medium, `SettingsSection`) sits 8px above each group.
