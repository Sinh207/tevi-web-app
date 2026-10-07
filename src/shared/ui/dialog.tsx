'use client'

import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { subTestId, type TestIdProps } from '@shared/lib/test-id'
import { cn } from '@shared/lib/utils'

/**
 * Dialog — Figma `Dialog` 50:15797, and `Sheet/_Overlay` 40:9676 for the scrim.
 *
 * Geometry straight from the design system: 370 wide, `--radius-2xl` (24px), a 1px
 * inside stroke, `--background-subtle` surface, scrim `--overlay-default`. The
 * button row is `SheetButtonGroup` 50:12963 — gap 8, children filling, stacked or
 * side-by-side.
 *
 * Behaviour (focus trap, scroll lock, `Esc`, restoring focus on close) comes from
 * base-ui rather than being hand-rolled: it is the same primitive layer the rest of
 * `shared/ui` builds on, and a modal that gets focus management wrong is unusable
 * with a keyboard or a screen reader.
 */

export const Dialog = BaseDialog.Root
export const DialogTrigger = BaseDialog.Trigger
export const DialogClose = BaseDialog.Close

export function DialogOverlay({ className, ...props }: BaseDialog.Backdrop.Props) {
    return (
        <BaseDialog.Backdrop
            className={cn(
                'fixed inset-0 z-50 bg-overlay-default',
                'transition-opacity duration-200',
                'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
                className,
            )}
            {...props}
        />
    )
}

/**
 * `data-testid` is forwarded to the backdrop as `${testId}-overlay`.
 *
 * The scrim is the one part of this component a caller cannot reach: it is rendered here, not
 * passed in. "Press outside to dismiss" is a real QC step and `fixed inset-0` is a real click
 * target, but a driver needs an element to aim at. No prop *name* is added — the attribute is one
 * the caller already passes — and a design-system re-sync of this file does not have to reconcile
 * it. Same category as `button.tsx`'s `rendersNativeButton`: derive it once here rather than ask
 * every call site to remember. Contract: `docs/TEST_IDS.md`.
 */
