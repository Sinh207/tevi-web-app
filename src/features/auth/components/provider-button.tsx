'use client'

import { cn } from '@shared/lib/utils'
import { Icon } from '@shared/ui/icon'
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
 * Email + password, wearing the same row as the providers — it is one of the ways in, and
 * both legacy and the native app list it among them rather than apart from them.
 */
export function EmailProviderButton({
    label,
    onClick,
    disabled,
    testId,
    providerKey,
}: {
    label: string
    onClick: () => void
    disabled?: boolean
    /** Shared across every way in — see the note on `ProviderButton`. */
    testId?: string
    providerKey?: string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            data-testid={testId}
            data-provider-key={providerKey}
            className={providerShellClass('row')}
        >
            <ProviderRowInner
                // No plate behind this one in either mode: a plate is what makes an
                // unrecolourable trademark legible, and this glyph is ours and already
                // follows the theme. The 32px box is only so it occupies the same column
                // as the marks above and below it.
                //
                // `send`, standing in for the envelope the native app draws: icons come only
                // from the DS sprite (`/dev/icons`), which has no envelope, letter or `@` —
                // the same stand-in as every other email step in this app. A hand-drawn
                // envelope lived here until that rule was made absolute.
                mark={
                    <span className="flex size-8 shrink-0 items-center justify-center">
                        <Icon name="send" size={24} />
                    </span>
                }
                label={label}
            />
        </button>
    )
}

/**
 * QR sign-in, wearing the same row as the providers.
 *
 * It is one of the ways in and legacy lists it first among them (`containers/login`), so it gets
 * the row rather than a link under the stack.
 *
 * The glyph is the DS's own `qr-code`, not a brand mark, so it takes no plate: plates exist to
 * make an unrecolourable third-party trademark legible on a dark surface, and this one is
 * `currentColor` and follows the theme by itself. The 32px box is only so it occupies the same
 * column as the marks above and below it — the same reason `EmailProviderButton` has one.
 */
export function QrProviderButton({
    label,
    onClick,
    disabled,
    className,
    testId,
    providerKey,
}: {
    label: string
    onClick: () => void
    disabled?: boolean
    className?: string
    testId?: string
    providerKey?: string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            data-testid={testId}
            data-provider-key={providerKey}
            /*
             * `hidden sm:flex` is applied by the caller, so this row is in the DOM and CSS-hidden on
             * a phone. `data-viewport` says so out loud, rather than letting a driver discover it as
             * an "element not interactable" error that reads like a broken app.
             */
            data-viewport="sm-up"
            className={cn(providerShellClass('row'), className)}
        >
            <ProviderRowInner
                mark={
                    <span className="flex size-8 shrink-0 items-center justify-center">
                        <Icon name="qr-code" size={24} />
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
    testId,
    providerKey,
}: {
    variant: ProviderVariant
    mark: ProviderMarkName
    label: string
    onClick: () => void
    disabled?: boolean
    /** This one is the attempt in flight — the others are merely disabled behind it. */
    pending?: boolean
    /**
     * **One testid for every way in, with the provider in `data-provider-key`.** So a suite finds
     * the whole set with `[data-testid='auth-provider']` and one row with
     * `…[data-provider-key='google']`, and a provider dropping out because its client id is
     * unconfigured is a shorter list rather than a missing selector.
     *
     * Which is in flight is `aria-busy`, not a different id: the pressed row stays visually enabled
     * on purpose (see the `pending` note below), and encoding it in the id would make "is Apple
     * working?" a question you can only ask while the answer is yes.
     */
    testId?: string
    providerKey?: string
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
            data-testid={testId}
            data-provider-key={providerKey}
            data-variant={variant}
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
