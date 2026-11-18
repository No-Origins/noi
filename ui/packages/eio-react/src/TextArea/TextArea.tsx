import type { TextareaHTMLAttributes } from 'react'
import type { TextAreaWords } from '@noi/eio-tokens/components'
import styles from './TextArea.module.css'

// Each kind of words Mero holds for TextArea (Component States, agreed 18 Nov).
const WORDS: Record<TextAreaWords, string> = { body: 'eio-type-style-body', mono: `${styles.mono} eio-type-style-mono` }

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
      className={[styles.textarea, WORDS[mono ? 'mono' : 'body'], className].filter(Boolean).join(' ')}
      aria-label={label}
      spellCheck={mono ? false : undefined}
      {...rest}
    />
  )
}
