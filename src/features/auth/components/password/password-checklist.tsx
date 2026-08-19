'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { POP } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
import {
    PASSWORD_MAX_LENGTH,
    PASSWORD_MIN_LENGTH,
    PASSWORD_RULE_COUNT,
    PASSWORD_RULE_KEYS,
    PASSWORD_SYMBOLS,
    type PasswordChecks,
    passwordScore,
} from '../../lib/password-policy'

/**
 * What the password still needs, and how close it is.
 *
 * Legacy renders the same list (`components/changePassword/newPassword`) as grey text with
 * a bullet that becomes a green tick. Two things are added here and one is fixed:
 *
 * - **The bar.** Three segments, one per rule, so "how much is left" is answerable at a
 *   glance instead of by reading three lines. It reports rules met — not strength, which no
 *   client-side heuristic can honestly claim (see `lib/password-policy.ts`).
 * - **The tick pops.** A requirement being satisfied is an event, so it gets the DS curve
 *   rather than appearing between frames. `key` on the icon is what replays it: React would
 *   otherwise reuse the element and the animation would run once, on mount.
 * - **Fixed:** legacy's charset rule is invisible — folded into the complexity line — so a
 *   password with a `$` in it fails a requirement that appears to be met. It is its own row.
 *
 * The list is the accessible surface; the bar is `aria-hidden` because it says nothing the
 * rows do not. Neither is a live region: it would announce on every keystroke, and the
 * rows are there to be read whenever the user asks for them.
 */

/**
 * `#?!@` spaced out. Run together they read as one token and are hard to pick apart at
 * caption size — and a locale that reorders the sentence still gets them as one unit.
 */
const SYMBOL_LIST = PASSWORD_SYMBOLS.split('').join(' ')

const SEGMENT_TONE = (score: number) => {
    if (score >= PASSWORD_RULE_COUNT) return 'bg-(--accents-success-active)'
    if (score <= 1) return 'bg-(--accents-error-active)'
    return 'bg-(--accents-warning-active)'
}

export function PasswordChecklist({
    checks,
    className,
}: {
    checks: PasswordChecks
    className?: string
}) {
    const { t } = useTranslation()
    const score = passwordScore(checks)

    const rules: { key: keyof PasswordChecks; label: string }[] = [
        {
            key: 'length',
            label: t(PASSWORD_RULE_KEYS.length, {
                min: PASSWORD_MIN_LENGTH,
                max: PASSWORD_MAX_LENGTH,
            }),
        },
        {
            key: 'complexity',
            label: t(PASSWORD_RULE_KEYS.complexity, { symbols: SYMBOL_LIST }),
        },
        {
            key: 'charset',
            label: t(PASSWORD_RULE_KEYS.charset, { symbols: SYMBOL_LIST }),
        },
    ]

    return (
        <div className={cn('flex flex-col gap-2', className)}>
            {/* One segment per rule, keyed by the rule rather than by its position — a
                position is not an identity, and React reuses elements by key, so an index
                would hand one segment's in-flight colour transition to another rule if the
                list ever changed.

                Filled left to right by *count*, not by which rule each segment stands for:
                the rows below say which, and a bar with a gap in the middle reads as a
                rendering fault rather than as information. */}
            <div aria-hidden className="flex gap-1">
                {rules.map((rule, i) => (
                    <span
                        key={rule.key}
                        className={cn(
                            'h-1 flex-1 rounded-full',
                            'transition-colors duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                            i < score ? SEGMENT_TONE(score) : 'bg-(--separator-default)',
                        )}
                    />
                ))}
            </div>

            <ul className="flex list-none flex-col gap-1 p-0">
                {rules.map(rule => {
                    const met = checks[rule.key]
                    return (
                        <li key={rule.key} data-met={met} className="flex items-start gap-1.5">
                            {/*
                             * A fixed 16px slot, so the tick can scale inside it without
                             * moving the label — `POP` animates `scale`, which reflows
                             * anything whose box is not already reserved.
                             */}
                            <span className="flex size-4 shrink-0 items-center justify-center">
                                {met ? (
                                    <Icon
                                        key="met"
                                        name="check"
                                        weight="filled"
                                        size={16}
                                        aria-hidden
                                        className={cn('text-(--accents-success-active)', POP)}
                                    />
                                ) : (
                                    <span
                                        aria-hidden
                                        className="size-1 rounded-full bg-(--text-subtitle)"
                                    />
                                )}
                            </span>
                            <span
                                className={cn(
                                    'type-caption-meta transition-colors',
                                    met ? 'text-(--text-body)' : 'text-(--text-subtitle)',
                                )}
                            >
                                {rule.label}
                                {/* The tick is decorative, so the state has to be said in
                                    words for anyone who cannot see it. */}
                                <span className="sr-only">
                                    {` — ${t(met ? 'password_rule_met' : 'password_rule_unmet')}`}
                                </span>
                            </span>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
