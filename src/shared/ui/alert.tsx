import { cn } from '@shared/lib/utils'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { Icon } from './icon'
import type { TeviIconNameFilled } from './icon-names'

/**
 * Alert — Figma "Alert" (35:7643), ported 1:1.
 *
 * The DS's answer for "something went wrong, here is what to do about it": the surface is
 * identical for every status, and `status` selects only the leading glyph and its colour. That
 * is why this is one component with a prop rather than five.
 *
 * **The 0.5px ring is an inset shadow, not a border, and that is deliberate.** Figma aligns the
 * stroke *inside*, so it does not grow the frame; a real `border: 0.5px` would, and the card
 * hugs its height — Figma's 48px inline alert becomes 49px. Chromium also snaps a 0.5px border
 * to 1px at every DPR. `box-shadow: inset` costs no layout, follows the radius, and keeps the
 * padding at exactly 12/16. Do not "fix" it into a border.
 *
 * Figma draws three types: Default, Inline and Mini. Only two are here, because Inline is not a
 * different style — it is Default with no subtitle and no actions, which the composition already
 * expresses. Mini genuinely differs (smaller gap, 20px glyph, 14/regular body text).
 *
 * `status="follow"` is the one structural exception in the DS: it exists only at Default, drops
 * the glyph and the close control, centres its children, and puts the button group *beside* the
 * title instead of under it — hence `AlertAside` rather than `AlertActions`.
 */
export type AlertStatus = 'info' | 'success' | 'warning' | 'error' | 'follow'
export type AlertType = 'default' | 'mini'

/**
 * Figma fixes the glyph per status; a caller does not get to choose it.
 *
 * Typed as `TeviIconNameFilled` rather than `TeviIconName` so that a glyph without a filled
 * weight is a compile error here, not a blank square at runtime.
 */
const STATUS_ICON: Record<Exclude<AlertStatus, 'follow'>, TeviIconNameFilled> = {
    info: 'info-circle',
    success: 'check-circle',
    warning: 'exclamation-triangle',
    error: 'xmark-circle',
}

const STATUS_COLOR: Record<AlertStatus, string> = {
    info: 'text-(--accents-indigo-active)',
    success: 'text-(--accents-success-active)',
    warning: 'text-(--accents-warning-active)',
    error: 'text-(--accents-error-active)',
    follow: 'text-(--icon-default)',
}

export type AlertProps = ComponentPropsWithoutRef<'div'> & {
    status: AlertStatus
    type?: AlertType
}

function Alert({ className, status, type = 'default', ...props }: AlertProps) {
    return (
        <div
            data-slot="alert"
            data-status={status}
            data-type={type}
            className={cn(
                'flex w-full border-0 border-solid border-transparent rounded-[var(--radius-xl)] bg-(--background-surface)',
                'shadow-[inset_0_0_0_0.5px_var(--button-secondary-border),var(--shadow-md)]',
                // `follow` centres its row; every other status aligns to the top so a long
                // subtitle does not drag the glyph down the card.
                status === 'follow' ? 'items-center' : 'items-start',
                type === 'mini' ? 'gap-2 p-3' : 'gap-3 py-3 ps-3 pe-4',
                className,
            )}
            {...props}
        />
    )
}

/**
 * The leading glyph. Renders nothing for `status="follow"`, which has none in Figma.
 *
 * Size follows the type — 24 at Default, 20 at Mini — so it is read from the same prop rather
 * than passed separately and allowed to disagree.
 */
function AlertIcon({
    status,
    type = 'default',
    className,
    ...props
}: Omit<ComponentPropsWithoutRef<'span'>, 'children'> & {
    status: AlertStatus
    type?: AlertType
}) {
    if (status === 'follow') return null
    return (
        <span
            data-slot="alert-icon"
            className={cn('flex flex-none', STATUS_COLOR[status], className)}
            {...props}
        >
            <Icon name={STATUS_ICON[status]} weight="filled" size={type === 'mini' ? 20 : 24} />
        </span>
    )
}

/** Figma "Title and Subtitle" — gap 0, vertically centred, and the column that flexes. */
function AlertContent({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="alert-content"
            className={cn('flex min-w-0 flex-1 flex-col justify-center gap-0', className)}
            {...props}
        />
    )
}

function AlertTitle({
    className,
    type = 'default',
    ...props
}: ComponentPropsWithoutRef<'p'> & { type?: AlertType }) {
    return (
        <p
            data-slot="alert-title"
            className={cn(
                type === 'mini'
                    ? 'type-dense-default text-(--text-body)'
                    : 'type-body-emphasis text-(--text-title)',
                className,
            )}
            {...props}
        />
    )
}

function AlertSubtitle({ className, ...props }: ComponentPropsWithoutRef<'p'>) {
    return (
        <p
            data-slot="alert-subtitle"
            className={cn('type-dense-default text-(--text-subtitle)', className)}
            {...props}
        />
    )
}

/** Figma "Button Group" under the text: padding-top 8, gap 12, wraps. */
function AlertActions({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="alert-actions"
            className={cn('flex flex-wrap items-start gap-3 pt-2', className)}
            {...props}
        />
    )
}

/** `status="follow"`'s button group, which sits beside the title with no top padding. */
function AlertAside({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
    return (
        <div
            data-slot="alert-aside"
            className={cn('flex flex-none items-center gap-3', className)}
            {...props}
        />
    )
}

/**
 * A bare 24px xmark in Text/Text - Body.
 *
 * `aria-label` is required rather than optional: an icon-only button with no accessible name is
 * an unlabelled control, and this one is the only way to dismiss the alert.
 */
function AlertClose({
    className,
    children,
    'aria-label': ariaLabel,
    ...props
}: ComponentPropsWithoutRef<'button'> & { 'aria-label': string; children?: ReactNode }) {
    return (
        <button
            type="button"
            data-slot="alert-close"
            aria-label={ariaLabel}
            className={cn(
                'flex size-[24px] flex-none items-center justify-center rounded-[var(--radius-sm)] border-0 bg-transparent p-0 text-(--text-body)',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                className,
            )}
            {...props}
        >
            {children ?? <Icon name="xmark" size={24} />}
        </button>
    )
}

export { Alert, AlertActions, AlertAside, AlertClose, AlertContent, AlertIcon, AlertSubtitle, AlertTitle }
