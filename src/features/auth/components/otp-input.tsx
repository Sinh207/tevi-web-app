'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { useEffect, useRef } from 'react'

/**
 * A one-time code as one box per digit.
 *
 * Controlled by a single string of digits — the boxes are a *view* of `value`, never six
 * independent states. And the string has **no gaps**: it is always a prefix, `''` through
 * `'123456'`, so box `i` shows `value[i]` and nothing else.
 *
 * That constraint is the whole design. Modelling a gap (box 1 and box 3 filled, box 2
 * empty) needs a placeholder inside the string, and then a code that *looks* half-typed
 * measures a full six characters — long enough for the caller to submit `"12 456"` to the
 * backend. Keeping it a prefix makes "complete" simply `value.length === length`.
 *
 * The other things easy to get wrong here:
 *
 * - **Paste and autofill must fill every box.** A pasted `123456`, or an SMS autofill
 *   dropping all six characters into whichever box has focus, arrives as one `change` with
 *   a long value. The naive `maxLength={1}` reading lets the browser truncate it and five
 *   digits are gone — the most common failure in this control, which is why there is no
 *   `maxLength` here and the handler distributes instead.
 * - **Backspace takes the last digit**, wherever focus is, and follows it back. Deleting
 *   in place would leave the gap this model exists to prevent.
 * - **`dir="ltr"` on the group.** A code is a number and must read left to right even on
 *   an Arabic page; without it box 1 sits on the right while `value[0]` is still first.
 * - **`autocomplete="one-time-code"` on the first box only** — on all six, some browsers
 *   autofill the entire code into each one.
 * - **One tab stop, not six.** The arrows and auto-advance move between the boxes, so six
 *   tab stops would only be six ways to land somewhere unexpected.
 */
export function OtpInput({
    value,
    onChange,
    length = 6,
    disabled,
    autoFocus,
}: {
    value: string
    onChange: (next: string) => void
    length?: number
    disabled?: boolean
    autoFocus?: boolean
}) {
    const { t } = useTranslation()
    const boxes = useRef<(HTMLInputElement | null)[]>([])

    /** Where typing goes: the first empty box, or the last one once it is full. */
    const caret = Math.min(value.length, length - 1)

    const focusAt = (index: number) =>
        boxes.current[Math.max(0, Math.min(length - 1, index))]?.focus()

    useEffect(() => {
        if (autoFocus) boxes.current[0]?.focus()
    }, [autoFocus])

    /**
     * Focus follows the caret. One rule, in one place, instead of a `focus()` call after
     * every mutation — those were already drifting apart, and none of them covered the
     * case that matters most: the parent clearing `value` after a rejected code. The
     * boxes emptied but the ring stayed on box 6, so the next digit appeared in box 1
     * while the user was watching the far end of the row.
     *
     * Guarded on focus already being inside the group, so this can never yank someone
     * back who has deliberately tabbed away.
     */
    useEffect(() => {
        if (!boxes.current.includes(document.activeElement as HTMLInputElement)) return
        boxes.current[caret]?.focus()
    }, [caret])

    /** Insert `text`'s digits at `start`, keeping the result a gap-free prefix. */
    const write = (start: number, text: string) => {
        const digits = text.replace(/\D/g, '')
        if (!digits) return
        // Clamped so a click on box 5 of an empty code still types into box 1 — the
        // alternative is the gap this component refuses to represent.
        const at = Math.min(start, value.length)
        onChange((value.slice(0, at) + digits).slice(0, length))
    }

    const onKeyDown = (index: number) => (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Backspace') {
            event.preventDefault()
            if (!value) return
            onChange(value.slice(0, -1))
            return
        }
        if (event.key === 'ArrowLeft') {
            event.preventDefault()
            focusAt(index - 1)
        }
        if (event.key === 'ArrowRight') {
            event.preventDefault()
            focusAt(index + 1)
        }
    }

    /**
     * `min-w-0` on the fieldset is load-bearing: a `<fieldset>` carries a UA default of
     * `min-inline-size: min-content`, which nothing here overrides, so it refuses to be
     * narrower than its six boxes however the boxes themselves are sized. Measured, it
     * stayed 328px wide inside a 264px parent — the row did not shrink, it overflowed, by
     * 6px in the dialog and 64px on a 360px phone.
     *
     * The boxes then divide whatever width there is (`flex-1 min-w-0`) and stop growing at
     * the DS size (`max-w-12`), so they are 48px wherever there is room and smaller only
     * where there is not.
     */
    return (
        <fieldset
            dir="ltr"
            className="flex w-full min-w-0 items-center justify-center gap-2 border-0 p-0"
        >
            {/* A real `<legend>`, hidden visually rather than replaced by `aria-label`:
                it is what names the group, and the heading above already says it on
                screen. `sr-only` keeps it in the accessibility tree. */}
            <legend className="sr-only">{t('auth_otp_group_label')}</legend>
            {Array.from({ length }, (_, index) => (
                <input
                    // A fixed-length positional list, never reordered or filtered: the index
                    // *is* each box's identity, and a synthetic id would only obscure that.
                    // biome-ignore lint/suspicious/noArrayIndexKey: explained above
                    key={index}
                    ref={el => {
                        boxes.current[index] = el
                    }}
                    // `text` + `inputMode`, not `type="number"`: no spinner, no silently
                    // dropped leading zero.
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    aria-label={t('auth_otp_digit_label', { index: index + 1, total: length })}
                    value={value[index] ?? ''}
                    disabled={disabled}
                    // Only the active box takes tab focus; the arrows and auto-advance move
                    // between them, so six tab stops would just be six ways to get lost.
                    tabIndex={index === caret ? 0 : -1}
                    onChange={e => write(index, e.target.value)}
                    onKeyDown={onKeyDown(index)}
                    // Always from the first box: a code is pasted whole, so starting where
                    // the caret happens to sit would drop its head.
                    onPaste={e => {
                        e.preventDefault()
                        write(0, e.clipboardData.getData('text'))
                    }}
                    onFocus={e => e.currentTarget.select()}
                    className={cn(
                        'type-title-t2-semibold h-12 min-w-0 max-w-12 flex-1 rounded-lg text-center',
                        'border border-(--input-border) bg-(--input-bg) text-(--input-text)',
                        'transition-colors hover:border-(--input-border-hover)',
                        'focus:border-(--input-border-focus) focus:outline-none',
                        'disabled:opacity-50',
                    )}
                />
            ))}
        </fieldset>
    )
}
