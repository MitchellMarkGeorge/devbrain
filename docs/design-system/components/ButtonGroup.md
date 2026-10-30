# ButtonGroup

shadcn's ButtonGroup: buttons joined into one control, inner corners squared, borders overlapping.

- Use for the Settings split button ("Export as JSON ▾") and the calendar stepper (← Today →). Do not group unrelated actions.

**Base UI:** No Base UI part needed: a `div` with `role="group"` around Base UI `Button`s. For a split button, the chevron is a `Menu.Trigger` with `render={<Button />}`.
