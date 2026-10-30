# Input

shadcn's Input as Nova draws it: 32px, 10px corners, an `input` border over an `input`/30 fill, 14px text, `muted-foreground` placeholder.

- Pair with `Field` for a label and an error; invalid inputs take a `destructive` border.
- Task and note titles are not Inputs: they are plain text that edits in place.

**Base UI:** `Input`, inside `Field.Root` for labels, descriptions and validation. Styles key off `data-invalid`, `data-focused`, `data-disabled`.
