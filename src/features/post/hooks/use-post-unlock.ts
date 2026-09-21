'use client'

import { useAuth } from '@features/auth'
import { balanceKeys, useRequireStars } from '@features/balance'
import { channelActionPath } from '@features/channel/routes'
import { useTranslation } from '@shared/i18n/use-translation'
import { ApiError } from '@shared/lib/api/errors'
import { eventBus } from '@shared/lib/event-bus'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { INSUFFICIENT_STARS_CODE, postApi, postKeys } from '../api/post-api'
import type { Post } from '../api/types'
import { postIntent, postUnlockPrice } from '../lib/post-intent'

/**
 * Was the purchase refused for want of Star?
 *
 * Both halves are checked. The **code** alone is not enough — `EC0001` is a commerce code and
 * nothing promises it is unique across statuses — and the **status** alone is far too wide: a 422
 * from this endpoint is any validation failure, and treating every one of them as "top up" would
 * offer a reader Star to fix a malformed product id.
 */
function isInsufficientStars(error: unknown): boolean {
    return (
        error instanceof ApiError && error.status === 422 && error.code === INSUFFICIENT_STARS_CODE
    )
}

/**
 * Ask whatever is listening to open the Star purchase sheet for a shortfall.
 *
 * The **whole price**, not a computed gap: this path is reached when the server refused, so the
 * client's idea of the balance is exactly the thing that turned out to be wrong, and subtracting it
 * would offer the reader a top-up that is too small. `useRequireStars` can compute a real gap
 * because it is trusting a balance it has just read; here nothing is trustworthy but the price.
 *
 * The event rather than an import for the reason `event-bus.ts` states at its declaration:
 * `features/payment` imports `features/balance`, so calling into it from a feature below would
 * close a barrel cycle. A screen with nothing listening — a `/app/*` webview — simply gets no
 * sheet, and the mutation's own error toast is what the reader sees instead.
 */
function topUp(amount: number) {
    eventBus.emit('payment:star-purchase-requested', { shortfall: amount, ack: () => {} })
}

/**
 * Getting past a post's paywall — the press, the confirmation, and the charge.
 *
 * This is legacy's `handleOpenUnlockThisPost` + `handlePostPurchase`, which between them are 70
 * lines spread over two callbacks and four pieces of dialog state in a third file. The branching
 * itself lives in `lib/post-intent.ts` as a pure function; what is here is everything that needs a
 * hook: the balance gate, the mutation, the dialog the mutation is confirmed in, and the navigation
 * the membership route takes.
 *
 * ```tsx
 * const unlock = usePostUnlock(post)
 * <button onClick={unlock.press}>…</button>
 * <PostUnlockDialogs flow={unlock} />
 * ```
 *
 * ## `@features/channel/routes`, and not `@features/channel`
 *
 * Becoming a member is a **navigation to the space's membership page**, so this needs to build that
 * URL — and `features/post` may not import `features/channel`, whose dependency on this feature
 * runs the other way. `routes.ts` is one of the four narrower barrels `CLAUDE.md` sanctions for
 * exactly this, and it is import-free, so nothing is closed by reading it. The alternative —
 * calling `features/membership`'s join flow directly — would reach `features/channel` transitively
 * and close the cycle for real.
 *
 * The cost of the navigation over a dialog is one page load; the benefit is that the reader lands
 * on the tier list with prices and terms rather than in a popup over a post they cannot read. That
 * is also where legacy's `becomeAMember` modal gets its content from, so nothing is lost.
 *
 * ## The balance is checked **before** the request, and the 422 is still handled
 *
 * `useRequireStars` gates the press: a reader who cannot afford it is offered Star without leaving
 * the feed, which is what legacy's `handleSetOpenNotEnoughStars(true)` does with a dialog of its
 * own. The `422 EC0001` branch below is not a duplicate of that check — it is the window between
 * the check and the charge, in which another tab can have spent the Star. Without it, that case
 * surfaces as a generic failure and the reader is never offered the top-up that would fix it.
 *
 * ## Confirming is not optional and the dialog is not decoration
 *
 * Star is money. Legacy asks before spending it (`ConfirmPurchasePost`) and so does this — the
 * press opens a dialog, and only the dialog's button charges. The one intent that does **not** ask
 * is `become-a-member`, because navigating to a page of prices commits nothing.
 */
export type PostUnlockStep = 'idle' | 'confirm' | 'choose'

