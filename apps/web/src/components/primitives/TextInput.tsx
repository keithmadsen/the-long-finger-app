import type {
  ChangeEventHandler,
  ComponentPropsWithoutRef,
  KeyboardEvent,
  Ref,
} from 'react'

import styles from './TextInput.module.css'

type NativeTextInputProps = Omit<
  ComponentPropsWithoutRef<'input'>,
  'onChange' | 'onSubmit' | 'ref' | 'type' | 'value'
>

export type TextInputProps = NativeTextInputProps & {
  value: string
  onChange: ChangeEventHandler<HTMLInputElement>
  onSubmit?: (value: string) => void
  ref?: Ref<HTMLInputElement>
}

export function TextInput({
  className,
  onKeyDown,
  onSubmit,
  value,
  ...props
}: TextInputProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event)

    if (
      event.defaultPrevented ||
      event.key !== 'Enter' ||
      event.nativeEvent.isComposing
    ) {
      return
    }

    const trimmedValue = value.trim()
    if (trimmedValue.length === 0) {
      return
    }

    onSubmit?.(trimmedValue)
  }

  return (
    <input
      {...props}
      className={[styles.input, className].filter(Boolean).join(' ')}
      onKeyDown={handleKeyDown}
      type="text"
      value={value}
    />
  )
}
