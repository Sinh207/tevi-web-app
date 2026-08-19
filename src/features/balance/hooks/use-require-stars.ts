'use client'

import { useRequireAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { formatStarAmount } from '@shared/lib/money'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { useBalance } from '../providers/balance-provider'

/**
 * Guard an action behind having enough Star.
 *
 * ```tsx
 * const requireStars = useRequireStars()
 * <Button onClick={requireStars(gift.price, () => sendGift(gift))}>Send</Button>
 * ```
 *
 * ## Deliberately the same shape as `useRequireAuth`
 *
 * A hook returning a wrapper that either runs the callback or diverts. That is the app's existing
 * idiom for "this action has a precondition", and the two compose — because they are the same two
 * preconditions, in order: **you must be signed in, and you must be able to afford it.** Every price
 * in the app is behind both, so this wraps `requireAuth` rather than making each call site remember
 * to.
 *
 * The ordering matters and is not arbitrary: a guest has no balance, so checking affordability first
 * would show "you need 500 more Star" to somebody whose actual problem is that they are not signed in.
 *
 * ## Gate the **action**, never the route
 *
 * `docs/DEFINITION_OF_DONE.md` §3, and the same reason `useRequireAuth` opens a dialog instead of
 * redirecting: whatever the reader was doing stays on screen. Pressing a gift they cannot afford
 * should offer them Star, not navigate them out of the live stream they were watching.
 *
 * ## What happens when they cannot afford it
 *
 * Today: a toast naming the shortfall. That is the honest placeholder, and it is **one line** from
 * being the real thing — `/get-star` does not exist yet (buying Star is a later pass), so opening a
 * purchase sheet here would open nothing.
 *
 * When it lands, the `onInsufficient` branch below becomes `openStarPurchase(shortfall)` and nothing
 * else in this file changes — and, more to the point, nothing at any call site changes. That is why
 * the divert lives here rather than being a boolean each caller branches on: there will be a dozen
 * prices in this app, and the day the purchase flow ships should not be a dozen edits.
 *
 * A caller that needs to render its own affordability *state* — a price shown in red, a disabled
 * button — should read `hasEnoughStars` from `useBalance()` directly. This hook is for the press.
 */
export function useRequireStars() {
    const { t } = useTranslation()
    const { hasEnoughStars, starShortfall, isKnown, refresh } = useBalance()
    const requireAuth = useRequireAuth()

    return useCallback(
        <A extends unknown[]>(cost: number, cb: (...args: A) => void) =>
            requireAuth((...args: A) => {
                if (hasEnoughStars(cost)) {
                    cb(...args)
                    return
                }
                /*
                 * Not known yet — which for a signed-in account means the request is still in flight
                 * or it failed. Neither is "you cannot afford this", so the reader is not told that.
                 * A refresh is kicked off so a second press has a real answer, and the message says
                 * what is actually true.
                 */
                if (!isKnown) {
                    void refresh()
                    toast.error(t('balance_unknown_retry'))
                    return
                }
                /*
                 * ⚠ The single line that becomes the purchase sheet. Everything else in this feature
                 * is already in place for it: `starShortfall` is the amount to pre-select, and
                 * `refresh` is what the sheet calls on success.
                 */
                toast.error(
                    t('balance_insufficient_stars', {
                        amount: formatStarAmount(starShortfall(cost)),
                    }),
                )
            }),
        [requireAuth, hasEnoughStars, starShortfall, isKnown, refresh, t],
    )
}
