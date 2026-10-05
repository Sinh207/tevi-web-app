'use client'

import { StarMark } from '@shared/components/star-mark'
import { useTranslation } from '@shared/i18n/use-translation'
import { subTestId } from '@shared/lib/test-id'
import { Button } from '@shared/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@shared/ui/dialog'
import type { PostUnlockFlow } from '../hooks/use-post-unlock'

/**
 * The two dialogs a locked post can raise — legacy's `ConfirmPurchasePost` and `UnlockThisPost`.
 *
 * ## Why one component and not two files
 *
 * They are one machine with two faces, driven by one `step`, and every consumer that mounts one
 * mounts the other — the `choose` dialog's own Star button moves to `confirm`. Two components would
 * be two imports, two pieces of state to thread, and one more chance for a caller to mount the
 * first and forget the second, which fails as a button that does nothing.
 *
 * The **third** of legacy's dialogs is deliberately absent: `NotEnoughStars` does not exist here
 * because `useRequireStars` already opens the Star purchase sheet with the gap known, in place,
 * without leaving the feed. Legacy's dialog is a dead end that tells the reader a fact and closes.
 *
 * ## `become-a-member` raises nothing
 *
 * It navigates. `usePostUnlock` says why: a page of tiers with prices and terms is a better answer
 * than a popup over a post the reader cannot read, and it is where legacy's own modal sourced its
 * content from anyway.
 *
 * ## Neither dialog renders without a price
 *
 * `postUnlockPrice` answers `null` for a gated post whose payload carries no usable price, and a
 * confirmation that says "unlock for" with a blank after it is legacy's actual shipped bug — its
 * fallback string has no `[%s]` placeholder, so `.replace()` finds nothing and the price never
 * appears. Here the absence closes the dialog instead of printing a sentence with a hole in it.
 */
export function PostUnlockDialogs({
    flow,
    testId = 'post-unlock',
}: {
    flow: PostUnlockFlow
    testId?: string
}) {
    const { t, currentLanguage } = useTranslation()
    const { step, price, dismiss, choosePurchase, chooseMembership, confirm, isPurchasing } = flow

    if (step === 'idle' || price === null) return null

    const priceText = new Intl.NumberFormat(currentLanguage).format(price)

    if (step === 'choose') {
        return (
            <Dialog open onOpenChange={dismiss}>
                <DialogContent className="w-[420px]" data-testid={testId}>
                    <DialogHeader>
                        <DialogTitle data-testid={subTestId(testId, 'title')}>
                            {t('post_unlock_title')}
                        </DialogTitle>
                        <DialogDescription data-testid={subTestId(testId, 'description')}>
                            {t('post_unlock_choose_body', { price: priceText })}
                        </DialogDescription>
                    </DialogHeader>

                    {/*
                     * Stacked full-width, membership first — legacy's order, and the right one: the
                     * membership is the offer the creator would rather the reader took, and it is
                     * the one that survives past this post. Two side-by-side buttons would make them
                     * look like a choice between equals of the same weight.
                     */}
                    <div className="flex flex-col gap-2">
                        <Button
                            data-testid={subTestId(testId, 'option')}
                            variant="accent"
                            size="large"
                            fullWidth
                            onClick={chooseMembership}
                        >
                            {t('post_unlock_join_membership')}
                        </Button>
                        <Button
                            data-testid={subTestId(testId, 'next')}
                            variant="secondary"
                            size="large"
                            fullWidth
                            onClick={choosePurchase}
                        >
                            <span className="flex items-center gap-1">
                                {t('post_unlock_purchase_access', { price: priceText })}
                                <StarMark size={16} />
                            </span>
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Dialog open onOpenChange={dismiss}>
            <DialogContent className="w-[420px]" data-testid={testId}>
                <DialogHeader>
                    <DialogTitle data-testid={subTestId(testId, 'title')}>
                        {t('post_unlock_title')}
                    </DialogTitle>
                    <DialogDescription data-testid={subTestId(testId, 'description')}>
                        {t('post_unlock_confirm_body', { price: priceText })}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex min-w-0 items-center justify-end gap-3">
                    <Button
                        data-testid={subTestId(testId, 'cancel')}
                        variant="secondary"
                        size="large"
                        disabled={isPurchasing}
                        onClick={dismiss}
                    >
                        {t('common_cancel')}
                    </Button>
                    <Button
                        data-testid={subTestId(testId, 'confirm')}
                        variant="accent"
                        size="large"
                        disabled={isPurchasing}
                        onClick={confirm}
                    >
                        <span className="flex items-center gap-1">
                            {t('post_unlock_purchase_access', { price: priceText })}
                            <StarMark size={16} />
                        </span>
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
