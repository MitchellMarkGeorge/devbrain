# Renderer components

The DevBrain design system (`docs/design-system/`) built as React components.

- `ui/`: the design system's components, one folder each (`ui/Button/`), built on
  [Base UI](https://base-ui.com) (`@base-ui/react`) where the component's guide names a Base UI part.
- `layout/`: utility components for layout and type: `Text`, `Heading`, `Flex`/`Stack`, `Grid`,
  `Box`, `VisuallyHidden`.
- `lib/`: helpers (`cn`, `mergeClassName`).

Run `npm run storybook` to browse every component.

## A component's folder

```
ui/Button/
  Button.tsx          the component
  Button.module.css   its styles (CSS Modules, values from tokens.css)
  Button.stories.tsx  its Storybook stories
  index.ts            its public exports
```

Import from the folder (`import { Button } from '@/components/ui/Button'`, relative in practice) or
from the barrel (`components/ui/index.ts`).

## Rules

- **Styles are CSS Modules on the tokens.** Every value comes from `src/renderer/styles/tokens.css`
  (`var(--control-md)`, `var(--radius-lg)`, `var(--border)`); no raw colours. No Tailwind.
  shadcn's `bg-primary/90` is `color-mix(in oklab, var(--primary) 90%, transparent)`.
- **Variants use `cva`** (class-variance-authority), mapping each variant to a CSS Module class:
  `cva(styles.button, { variants: { size: { sm: styles.sizeSm } } })`. Export the `*Variants`
  function so other components can reuse the look. Class names join with `cn` (clsx).
- **State comes from Base UI's data attributes** (`[data-checked]`, `[data-highlighted]`,
  `[data-open]`, `[data-starting-style]`), not from extra classes or props.
- **`render` replaces shadcn's `asChild`.** Base UI parts take `render`; DevBrain's own components
  that render one element use `useRender` and `mergeProps` from Base UI to accept it too.
- **`className` on a Base UI part may be a function of its state:** join it with `mergeClassName`.
- **Icons are Lucide** at stroke 1.75 via `Icon` (`<Icon icon={Folder} size={12} />`). Components
  that take an icon accept an `IconSource`: a Lucide icon (`icon={Folder}`) or a node, drawn with
  `renderIcon(icon, size)`.
- **Focus** is shadcn's ring: `border-color: var(--ring)` and
  `box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent)` on `:focus-visible`.
- **Motion** honours `prefers-reduced-motion` (tokens.css zeroes the durations).

The look of each component is specified in `docs/design-system/components/<Name>.md` and drawn in
`docs/design-system/reference/bundle.css` (base rules, then the Nova overrides from line ~1099,
then the Lists overrides from line ~1556: a component's final look is all three layers combined).
