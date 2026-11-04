# CodeBlock

A note's code block: a `card` panel with 10px corners and 12px × 16px padding, the language's name as a 12px `muted-foreground` label (TypeScript, Bash, "Plain text" when there is none), 4px over the code in 13px mono on a 20px line. It sits in `EditorContent` with the other blocks, 12px under the one before.

**Syntax colours.** The editor highlights the code in its language with highlight.js's classes, and the block colours them with the `syntax-*` tokens: Tailwind's 400 and 300 steps in dark, 700 in light, each at least 4.5:1 on `card`.

| Token             | Marks                                                                 | Dark               | Light              |
| ----------------- | --------------------------------------------------------------------- | ------------------ | ------------------ |
| `syntax-keyword`  | `const`, `if`, `return`, `import`, decorators                         | violet-400         | violet-700         |
| `syntax-string`   | strings, template literals, diff additions                            | emerald-400        | emerald-700        |
| `syntax-number`   | numbers, `true`, `null`                                               | orange-300         | orange-700         |
| `syntax-comment`  | comments, in italics                                                  | `muted-foreground` | `muted-foreground` |
| `syntax-function` | function names, markdown headings                                     | blue-400           | blue-700           |
| `syntax-type`     | types, classes, built-ins                                             | amber-300          | amber-700          |
| `syntax-property` | properties, attributes, variables, parameters, keys                   | sky-300            | sky-700            |
| `syntax-tag`      | HTML and JSX tags, CSS selectors, regular expressions, diff deletions | pink-400           | pink-700           |

Punctuation and plain names stay `foreground`. A block with no language, or one highlight.js doesn't know, is plain text: the colours are never guessed.

- In the editor the label is a button (`onLanguageChange`): pointing at it fills it with `accent` and shows a 12px chevron. It opens a 240px menu with a search ("Search languages…") over Plain text and the languages by name, the current one ticked.

**Base UI:** `Menu` with a filter (DevBrain's `DropdownMenuFilter`, `DropdownMenuSearch`, `DropdownMenuList`) and `RadioGroup`, inside `DropdownMenuContent`.