export function usePostUnlock(post: Post, { onUnlocked }: { onUnlocked?: () => void } = {}) {
    const { activeId } = useAuth()
    const { t } = useTranslation()
    const router = useRouter()
    const requireStars = useRequireStars()
    const queryClient = useQueryClient()

    const [step, setStep] = useState<PostUnlockStep>('idle')

    const intent = postIntent(post)
    const price = postUnlockPrice(post)

    const purchase = useMutation({
        mutationFn: () => {
            const productId = post.product_id
            /*
             * Unreachable from the UI — `postIntent` only answers `purchase`/`choose` when
             * `product_id` is set — and thrown rather than silently resolved so a future caller
             * that reaches this hook another way fails loudly instead of showing a success toast
             * for a request never made.
             */
            if (!productId) throw new Error('post has no product_id')
            return postApi.purchasePost(productId, activeId)
        },
        onSuccess: () => {
            setStep('idle')
            toast.success(t('post_unlock_success'))
            /*
             * Two invalidations because two things changed: the reader has less Star, and the post
             * is no longer locked. The second is what actually reveals the content — `viewer` and
             * `need_unlock_package` are recomputed by the backend, and no client-side guess about
             * their new values would be safe to write into a cache.
             */
            void queryClient.invalidateQueries({ queryKey: balanceKeys.all })
            void queryClient.invalidateQueries({ queryKey: postKeys.all })
            onUnlocked?.()
        },
        onError: error => {
            /*
             * "Not enough Star" is an **offer**, not a failure, so it does not become a toast — a
             * toast is where an offer goes to be ignored. The dialog stays open and the reader is
             * shown the top-up sheet with the gap already known, which is the same place
             * `useRequireStars` would have sent them had the balance been stale at the press.
             *
             * `queryClient`'s error toast is suppressed for this one case by rethrowing nothing:
             * `meta.showErrorToast` fires on every error, so the branch is expressed as a *second*
             * signal rather than by removing the meta — the reader gets the sheet, and the toast
             * beside it says the same thing in one line. Collapsing that is B107's call, once the
             * backend confirms the code is stable.
             */
            if (isInsufficientStars(error) && price !== null) {
                setStep('idle')
                topUp(price)
            }
        },
        /**
         * The API's own sentence wins on a 4xx; ours is the fallback (`docs/API_ERRORS.md`).
         */
        meta: { showErrorToast: t('post_unlock_failed') },
    })

    /**
     * Open whatever this post's paywall actually leads to.
     *
     * The `requireStars` wrapper is applied only on the two intents that spend Star; `choose` is
     * gated too, because both of its routes start from a reader who is either paying or joining,
     * and a guest pressing it should be asked to sign in rather than shown a dialog with two dead
     * buttons.
     */
    function open() {
        if (intent === 'become-a-member') {
            const slug = post.channel?.slug
            // No slug, no page to send them to. Legacy would navigate to `/@/membership`.
            if (!slug) return
            router.push(channelActionPath(slug, 'become_a_member'))
            return
        }
        if (intent === 'purchase') {
            setStep('confirm')
            return
        }
        if (intent === 'choose') setStep('choose')
    }

    /*
     * `price ?? 0` and never a guess: `postUnlockPrice` answers `null` for a gated post whose price
     * the payload does not carry, and a `0` cost makes `requireStars` wave the press straight
     * through to a confirmation that names no price — which is the state `PostLockPanel`'s own note
     * calls out as legacy's bug. The dialog refuses to render its confirm button without a price,
     * so the flow stops there rather than charging an amount nobody agreed to.
     */
    const press = intent === 'become-a-member' ? open : requireStars(price ?? 0, open)

    return {
        /** What the press will do — `'none'` means the post is not gated for this reader. */
        intent,
        /** The Star price, or `null` when the route in is not a purchase. */
        price,
        /** Which dialog is open, if any. */
        step,
        /** The press. Gated on sign-in, and on affordability where Star is involved. */
        press,
        /** Close whatever dialog is open. */
        dismiss: () => setStep('idle'),
        /** Move from the two-route dialog to the purchase confirmation. */
        choosePurchase: () => setStep('confirm'),
        /** Leave for the space's membership page. */
        chooseMembership: () => {
            const slug = post.channel?.slug
            if (!slug) return
            setStep('idle')
            router.push(channelActionPath(slug, 'become_a_member'))
        },
        /** Charge the Star. Only the confirmation dialog's button calls this. */
        confirm: () => purchase.mutate(),
        isPurchasing: purchase.isPending,
    }
}

export type PostUnlockFlow = ReturnType<typeof usePostUnlock>
