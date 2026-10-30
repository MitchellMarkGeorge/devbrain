# PropertyPanel

The properties beside a task or note (Figma's Status / Priority / Due / Project panel): a flat `Card` of fields, each a 12px `muted-foreground` label over pills that open their picker (status menu, date picker, project `Command`).

- `fields`: `{ label, values: ReactNode[] }`. Unset properties show a muted "+ Add …" pill, never a blank.
