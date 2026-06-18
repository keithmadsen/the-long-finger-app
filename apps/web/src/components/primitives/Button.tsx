import type { ComponentPropsWithoutRef, MouseEvent, Ref } from 'react'

import styles from './Button.module.css'

type NativeButtonProps = ComponentPropsWithoutRef<'button'>

export type ButtonProps = NativeButtonProps & {
  pending?: boolean
  ref?: Ref<HTMLButtonElement>
}

function isAriaDisabled(value: NativeButtonProps['aria-disabled']) {
  return value === true || value === 'true'
}

export function Button({
  className,
  onClick,
  pending = false,
  type = 'button',
  ...props
}: ButtonProps) {
  const ariaDisabled = isAriaDisabled(props['aria-disabled'])
  const isGuarded = pending || ariaDisabled

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (isGuarded) {
      event.preventDefault()
      return
    }

    onClick?.(event)
  }

  return (
    <button
      {...props}
      aria-busy={pending ? true : props['aria-busy']}
      className={[styles.button, className].filter(Boolean).join(' ')}
      data-pending={pending ? 'true' : undefined}
      onClick={handleClick}
      type={type}
    />
  )
}
