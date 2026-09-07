'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
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
    invalid,
    spread,
    testId = 'auth-otp',
}: {
    value: string
    onChange: (next: string) => void
    length?: number
    disabled?: boolean
    autoFocus?: boolean
    /**
     * The code was rejected — tints the boxes and marks them `aria-invalid`.
     *
     * A prop rather than the caller styling around the component, because the caller cannot reach
     * the boxes; and it takes a boolean rather than the message, because the message belongs where
     * every other error in this repo puts it — one `role="alert"` line the caller owns, not six
     * copies of it in the accessibility tree.
     *
     * ⚠ **Do not use this to mean "incomplete".** The boxes are empty until they are typed into;
     * marking a half-typed code invalid tells a screen reader something is wrong with a field
     * nobody has finished using.
     */
    invalid?: boolean
    /**
     * The scope this instance belongs to, for `data-testid`. Defaults to the sign-in flows' `auth-otp`
     * — the value every existing caller was already emitting — so a second surface can be addressed
     * separately without the first one's ids moving under QC's feet.
     */
    testId?: string
    /**
     * Spread the boxes across the row instead of centring them.
     *
     * ⚠ **Declared last on purpose.** `scripts/check-testids.mjs` decides whether a component can
     * receive a `testId` by looking for it in the **first 1400 characters** after the declaration —
     * and `stripComments` blanks comments to spaces rather than removing them, so a docblock counts
     * toward that budget. This prop sat above `testId` for one commit and pushed it out of the
     * window, which reported every `<OtpInput testId=…>` in the repo as a silently dropped
     * attribute. Anything added here goes below `testId`, not above it.
     *
     * The DS draws this control **space-between** over its full width (`Verification code input`,
     * Figma `1077:80583`), and so do the two-step-verification page comps over their 516px column.
     * Centred 48px boxes are the right answer inside a 420px dialog and on a 360px phone, which is
     * what every existing caller is, so that stays the default — this is the opt-in for a caller with
     * a wide column to fill.
     *
     * It only changes the *distribution*: the boxes still cap at the DS's 48 and still shrink rather
     * than overflow, which is what `min-w-0` on the fieldset is for.
     */
    spread?: boolean
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
     * the DS size, so they are **50px** wherever there is room and smaller only where there
     * is not.
     *
     * ⚠ 50, not 48 — and the digit is **18/SemiBold**, not 20. Both were off by two pixels
     * against the design system's own component set (`Verification code input`, Figma
     * `1077:80583`: 50×50 boxes, radius 8, gap 8, an 18px Semi Bold glyph at -2% tracking) and
     * against every page comp that places it. Caught measuring the two-step-verification
     * screens; corrected here rather than there, because the control is shared with the three
     * sign-in flows and two pixels of drift in the DS's most recognisable input is worth more
     * than the churn.
     */
    return (
        <fieldset
            data-testid={testId}
            dir="ltr"
            className={cn(
                'flex w-full min-w-0 items-center gap-2 border-0 p-0',
                spread ? 'justify-between' : 'justify-center',
            )}
        >
            {/* A real `<legend>`, hidden visually rather than replaced by `aria-label`:
                it is what names the group, and the heading above already says it on
                screen. `sr-only` keeps it in the accessibility tree. */}
            <legend className="sr-only">{t('auth_otp_group_label')}</legend>
            {Array.from({ length }, (_, index) => (
                <input
                    data-testid={subTestId(testId, 'digit')}
                    data-index={index}
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
                    // On every box, not on the group: `<fieldset>` is not a form control, so
                    // `aria-invalid` there is ignored — the boxes are what a reader lands on.
                    aria-invalid={invalid || undefined}
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
                        'type-subheading-strong h-[50px] min-w-0 max-w-[50px] flex-1 rounded-lg text-center',
                        'border border-(--input-border) bg-(--input-bg) text-(--input-text)',
                        'transition-colors hover:border-(--input-border-hover)',
                        'focus:border-(--input-border-focus) focus:outline-none',
                        'disabled:opacity-50',
                        /*
                         * Rejected: a tinted ground and an error border, matching what legacy draws
                         * (`#FFF5F5` behind a `#FF4444` edge) in DS tokens.
                         *
                         * `invalid` wins over `focus` — hence the `focus:` overrides last. Without
                         * them the box under the caret loses the tint the instant the boxes are
                         * cleared and refocused, which is the exact moment the error appears: a row
                         * of five red boxes and one that looks fine.
                         */
                        invalid &&
                            'border-(--accents-error-active) bg-(--accents-error-bg-active) focus:border-(--accents-error-active)',
                    )}
                />
            ))}
        </fieldset>
    )
}
