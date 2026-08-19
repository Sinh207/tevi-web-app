'use client'

import { cn } from '@shared/lib/utils'
import { ProviderMark, type ProviderMarkName } from './provider-marks'

/**
 * A provider, in one of two weights.
 *
 * `row` is a labelled full-width button. The name does the work: nobody has to recognise a
 * mark before they can get in, and it is the only shape that can carry email — the mark
 * there is one we drew, so unlabelled it would be the one button nobody recognises.
 *
 * `tile` is the same button with the label removed and the width shared, for the providers
 * demoted below the fold of attention. Eight identical labelled rows rank nothing: the eye
 * has to read all eight to choose, and the choice most people want is in the first two.
 * Splitting them says which is which.
 *
 * They are deliberately the *same* shape — same height, border, radius and surface, only
 * the label and the width differ. An earlier version made the demoted set 44px circles;
 * that put two visual languages on one card for no reason, since nothing else on the page
 * is a circle.
 */

/** Google's SDK will not render a button wider than this. */
export const PROVIDER_ROW_MAX_WIDTH = 400

/**
 * The DS secondary button, in legacy's geometry: 48 tall, 12 radius, 1px border, 16/600.
 *
 * The surface is the **`--button-secondary-*` ramp**, not hand-picked background tokens.
 * Hand-picked is what it was, and it was wrong twice: the border used `separator-default`
 * (`zinc-200`) where the DS specifies `separator-strong` (`zinc-300`), which against a
 * `zinc-100` fill is almost invisible — and hover went to `background-elevated`, which is
 * `--white`, which is the **card's own colour**. Pointing at a button made it dissolve into
 * the card. The ramp hovers to `zinc-200`: darker, as a raised control should.
 */
const shellClass = cn(
    // Tailwind v4's preflight leaves `<button>` at the browser default `cursor: default`;
    // v3 did not. Every other DS control carries this — `button.tsx` had lost it too.
    'type-body-strong relative flex h-12 cursor-pointer items-center gap-3 rounded-lg border',
    'border-(--button-secondary-border) bg-(--button-secondary-bg) text-(--button-secondary-text)',
    'transition-colors hover:not-disabled:bg-(--button-secondary-bg-hover)',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--input-border-focus)',
    'disabled:cursor-not-allowed disabled:bg-(--button-secondary-bg-disabled) disabled:text-(--button-secondary-text-disabled)',
)

export type ProviderVariant = 'row' | 'tile'

/**
 * Which page the buttons are on. Every provider both signs in and registers, so this
 * changes only the wording — but the wording is the whole reason someone on `/signup`
 * believes the button is for them.
 */
export type AuthMode = 'sign-in' | 'sign-up'

/** The translation key for a labelled row, given the mode. */
export const providerLabelKey = (mode: AuthMode) =>
    mode === 'sign-up' ? 'auth_sign_up_with' : 'auth_sign_in_with'

export const providerShellClass = (variant: ProviderVariant) =>
    cn(
        shellClass,
        variant === 'row'
            ? 'w-full justify-start px-4'
            : // `min-w-0` so four tiles divide the card evenly instead of each insisting on
              // its content width and pushing the last one out.
              'min-w-0 flex-1 justify-center',
    )

/**
 * The in-flight indicator.
 *
 * Not a DS glyph — this is motion, not an icon, and the sprite has nothing that spins.
 * `currentColor` so it inherits whatever the surface it lands on gives it.
 */
export function Spinner({ className }: { className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                'size-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60',
                className,
            )}
        />
    )
}

/**
 * The inside of a labelled row: mark at a fixed inset, label centred on the button.
 *
 * The trailing box is empty and exists only to mirror the mark's width. Without it the
 * mark and label are one centred group, so the mark's x depends on how long the label is —
 * Apple's landed 14px right of Facebook's, and a column of marks that does not line up is
 * most of what "looks unfinished" means here. Product Hunt pins the mark and centres the
 * label for the same reason.
 *
 * `flex-1 min-w-0` rather than absolute positioning: a long label (German, or X's
 * parenthetical) then wraps or shrinks instead of overflowing a fixed box.
 */
export function ProviderRowInner({
    mark,
    label,
    pending,
}: {
    mark: React.ReactNode
    label: string
    pending?: boolean
}) {
    return (
        <>
            {mark}
            <span className="min-w-0 flex-1 text-center">{label}</span>
            {/* The spinner lives in the mirror box, which was already there and empty. So
                the row says it is working without the mark moving, the label shifting or
                the button changing height — and the thing that identifies *which* provider
                is being waited on stays on screen, which a spinner laid over the mark
                would have removed. */}
            <span className="flex size-8 shrink-0 items-center justify-center">
                {pending && <Spinner />}
            </span>
        </>
    )
}

