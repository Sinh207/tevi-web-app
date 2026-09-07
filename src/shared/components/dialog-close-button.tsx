'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { cn } from '@shared/lib/utils'
import { Button } from '@shared/ui/button'
import { DialogClose } from '@shared/ui/dialog'
import { Icon } from '@shared/ui/icon'

/**
 * The dismiss control on a dialog **card** — a glyph at the trailing edge, not a footer button.
 *
 * The DS `Dialog` (50:15797) draws no close affordance at all, so this is app-authored, and the
 * placement rule that goes with it is a product rule rather than a port:
 *
 * - **A card** (the DS shell, title centred or ranged left) puts the glyph at the **trailing** edge —
 *   this component.
 * - **A dialog that is really a screen** — `p-0` plus a 56/60px title band, i.e. a legacy
 *   full-screen or drawer ported into a popup — puts it at the **leading** edge, because that band is
 *   the mobile app bar and its start slot is where back/close lives. `StarPurchaseDialog` is the
 *   reason it has to be that way round and not merely convention: the *same* slot carries
 *   `angle-left` when there is a step to go back to and `xmark` at the root step, so moving the close
 *   to the trailing edge would split one control into two.
 *
 * Both edges are logical (`end-*` / `start-*`), so "right" and "left" are leading/trailing and mirror
 * under RTL without a variant. Full rule: `docs/DESIGN_SYSTEM.md` §7.
 *
 * ## Why a glyph rather than a `Close` button
 *
 * A full-width primary button is the shape of an *action*, and on a dialog that only explains
 * something there is no decision to take — pressing it means "I have read this". Given a fee
 * explanation of two sentences, that button ends up taller than a third of the dialog and heavier than
 * the content it serves.
 *
 * Legacy goes the other way and ships **no** dismiss control at all: its help dialogs close on a
 * backdrop press or Escape. That is worse for a touch reader, who has no way to see how to leave.
 *
 * So: **informational dialog → this glyph. Dialog with a decision in it → a real button**, because
 * pressing that one *is* the decision (confirm, pay, pick a currency).
 *
 * ## 40px, not 32
 *
 * The glyph is 20 and the target is 40 — the same box `BarIconButton` uses, and the smallest thing this
 * app asks a thumb to hit. A 32px control reads fine on a desktop pointer and is a miss on a phone.
 *
 * `size="large"` and not `small`, for the glyph rather than the box: `Button`'s size variant sizes any
 * `svg` that carries no `size-*` class of its own, and that class beats `Icon`'s `width`/`height`
 * **attributes** — so under `small` this drew a 16px `xmark` (`size-4`) while the JSX said 20 and this
 * paragraph said 40/20. `large` is `size-5`. Either way `size-10` below overrides the variant's own
 * width and height, which is exactly how `BarIconButton` is built.
 * Four dialogs hand-rolled their own 32px disc from the same copy-pasted class string
 * (`LoginDialog`, `GetAppDialog`, `AccountSwitcherDialog`, `NotificationFilterDialog`) before this
 * component reached them; a corner affordance nobody owns is a corner affordance that drifts.
 *
 * Those four position it absolutely, and the inset that keeps the *glyph* where it already sat is
 * `end-2 top-2`: the target grew outward into the dialog's own `p-6`, which is the same trick the
 * in-flow callers pull with `-me-2 -mt-2`.
 *
 * ## `onClose` is optional
 *
 * Omit it and the button renders through base-ui's `DialogClose`, which dismisses the dialog itself —
 * what the four hand-rolled ones did, and the right shape whenever the dialog has no side effect to
 * run on the way out. Pass it when the caller owns the open state or has cleanup to do (every payout
 * and help dialog here does).
 */
export function DialogCloseButton({
    onClose,
    className,
    'data-testid': testId,
}: {
    onClose?: () => void
    className?: string
    'data-testid'?: string
}) {
    const { t } = useTranslation()

    return (
        <Button
            variant="ghost"
            size="large"
            iconOnly
            aria-label={t('common_close')}
            /*
             * `render` only when there is no `onClose`: base-ui merges this Button's props onto the
             * element, so `DialogClose` gets the geometry and keeps its own dismissal. With an
             * `onClose` the caller is the one closing, and a `DialogClose` underneath would also
             * close — harmless today, wrong the moment a caller wants to *refuse* a dismissal.
             */
            render={onClose ? undefined : <DialogClose />}
            /*
             * Stated, not derived: `rendersNativeButton` can only inspect a plain element, and
             * `DialogClose` is a component — so it returns `undefined` and base-ui decides this is a
             * non-native button, adds `role="button"`, and logs that the rendered `<button>`
             * contradicts it. `DialogClose` does render a native button, and so does the `onClose`
             * branch, so the answer is true on both paths.
             */
            nativeButton
            onClick={onClose}
            data-testid={testId}
            className={cn(
                // `rounded-full`, matching `BarIconButton` — the ghost background only shows on
                // hover, and a disc is what a close glyph reads as.
                'size-10 shrink-0 rounded-full text-(--icon-default)',
                className,
            )}
        >
            <Icon name="xmark" size={20} />
        </Button>
    )
}
