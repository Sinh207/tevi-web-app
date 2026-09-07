'use client'

import { useRequireAuth } from '@features/auth'
import { useTranslation } from '@shared/i18n/use-translation'
import { eventBus } from '@shared/lib/event-bus'
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
 * The purchase **sheet**, opened with the gap already known — not a navigation to `/get-star`, even
 * though that page exists. The whole point of this hook is that whatever the reader was doing is still
 * there when they come back: a gift pressed during a livestream must not close the livestream. The page
 * is for the presses that *are* navigations (the `+` in the top bar, the *Get Star* row on `/my-star`),
 * and both surfaces run the same flow — see `features/payment/routes.ts`.
 *
 * The toast below is the fallback for where no sheet can open, and it is still reached: see the branch
 * itself. The divert lives here rather than being a boolean each caller branches on because there will
 * be a dozen prices in this app, and the day the purchase flow changes should not be a dozen edits.
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
                 * The purchase sheet, opened by announcing the gap rather than by calling into
                 * `features/payment` — which would close a cycle between the two barrels (the payment
                 * feature imports this one). The event's own doc in `event-bus.ts` states that.
                 *
                 * The toast stays as the **fallback**: `PaymentProvider` is mounted by
                 * `(web)/layout.tsx`, so a surface rendered outside it — a `/app/*` webview, where card
                 * payment is deliberately absent — has nothing listening. `mitt` returns no listener
                 * count, so the toast is raised only when the emit is *not* handled, which the provider
                 * reports by flipping a flag on the bus payload. Simpler and honest: emit, and if
                 * nothing opened, say what is missing.
                 */
                const shortfall = starShortfall(cost)
                let opened = false
                eventBus.emit('payment:star-purchase-requested', {
                    shortfall,
                    ack: () => {
                        opened = true
                    },
                })
                if (!opened) {
                    toast.error(
                        t('balance_insufficient_stars', {
                            amount: formatStarAmount(shortfall),
                        }),
                    )
                }
            }),
        [requireAuth, hasEnoughStars, starShortfall, isKnown, refresh, t],
    )
}