/**
 * A brand mark, on a light plate **in dark mode only**.
 *
 * These marks are third-party trademarks drawn for a light background, and three of them
 * (Apple, X, TikTok) are solid black — on a dark surface they disappear. Recolouring or
 * inverting a trademark is not ours to do, and special-casing "invert these three" is a
 * list that goes stale the moment a brand refreshes its logo.
 *
 * So the plate is keyed on **the mode**, which is one rule and cannot go stale, rather than
 * on which brands happen to be black today. In light mode the button is already `zinc-100`
 * and every mark reads on it, so a pure-white square behind each one is a sticker stuck to
 * a grey button — which is what it looked like. In dark mode it is the only thing making
 * three of the eight visible at all.
 *
 * `--white` is mode-invariant, so the dark case is stable rather than a light-mode token
 * leaking through.
 *
 * The marks themselves are inline — `provider-marks.tsx` says why.
 */
export function ProviderIcon({ name }: { name: ProviderMarkName }) {
    return (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg dark:bg-(--white)">
            <ProviderMark name={name} />
        </span>
    )
}

/**
 * ⚠ **A local mark, deliberately outside the design system.**
 *
 * The email row needs an envelope and the DS has none: 554 glyphs, checked against
 * `design-system/tevi-icons.svg` itself, with no envelope, letter or `@` among them. The
 * CDN that serves the provider marks 404s on `icon-email.svg` too, and legacy takes its
 * `@` from MUI, which this app does not ship. So the choice was an envelope drawn here or
 * no envelope at all, and the native app — which has one — is the parity target.
 *
 * It lives **here, not in the sprite**. `design-system/tevi-icons.svg` is the upstream
 * artefact `pnpm icons` subsets from; a glyph added to it would be overwritten on the next
 * run and would fail `sprite.test.ts` before that. Keeping it in the feature that needs it
 * makes it obvious this is not a DS icon, and makes it one deletion when the DS ships one.
 *
 * Geometry follows the native app's: a rounded rectangle with the flap as a single chevron,
 * on the sprite's own 24px box and 1.5 stroke so it sits at the same weight as the marks
 * either side of it. `currentColor`, so it follows the label through both themes.
 */
function EnvelopeMark() {
    return (
        <svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            className="shrink-0"
        >
            <rect x="2.75" y="5.25" width="18.5" height="13.5" rx="2.5" />
            <path d="M4.5 8 12 13.25 19.5 8" />
        </svg>
    )
}

/**
 * Email + password, wearing the same row as the providers — it is one of the ways in, and
 * both legacy and the native app list it among them rather than apart from them.
 */
export function EmailProviderButton({
    label,
    onClick,
    disabled,
}: {
    label: string
    onClick: () => void
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={providerShellClass('row')}
        >
            <ProviderRowInner
                // No plate behind this one in either mode: a plate is what makes an
                // unrecolourable trademark legible, and this mark is ours and already
                // follows the theme. The 32px box is only so it occupies the same column
                // as the marks above and below it.
                mark={
                    <span className="flex size-8 shrink-0 items-center justify-center">
                        <EnvelopeMark />
                    </span>
                }
                label={label}
            />
        </button>
    )
}

export function ProviderButton({
    variant,
    mark,
    label,
    onClick,
    disabled,
    pending,
}: {
    variant: ProviderVariant
    mark: ProviderMarkName
    label: string
    onClick: () => void
    disabled?: boolean
    /** This one is the attempt in flight — the others are merely disabled behind it. */
    pending?: boolean
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            // On a tile the mark is all there is, so the name moves to `aria-label` and to
            // a `title` for anyone who does not recognise it. On a row it is already on
            // screen, and repeating it would have a screen reader say it twice.
            aria-label={variant === 'tile' ? label : undefined}
            aria-busy={pending || undefined}
            title={variant === 'tile' ? label : undefined}
            className={cn(
                providerShellClass(variant),
                // The one that is working is disabled too — a second press would start a
                // second popup — but it must not *look* disabled, or the row you just
                // pressed greys out exactly like the six you did not, and the spinner is
                // the only thing left saying which is which. `cn` is tailwind-merge, so
                // these replace the DS disabled colours rather than racing them.
                pending &&
                    'disabled:bg-(--button-secondary-bg) disabled:text-(--button-secondary-text)',
            )}
        >
            {variant === 'row' ? (
                <ProviderRowInner
                    mark={<ProviderIcon name={mark} />}
                    label={label}
                    pending={pending}
                />
            ) : (
                // A tile has no room for a mark and a spinner side by side, so here the
                // spinner takes the mark's place. Nothing is lost: a tile is one of four,
                // and the one that is working is the one you just pressed.
                <span className="flex size-8 shrink-0 items-center justify-center">
                    {pending ? <Spinner /> : <ProviderIcon name={mark} />}
                </span>
            )}
        </button>
    )
}
