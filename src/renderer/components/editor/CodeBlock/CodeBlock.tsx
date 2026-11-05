import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuFilter,
  DropdownMenuList,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSearch,
  DropdownMenuTrigger,
} from '../../ui/DropdownMenu';
import { Icon } from '../../ui/Icon';
import styles from './CodeBlock.module.css';

/** A language the code block can be set to: its value in the note (` ```ts `) and its name. */
export interface CodeLanguage {
  value: string;
  label: string;
}

export interface CodeBlockProps extends ComponentPropsWithoutRef<'div'> {
  /** the language's name over the code: "TypeScript"; "Plain text" when it has none */
  languageLabel?: string;
  /** the current language's value, ticked in the menu; '' for plain text */
  language?: string;
  /** the languages the menu offers; with `onLanguageChange` the label opens it */
  languages?: readonly CodeLanguage[];
  onLanguageChange?: (language: string) => void;
  /** the code: a `code` element, highlighted with highlight.js's `hljs-*` classes */
  children?: ReactNode;
}

/**
 * A note's code block: a `card` panel with the language's name as a quiet label over the code in
 * 13px mono, coloured by the `syntax-*` tokens. With `onLanguageChange` the label is a button
 * that opens a searchable menu of the languages.
 */
export const CodeBlock = forwardRef<HTMLDivElement, CodeBlockProps>(function CodeBlock(
  {
    languageLabel = 'Plain text',
    language = '',
    languages = [],
    onLanguageChange,
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <div ref={ref} className={cn(styles.block, className)} {...props}>
      <div className={styles.header} contentEditable={false}>
        {onLanguageChange ? (
          <DropdownMenuFilter>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(styles.label, styles.trigger)}
                aria-label={`Language: ${languageLabel}`}
              >
                {languageLabel}
                <Icon icon={ChevronDown} size={12} className={styles.chevron} />
              </DropdownMenuTrigger>
              <DropdownMenuContent width="lg" align="start" aria-label="Language">
                <DropdownMenuSearch aria-label="Search languages" placeholder="Search languages…" />
                <DropdownMenuList>
                  <DropdownMenuRadioGroup
                    value={language}
                    onValueChange={(value: unknown) => onLanguageChange(String(value))}
                  >
                    {languages.map((item) => (
                      <DropdownMenuRadioItem key={item.value} value={item.value} closeOnClick>
                        {item.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuList>
                <DropdownMenuEmpty>No languages match</DropdownMenuEmpty>
              </DropdownMenuContent>
            </DropdownMenu>
          </DropdownMenuFilter>
        ) : (
          <span className={styles.label}>{languageLabel}</span>
        )}
      </div>
      <pre className={styles.code}>{children}</pre>
    </div>
  );
});
