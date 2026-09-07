'use client'

import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { Icon } from '@shared/ui/icon'

/**
 * The `?` this feature hangs off a label — legacy's `IconBtnHelp`, in all three of its copies.
 *
 * Shared rather than written per dialog because the two things that make it correct are not visual:
 *
 * - **`stopPropagation` *and* `preventDefault`.** Every one of these sits inside something that is
 *   itself pressable — a `<summary>` on the withdraw detail screen, the `<label>` that *is* the option
 *   card on the request screen. `stopPropagation` keeps the press off the ancestor's handler;
 *   `preventDefault` is the load-bearing half on the card, because a label forwards a click to its
 *   control as a *default action*, so without it pressing `?` on a locked Fast card would open the help
 *   dialog **and** fire the radio's `onChange`, i.e. the Premium sell — two dialogs from one press.
 * - **An `aria-label`.** The glyph is `aria-hidden` inside a button with no text, so the dialog's own
 *   title is what names the control. Legacy ships an `IconButton` with no accessible name at all.
 *
 * Icon-only and `ghost`, so it reads as furniture beside the label rather than as an action.
 */
export function PayoutHelpButton({
    label,
    onPress,
    iconSize = 16,
    testId,
    className,
}: {
    /** The dialog's title — this is the button's accessible name. */
    label: string
    onPress: () => void
    /**
     * 16 beside a fee row, 20 in an option card's corner — legacy's own two sizes. `IconSize` is a
     * fixed DS scale, so legacy's 14 is not available; the target stays 20/24 either way.
     */
    iconSize?: 16 | 20
    testId?: string
    className?: string
}) {
    return (
        <Button
            data-testid={testId}
            variant="ghost"
            size="small"
            iconOnly
            aria-label={label}
            onClick={event => {
                event.stopPropagation()
                event.preventDefault()
                onPress()
            }}
            className={cn(
                'flex-none p-0 text-(--icon-secondary) hover:not-disabled:bg-transparent hover:not-disabled:text-(--text-title)',
                iconSize === 20 ? 'size-6' : 'size-5',
                className,
            )}
        >
            <Icon name="question-circle" size={iconSize} />
        </Button>
    )
}
