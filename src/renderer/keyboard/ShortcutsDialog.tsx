import { Fragment, useMemo } from 'react';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/Dialog';
import { Kbd, KbdGroup } from '../components/ui/Kbd';
import { useFormatKeys } from '../components/lib/platform';
import { useCommandList, useKeyboard, useKeyboardState } from './KeyboardProvider';
import { KeyScope } from './KeyScope';
import { shortcutSections } from './shortcuts';
import { keyLabels } from './keys';
import styles from './ShortcutsDialog.module.css';

/**
 * Controlled like `Dialog`; the props `useModals().open` passes fit as they are:
 * `modals.open((props) => <ShortcutsDialog {...props} />)`.
 */
export interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** once the opening or closing animation has finished (`useModals` removes the dialog then) */
  onOpenChangeComplete?: (open: boolean) => void;
  /** the command whose keys the header names ("Press ? to open this any time") */
  openCommand?: string;
}

/**
 * The keyboard shortcuts sheet (Figma `7426:43880`), drawn from the active keymap in the current
 * mode, so the keys it shows are the keys that work. Sections are the entries' groups, in columns.
 * It is a modal key scope: while it is open, only Esc (Base UI's) closes it.
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
  onOpenChangeComplete,
  openCommand = 'help.shortcuts',
}: ShortcutsDialogProps) {
  const { keymap, platform } = useKeyboard();
  const commands = useCommandList();
  const { mode } = useKeyboardState();
  const formatKeys = useFormatKeys();
  const sections = useMemo(
    () => shortcutSections(keymap, commands, mode, platform),
    [keymap, commands, mode, platform],
  );
  const openKeys = useMemo(() => {
    const entry = keymap.entries.find((e) => e.command === openCommand && !e.hidden);
    return entry
      ? keyLabels(entry.keys, platform, { upperCase: keymap.upperCaseKeys ?? true })
      : [];
  }, [keymap, openCommand, platform]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <DialogContent showClose={false} className={styles.dialog}>
        <KeyScope name="dialog">
          <div className={styles.header}>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            {openKeys.length > 0 && (
              <span className={styles.hint}>
                Press {openKeys.map(formatKeys).join(' ')} to open this any time
              </span>
            )}
          </div>
          <div className={styles.sections}>
            {sections.map((section) => (
              <section key={section.title} className={styles.section}>
                <h3 className={styles.sectionTitle}>{section.title}</h3>
                <dl className={styles.rows}>
                  {section.rows.map((row) => (
                    <div key={row.label} className={styles.row}>
                      <dt className={styles.label}>{row.label}</dt>
                      <dd className={styles.keys}>
                        {row.bindings.map((strokes, i) => (
                          <Fragment key={i}>
                            {i > 0 && <span className={styles.or} aria-hidden />}
                            <KbdGroup>
                              {strokes.map((stroke, j) => (
                                <Kbd key={j} variant="raised">
                                  {stroke}
                                </Kbd>
                              ))}
                            </KbdGroup>
                          </Fragment>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </KeyScope>
      </DialogContent>
    </Dialog>
  );
}
