import type { TextareaHTMLAttributes } from 'react'
import styles from './TextArea.module.css'

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** What it is for, read by screen readers, when no visible label around it says so. */
  label?: string
  /** Mono words, for Cedar and JSON. */
  mono?: boolean
}

/** Text over several lines, in Field's frame. Drag its corner to grow it. One line is a Field's height. */
export function TextArea({ label, mono, className, ...rest }: TextAreaProps) {
  return (
    <textarea
      className={[styles.textarea, mono && styles.mono, mono ? 'eio-type-style-mono' : 'eio-type-style-body', className].filter(Boolean).join(' ')}
      aria-label={label}
      spellCheck={mono ? false : undefined}
      {...rest}
    />
  )
}
