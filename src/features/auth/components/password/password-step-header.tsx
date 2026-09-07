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
 * ✅ **The connect-email step draws a real envelope.** It was `send` — what the step *does* rather
 * than what it is about — for as long as the Tevi library shipped no envelope and no `at`. Upstream
 * Zappicon v1.2.0 has one, so it is in `design-system/tevi-icons.extra.svg` with its provenance;
 * `PasswordSetupFlow`'s `email` step carries the note. Substituting an unrelated shape or
 * hand-drawing a path is still not an option (`CLAUDE.md`) — taking the upstream glyph the library
 * is missing is the sanctioned third way.
 */

export type StepTone = 'indigo' | 'success' | 'warning' | 'error' | 'brand'

const TONE: Record<StepTone, string> = {
    indigo: 'bg-(--accents-indigo-bg-active) text-(--accents-indigo-active)',
    success: 'bg-(--accents-success-bg-active) text-(--accents-success-active)',
    warning: 'bg-(--accents-warning-bg-active) text-(--accents-warning-active)',
    error: 'bg-(--accents-error-bg-active) text-(--accents-error-active)',
    /**
     * **The brand tint — the app's own treatment for a mark in a disc.**
     *
     * A pale brand ground with the glyph in `--text-on-brand`, which is what `TwoStepVerificationDialog`
     * and the ledger rows already do, and what the two-step-verification screens were asked for. The
     * glyphs are the sprite's **filled** drawings, so the mark reads as a solid silhouette rather than
     * an outline — note that `lock-simple` and `envelope` are `<use>` **aliases onto their `--filled`
     * ids** (`CLAUDE.md`'s sprite-alias trap), so they are already filled and naming the `--filled`
     * variant explicitly would change nothing.
     *
     * ## Why not the neutral the comps draw
     *
     * The comps (Figma `Two-step verification`, e.g. node `1075:79080`) draw a `#f4f4f4` disc with an
     * `#a1a1a1` glyph, and the literal port of that is what shipped first. It has one flaw that no
     * screenshot shows and two that measuring does:
     *
     * `--background-subtle`, the token for `#f4f4f4`, is `--zinc-100` — and the Zinc ramp **inverts**
     * between modes, so in Dark it resolves to `#18181b`, *exactly* `--background-surface`. The disc
     * was not faint there, it was **absent** (measured `rgb(24, 24, 27)` for both, a ratio of 1.00),
     * and the glyph floated on the card. `--background-segment` fixed that, but only to 1.06.
     *
     * The brand pair is better on every axis and, more to the point, **symmetric** — which a neutral
     * disc on a neutral card never was:
     *
     * | | glyph on disc | disc on card |
     * |---|---|---|
     * | brand, Light | **5.98** | **1.55** |
     * | brand, Dark | **4.99** | **1.57** |
     * | neutral, Light | 4.16 | 1.16 |
     * | neutral, Dark | 6.49 | 1.06 |
     *
     * ⚠ The tint needs its **own** ink: `--text-on-brand`, never `--text-brand`. The two are the same
     * value in Light and diverge in Dark, so the mistake passes every check a Light-only review makes.
     *
     * **It is the default**, so `/settings/password` and the two-step-verification screens carry the
     * same mark — asked for directly, and the right call regardless: they are the same kind of screen
     * (a credential flow, a step at a time), reached from the same drawer section, and a reader who
     * moves between them should not meet two different visual languages. `indigo` is what *its* comp
     * showed and is kept in the union rather than removed, since a tone is per screen by design.
     *
     * `PasswordDone` keeps `success` — a green check is saying something the brand tint would not.
     */
    brand: 'bg-(--background-brand) text-(--text-on-brand)',
}

export function PasswordStepHeader({
    icon,
    tone = 'brand',
    title,
    description,
    email,
    /** `POP` instead of `RISE` for an outcome — the success screen's mark *lands*. */
    markMotion = RISE,
    /**
     * The mark-to-text gap, for a caller whose comp measures a different one.
     *
     * `gap-4` (16) is `/settings/password`'s, and stays the default. The two-step-verification steps
     * measure **12** (`Container gap12` in Figma `1077:81293` and its siblings), which is the only
     * reason this prop exists — a 4px difference is not worth a second component, and hardcoding
     * either number would make one of the two screens wrong.
     */
    className,
}: {
    icon: IconProps
    tone?: StepTone
    title: string
    description: string
    email?: string
    markMotion?: string
    className?: string
}) {
    return (
        <div className={cn('flex flex-col gap-4', className)}>
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
