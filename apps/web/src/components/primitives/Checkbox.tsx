import type { ChangeEvent, ComponentPropsWithoutRef, Ref } from 'react'

import styles from './Checkbox.module.css'

type NativeCheckboxProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'checked' | 'onChange' | 'ref' | 'type' | 'value'
>

export type CheckboxProps = NativeCheckboxProps & {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  rootAsLabel?: boolean
  ref?: Ref<HTMLInputElement>
}

export function Checkbox({
  checked,
  className,
  onCheckedChange,
  rootAsLabel = true,
  ...props
}: CheckboxProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    // Adapt the native onChange to the Radix-aligned onCheckedChange surface,
    // reporting the input's resulting boolean state. Keeping the public API on
    // `checked`/`onCheckedChange` makes a future swap to Radix.Checkbox a
    // one-file change.
    onCheckedChange?.(event.target.checked)
  }

  const Root = rootAsLabel ? 'label' : 'span'

  return (
    <Root className={[styles.root, className].filter(Boolean).join(' ')}>
      <input
        {...props}
        checked={checked}
        className={styles.input}
        onChange={handleChange}
        type="checkbox"
      />
      <span aria-hidden="true" className={styles.indicator} />
    </Root>
  )
}
