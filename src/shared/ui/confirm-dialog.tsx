'use client'

import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import { Loader } from '@shared/ui/loader'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@shared/ui/dialog'

/**
 * "Are you sure?" — the DS `Dialog` in its `confirm` shape (Figma 50:15797): title,
 * one line of consequence, and two buttons side by side.
 *
 * Cancel comes **first** in the DOM, so it is what focus and the Escape key land on. The
 * dialog exists to make the destructive answer deliberate; putting the confirm button
 * under the returning focus would undo that.
 *
 * `pending` disables both buttons rather than only the confirm one — the action is already
 * running, and letting Cancel be pressed would suggest it can still be called off.
 *
 * ## ⚠ `pending` also **draws** the wait, which it did not
 *
 * It only greyed the two buttons out. On anything with a round trip behind it — and this dialog's
 * callers include a Stripe checkout, a payout, a subscription cancel — the reader pressed *Yes* and
 * got two dead buttons with nothing moving, for as long as the network took. Indistinguishable from
 * a dialog that had stopped working, and the reported symptom was exactly that: "why is there no
 * loading?".
 *
 * So the confirm button gets the DS's own working indicator beside its label, which is this app's
 * established composition for a busy button (`identity-intro`, `pay-with-card-panel`,
 * `follow-request-row`, `blocked-account-row` — `Button` has no `loading` prop and `Loader`'s own doc
 * says to put it inside one). **The label is not replaced**: swapping it for "Loading…" moves the
 * text, changes the button's width mid-press, and loses the one word that says what is happening.
 *
 * `[&>span]:bg-current` on the dots because `--opacity-labels-55` is a translucent near-black —
 * correct on a page, invisible on a filled accent or destructive button. `currentColor` there is the
 * button's own ink.
 *
 * Cancel gets none: one thing is running, and a spinner on the button that is *not* doing it would
 * say the opposite.
 *
 * ## `testId` is one prop, and the five parts derive from it
 *
 * This is the one component in `shared/ui` given a testid prop rather than merely forwarding one,
 * because its prop list is closed: the two buttons it renders cannot be reached from a call site at
 * all. It is defensible here for the reason the header already states — it is not its own Figma
 * node but the DS `Dialog` in a shape, and it holds `useTranslation`, which no true port does.
 *
 * `testId="channel-unpublish"` yields `-title`, `-description`, `-cancel`, `-confirm`, and
 * `-overlay` from `DialogContent`. Four `*TestId` props would be four things a caller forgets
 * silently, and four unrelated strings in the catalog with nothing marking them as one dialog.
 * A caller cannot name a sub-part itself; that is the point. `pending` is read off `disabled` on
 * both buttons — state never goes in an id (`docs/TEST_IDS.md`).
 */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel,
    cancelLabel,
    onConfirm,
    pending,
    destructive,
    testId,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description?: string
    confirmLabel: string
    cancelLabel?: string
    onConfirm: () => void
    pending?: boolean
    destructive?: boolean
    /** Base `data-testid`; sub-parts derive. See the note above. */
    testId?: string
}) {
    const { t } = useTranslation()

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid={testId}>
                <DialogHeader>
                    <DialogTitle data-testid={subTestId(testId, 'title')}>{title}</DialogTitle>
                    {description && (
                        <DialogDescription data-testid={subTestId(testId, 'description')}>
                            {description}
                        </DialogDescription>
                    )}
                </DialogHeader>
                <DialogFooter layout="side-by-side">
                    <Button
                        variant="secondary"
                        size="large"
                        disabled={pending}
                        data-testid={subTestId(testId, 'cancel')}
                        onClick={() => onOpenChange(false)}
                    >
                        {cancelLabel ?? t('common_cancel')}
                    </Button>
                    <Button
                        variant={destructive ? 'destructive' : 'accent'}
                        size="large"
                        disabled={pending}
                        /*
                         * `aria-busy` rather than a live region: the button is already disabled and
                         * named, so what is missing for a screen reader is only that it is *working*.
                         * `Loader` itself is `aria-hidden` here (no `label`), so it is not announced
                         * twice.
                         */
                        aria-busy={pending || undefined}
                        data-testid={subTestId(testId, 'confirm')}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                        {pending && <Loader className="size-5 [&>span]:bg-current" />}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