export function DialogContent({
    className,
    children,
    nested,
    ...props
}: BaseDialog.Popup.Props &
    TestIdProps & {
        /**
         * This dialog opens **over another dialog**.
         *
         * Two effects, and they are one decision: the backdrop is rendered (Base UI omits it when
         * nested, which is what broke outside-press dismissal) and it is **transparent** (two
         * `--overlay-default` scrims compound to ~0.94 and the dialog behind all but disappears).
         * The note on the backdrop below has the measurements.
         *
         * A prop rather than something derived, because Base UI publishes no nesting flag on the
         * backdrop and the caller is the one party that knows for certain.
         */
        nested?: boolean
    }) {
    return (
        <BaseDialog.Portal>
            <DialogOverlay
                /*
                 * ⚠ **`forceRender`, and without it a nested dialog cannot be dismissed by
                 * pressing outside it.**
                 *
                 * Base UI renders no backdrop for a nested dialog by default — sensible on its own
                 * terms, since two scrims would double the dimming. But the backdrop is also the
                 * **hit target** outside-press dismissal needs: with none of its own, the press
                 * lands on the *parent's* backdrop, which Base UI has marked `inert` and
                 * `aria-hidden` precisely because a modal is open above it. The press reaches
                 * nothing and neither dialog closes.
                 *
                 * Measured: all five popups over the post composer stayed open on an outside
                 * press, while the composer itself — not nested, so it has its own backdrop —
                 * closed.
                 *
                 * `modal="trap-focus"` on the child fixes the press and breaks something worse:
                 * the press then reaches the parent too, so one click outside a settings dialog
                 * threw the draft behind it away.
                 *
                 * `nested` also makes it **transparent**, which is the half Base UI was right
                 * about: two `--overlay-default` scrims compound to about 0.94 and the dialog
                 * behind is all but gone. The forced backdrop is a hit target, not a second scrim.
                 */
                forceRender
                className={nested ? 'bg-transparent' : undefined}
                data-testid={subTestId(props['data-testid'], 'overlay')}
            />
            <BaseDialog.Popup
                className={cn(
                    'fixed top-1/2 start-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2',
                    'flex w-[370px] max-w-[calc(100vw-2rem)] flex-col',
                    /*
                     * The DS card's 24 inset and 20 gap from `sm` up; **16 / 16 below it**, where the
                     * card already sits 16px off each bezel and a 24 inside it left a 390px phone
                     * 308px of text. Written through two variables rather than `p-4 sm:p-6`, and
                     * that is the point: `twMerge` drops a base `p-4` for a call site's `p-0` but
                     * keeps `sm:p-6` beside it, so every screen-style dialog would grow 24px of
                     * padding from `sm`. One `p-(--dialog-pad)` is one class to override. A body
                     * that bleeds through the inset (`-mx-(--dialog-pad)`) reads the same variable.
                     */
                    'gap-(--dialog-gap) p-(--dialog-pad) [--dialog-gap:16px] [--dialog-pad:16px]',
                    'sm:[--dialog-gap:20px] sm:[--dialog-pad:24px]',
                    /*
                     * A height cap to match the width cap, and `auto` so what does not fit can be
                     * reached.
                     *
                     * Without it a tall popup overflows **both** edges of a short viewport with
                     * `overflow: visible` — measured on a 740×420 landscape phone: `top: -16`,
                     * `bottom: 436`. The footer button and anything above the fold are then not
                     * off-screen but *unreachable*, which is the kind of break that never shows in a
                     * portrait screenshot. Ten of this app's dialogs had already worked around it
                     * with their own `max-h`; seventeen had not.
                     *
                     * `dvh`, not `vh`: a mobile browser's `vh` excludes the address bar, which is
                     * the ~60px that decides this on exactly the devices it breaks on.
                     *
                     * A call site that scrolls its own body still says so — `max-h-[min(88vh,720px)]
                     * overflow-hidden` is the pattern, and `twMerge` lets both win over these.
                     */
                    'max-h-[calc(100dvh-2rem)] overflow-y-auto',
                    'rounded-2xl border border-separator-default bg-background-subtle',
                    'shadow-2xl outline-none',
                    // `scale`, not `transform`: Tailwind v4's `scale-*` set the `scale`
                    // property, so naming `transform` here transitioned nothing and the
                    // popup's scale-in was a hard snap under a fading overlay.
                    'transition-[opacity,scale] duration-200',
                    'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
                    'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
                    className,
                )}
                {...props}
            >
                {children}
            </BaseDialog.Popup>
        </BaseDialog.Portal>
    )
}

/** `Dialog/Text` — title + subtitle, centred, gap 4. */
export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
    return <div className={cn('flex flex-col items-center gap-1 text-center', className)} {...props} />
}

export function DialogTitle({ className, ...props }: BaseDialog.Title.Props) {
    return (
        <BaseDialog.Title
            className={cn('type-body-strong text-text-title', className)}
            {...props}
        />
    )
}

export function DialogDescription({ className, ...props }: BaseDialog.Description.Props) {
    return (
        <BaseDialog.Description
            className={cn('type-dense-default text-text-body', className)}
            {...props}
        />
    )
}

/**
 * `SheetButtonGroup` 50:12963 — gap 8, children fill.
 *
 * ## "Fill" is the **cross** axis, and reading it as `flex-1` squashed every stacked footer
 *
 * This applied `[&>*]:flex-1` to both layouts. In `side-by-side` that is right: a row's main axis is
 * horizontal, so the children share the width. In `stacked` the main axis is **vertical**, so the
 * same class made each button `flex: 1 1 0%` in height — its own `h-12` was overridden by a share of
 * whatever space the column happened to have, and a `size="large"` button measured **26px**.
 *
 * It went unnoticed because the only stacked footers in the app were single-button ones inside
 * dialogs tall enough to look plausible, and `ConfirmDialog` — the component that would have shown it
 * at a glance — is `side-by-side`. Found by measuring a rendered button rather than by reading, which
 * is the only way a layout bug that produces a *smaller correct-looking button* ever surfaces.
 *
 * So each layout now fills the axis it actually has: width in a column, main-axis share in a row.
 */
export function DialogFooter({
    layout = 'stacked',
    className,
    ...props
}: React.ComponentProps<'div'> & { layout?: 'stacked' | 'side-by-side' }) {
    return (
        <div
            className={cn(
                'flex gap-2',
                layout === 'stacked' ? 'flex-col [&>*]:w-full' : 'flex-row [&>*]:flex-1',
                className,
            )}
            {...props}
        />
    )
}
