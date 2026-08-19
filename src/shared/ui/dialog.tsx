'use client'

import { Dialog as BaseDialog } from '@base-ui/react/dialog'
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

export function DialogContent({
    className,
    children,
    ...props
}: BaseDialog.Popup.Props) {
    return (
        <BaseDialog.Portal>
            <DialogOverlay />
            <BaseDialog.Popup
                className={cn(
                    'fixed top-1/2 start-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rtl:translate-x-1/2',
                    'flex w-[370px] max-w-[calc(100vw-2rem)] flex-col gap-5 p-6',
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

/** `SheetButtonGroup` 50:12963 — gap 8, children fill. */
export function DialogFooter({
    layout = 'stacked',
    className,
    ...props
}: React.ComponentProps<'div'> & { layout?: 'stacked' | 'side-by-side' }) {
    return (
        <div
            className={cn(
                'flex gap-2 [&>*]:flex-1',
                layout === 'stacked' ? 'flex-col' : 'flex-row',
                className,
            )}
            {...props}
        />
    )
}
