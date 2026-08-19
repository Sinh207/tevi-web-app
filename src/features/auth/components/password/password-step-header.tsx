'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { RISE, riseDelay } from '@shared/lib/motion'
import { cn } from '@shared/lib/utils'
import { Icon, type IconProps } from '@shared/ui/icon'

/**
 * The three lines every step of this screen opens with: a mark, what the step is, and what
 * it wants — plus the address it is about, once there is one.
 *
 * Legacy draws the mark as a hand-authored 56px SVG per step, with `#F4F4F4` and `#A1A1A1`
 * baked into the paths — four illustrations that are invisible in dark mode and cannot be
 * recoloured. Here it is a DS sprite glyph on a tinted disc, so it flips with the theme.
 *
 * ⚠ **The connect-email step's glyph is a compromise.** The DS sprite has no envelope and no
 * `at` — the nearest true statement is `send`, which is what the step does (it sends a code)
 * rather than what it is about. Worth a design pass; substituting an unrelated shape or
 * hand-drawing a path is not an option (`CLAUDE.md`).
 */

export type StepTone = 'indigo' | 'success' | 'warning' | 'error'

const TONE: Record<StepTone, string> = {
    indigo: 'bg-(--accents-indigo-bg-active) text-(--accents-indigo-active)',
    success: 'bg-(--accents-success-bg-active) text-(--accents-success-active)',
    warning: 'bg-(--accents-warning-bg-active) text-(--accents-warning-active)',
    error: 'bg-(--accents-error-bg-active) text-(--accents-error-active)',
}

export function PasswordStepHeader({
    icon,
    tone = 'indigo',
    title,
    description,
    email,
    /** `POP` instead of `RISE` for an outcome — the success screen's mark *lands*. */
    markMotion = RISE,
}: {
    icon: IconProps
    tone?: StepTone
    title: string
    description: string
    email?: string
    markMotion?: string
}) {
    return (
        <div className="flex flex-col gap-4">
            <span
                className={cn(
                    'flex size-14 shrink-0 items-center justify-center rounded-full',
                    TONE[tone],
                    markMotion,
                )}
            >
                {/* Decorative: the heading directly below says what the step is, so a label
                    here would only repeat it. */}
                <Icon {...icon} size={24} aria-hidden />
            </span>

            <div className={cn('flex flex-col gap-1', RISE)} style={riseDelay(1)}>
                {/* `h2`, not `h1`: the page's own `h1` is the back bar's title. */}
                <h2 className="type-title-t1-bold text-(--text-title)">{title}</h2>
                <p className="type-dense-default text-(--text-subtitle)">{description}</p>
                {/* The address is repeated on every step of the setup flow, as legacy does —
                    it is the one fact a wrong answer here hinges on, and the step that could
                    fix it is two screens back. */}
                {email && (
                    <p className="type-dense-emphasis break-all text-(--text-title)">{email}</p>
                )}
            </div>
        </div>
    )
}

/**
 * Where the setup flow is: "Step 2 of 3", with a bar that fills as it goes.
 *
 * Only the three-step *setup* flow has one. Changing an existing password is a single form,
 * and a progress indicator over one step is a decoration that says nothing.
 *
 * The bar is `aria-hidden` and the sentence beside it is the accessible version — a filled
 * rectangle is not a status. `aria-live="polite"` on the sentence, because a step advancing
 * is exactly the change a non-sighted user has no other way to notice.
 *
 * It takes the step **names** rather than a count, so each segment can be keyed by the step
 * it stands for. A position in a list is not an identity, and React reuses elements by key —
 * with an index, inserting a step would hand one segment's in-flight colour transition to a
 * different step.
 */
export function PasswordStepProgress({
    steps,
    /** The step showing now. Segments before it, and it, are filled. */
    current,
}: {
    steps: readonly string[]
    current: string
}) {
    const { t } = useTranslation()
    const index = steps.indexOf(current)

    return (
        <div className="flex flex-col gap-2">
            <div aria-hidden className="flex gap-1">
                {steps.map((step, i) => (
                    <span
                        key={step}
                        className={cn(
                            'h-1 flex-1 rounded-full',
                            'transition-colors duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                            i <= index
                                ? 'bg-(--accents-indigo-active)'
                                : 'bg-(--separator-default)',
                        )}
                    />
                ))}
            </div>
            <p aria-live="polite" className="type-caption-meta text-(--text-subtitle)">
                {t('password_step_of', { current: index + 1, total: steps.length })}
            </p>
        </div>
    )
}
